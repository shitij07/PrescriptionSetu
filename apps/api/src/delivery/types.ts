/**
 * Delivery / MessageProvider Seam Types.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `PercriptionSetuMASTERPLAN.md` §18.8, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { ReminderPayload } from '../domain/types';

export interface DeliveryResult {
  success: boolean;
  provider_message_id?: string;
  error_code?: string;
}

/**
 * Pluggable provider seam for outbound WhatsApp/SMS notifications.
 * Implementations:
 * - `ConsoleProvider` for local tests and development.
 * - `TwilioSandboxProvider` for demo environments.
 * - `TwilioProductionProvider` for Meta-verified production environments.
 */
export interface MessageProvider {
  sendMessage(
    destination: string,
    payload: ReminderPayload,
  ): Promise<DeliveryResult>;
}
