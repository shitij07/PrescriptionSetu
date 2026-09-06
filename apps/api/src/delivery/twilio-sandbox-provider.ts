/**
 * Twilio Sandbox Message Provider.
 * Dispatches rendered text reminders via Twilio WhatsApp Sandbox.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.8, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { MessageProvider, DeliveryResult } from './types';
import type { ReminderPayload } from '../domain/types';

export type TwilioHttpTransport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<any>;
}>;

export interface TwilioSandboxProviderOptions {
  accountSid?: string | undefined;
  authToken?: string | undefined;
  from?: string | undefined;
  endpointUrl?: string | undefined;
  transport?: TwilioHttpTransport | undefined;
}

export class TwilioSandboxProvider implements MessageProvider {
  private readonly accountSid?: string | undefined;
  private readonly authToken?: string | undefined;
  private readonly from: string;
  private readonly endpointUrl?: string | undefined;
  private readonly transport: TwilioHttpTransport;

  constructor(options: TwilioSandboxProviderOptions = {}) {
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.from = options.from || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    this.endpointUrl = options.endpointUrl;
    this.transport = options.transport || (typeof fetch !== 'undefined' ? (fetch as any) : undefined);
  }

  /**
   * Normalizes a phone number to standard Twilio WhatsApp recipient format: `whatsapp:+<e164_digits>`.
   */
  private normalizeWhatsAppDestination(destination: string): string {
    let clean = destination.trim();
    if (clean.startsWith('whatsapp:')) {
      clean = clean.slice('whatsapp:'.length);
    }
    if (!clean.startsWith('+')) {
      clean = `+${clean}`;
    }
    return `whatsapp:${clean}`;
  }

  async sendMessage(
    destination: string,
    payload: ReminderPayload,
  ): Promise<DeliveryResult> {
    if (payload.type !== 'rendered_text') {
      return {
        success: false,
        error_code: 'SANDBOX_TEMPLATE_UNSUPPORTED',
      };
    }

    if (!this.accountSid || !this.authToken || !this.from) {
      return {
        success: false,
        error_code: 'MISSING_CONFIGURATION',
      };
    }

    if (!this.transport) {
      return {
        success: false,
        error_code: 'NO_TRANSPORT_AVAILABLE',
      };
    }

    const url =
      this.endpointUrl ||
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const normalizedTo = this.normalizeWhatsAppDestination(destination);
    const authHeader = `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;

    const bodyParams = new URLSearchParams();
    bodyParams.append('From', this.from);
    bodyParams.append('To', normalizedTo);
    bodyParams.append('Body', payload.body);

    try {
      const response = await this.transport(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const twilioCode = errData?.code ? `_${errData.code}` : `_${response.status}`;
        return {
          success: false,
          error_code: `TWILIO_API_ERROR${twilioCode}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        provider_message_id: data?.sid || `twilio-${Date.now()}`,
      };
    } catch {
      return {
        success: false,
        error_code: 'TWILIO_NETWORK_ERROR',
      };
    }
  }
}
