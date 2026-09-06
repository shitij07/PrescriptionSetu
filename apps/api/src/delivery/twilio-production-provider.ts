/**
 * Twilio Production Message Provider Seam.
 * Dispatches registered Meta template messages via Twilio WhatsApp API.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { MessageProvider, DeliveryResult } from './types';
import type { ReminderPayload } from '../domain/types';

export type TwilioProductionHttpTransport = (
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

export interface TwilioProductionProviderOptions {
  accountSid?: string | undefined;
  authToken?: string | undefined;
  from?: string | undefined;
  endpointUrl?: string | undefined;
  contentSidMap?: Record<string, string> | undefined;
  transport?: TwilioProductionHttpTransport | undefined;
}

export class TwilioProductionProvider implements MessageProvider {
  private readonly accountSid?: string | undefined;
  private readonly authToken?: string | undefined;
  private readonly from: string;
  private readonly endpointUrl?: string | undefined;
  private readonly contentSidMap: Record<string, string>;
  private readonly transport: TwilioProductionHttpTransport;

  constructor(options: TwilioProductionProviderOptions = {}) {
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.from = options.from || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    this.endpointUrl = options.endpointUrl;
    this.contentSidMap = options.contentSidMap || {};
    this.transport = options.transport || (typeof fetch !== 'undefined' ? (fetch as any) : undefined);
  }

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
    // 1. Meta WhatsApp Business policy requirement (D-030): only pre-approved templates allowed
    if (payload.type !== 'template') {
      return {
        success: false,
        error_code: 'TEMPLATE_REQUIRED',
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

    // 2. Resolve Twilio Content SID from registered template name
    const contentSid = this.contentSidMap[payload.template_name];
    if (!contentSid) {
      return {
        success: false,
        error_code: `TEMPLATE_NOT_REGISTERED_${payload.template_name}`,
      };
    }

    const url =
      this.endpointUrl ||
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const normalizedTo = this.normalizeWhatsAppDestination(destination);
    const authHeader = `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;

    // Map ordered template variables to 1-indexed Twilio ContentVariables dictionary
    const contentVariables: Record<string, string> = {};
    if (Array.isArray(payload.variables)) {
      payload.variables.forEach((val, idx) => {
        contentVariables[String(idx + 1)] = String(val);
      });
    }

    const bodyParams = new URLSearchParams();
    bodyParams.append('From', this.from);
    bodyParams.append('To', normalizedTo);
    bodyParams.append('ContentSid', contentSid);
    bodyParams.append('ContentVariables', JSON.stringify(contentVariables));

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
          error_code: `TWILIO_PROD_API_ERROR${twilioCode}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        provider_message_id: data?.sid || `twilio-prod-${Date.now()}`,
      };
    } catch {
      return {
        success: false,
        error_code: 'TWILIO_PROD_NETWORK_ERROR',
      };
    }
  }
}
