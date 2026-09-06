/**
 * ConsoleMessageProvider for local testing and deterministic delivery emulation.
 * Authoritative source: `BUILD_ORDER.md` §4 Step 6.
 */

import type { MessageProvider, DeliveryResult } from './types';
import type { ReminderPayload } from '../domain/types';

export interface SentMessageLog {
  destination: string;
  payload: ReminderPayload;
  timestamp: Date;
}

export class ConsoleProvider implements MessageProvider {
  public readonly sentMessages: SentMessageLog[] = [];

  async sendMessage(destination: string, payload: ReminderPayload): Promise<DeliveryResult> {
    const timestamp = new Date();
    this.sentMessages.push({
      destination,
      payload,
      timestamp,
    });

    return {
      success: true,
      provider_message_id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}
