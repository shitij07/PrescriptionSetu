/**
 * Twilio Production Message Provider Unit Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-16.
 */

import { TwilioProductionProvider, type TwilioProductionHttpTransport } from '../../src/delivery/twilio-production-provider';
import type { ReminderPayload } from '../../src/domain/types';

describe('TwilioProductionProvider', () => {
  const validTemplatePayload: ReminderPayload = {
    type: 'template',
    template_name: 'medication_reminder_v1',
    language: 'mr',
    variables: ['Metformin 500mg', '1 tab', '08:00 AM'],
  };

  it('successfully dispatches template message via Twilio Content API format with ordered variables', async () => {
    const mockTransport: TwilioProductionHttpTransport = jest.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({
        sid: 'SM_PROD_TEST_998877',
        status: 'queued',
      }),
    });

    const provider = new TwilioProductionProvider({
      accountSid: 'AC_PROD_ACCOUNT',
      authToken: 'AUTH_PROD_TOKEN',
      from: 'whatsapp:+14155238886',
      contentSidMap: {
        medication_reminder_v1: 'HX_CONTENT_SID_123',
      },
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validTemplatePayload);

    expect(result).toEqual({
      success: true,
      provider_message_id: 'SM_PROD_TEST_998877',
    });

    expect(mockTransport).toHaveBeenCalledTimes(1);
    const [url, options] = (mockTransport as jest.Mock).mock.calls[0];
    expect(url).toContain('AC_PROD_ACCOUNT/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toContain('Basic ');

    const params = new URLSearchParams(options.body);
    expect(params.get('From')).toBe('whatsapp:+14155238886');
    expect(params.get('To')).toBe('whatsapp:+919876543210');
    expect(params.get('ContentSid')).toBe('HX_CONTENT_SID_123');

    // Verify ordered variables are preserved in ContentVariables JSON
    const contentVariables = JSON.parse(params.get('ContentVariables') || '{}');
    expect(contentVariables['1']).toBe('Metformin 500mg');
    expect(contentVariables['2']).toBe('1 tab');
    expect(contentVariables['3']).toBe('08:00 AM');
  });

  it('rejects rendered_text payloads with TEMPLATE_REQUIRED (Meta business requirement)', async () => {
    const mockTransport = jest.fn();
    const provider = new TwilioProductionProvider({
      accountSid: 'AC_PROD',
      authToken: 'AUTH_PROD',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    const renderedPayload: ReminderPayload = {
      type: 'rendered_text',
      body: 'Take your medication now',
      language: 'en',
    };

    const result = await provider.sendMessage('+919876543210', renderedPayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TEMPLATE_REQUIRED',
    });
    expect(mockTransport).not.toHaveBeenCalled();
  });

  it('returns structured failure when template is unmapped in contentSidMap', async () => {
    const mockTransport = jest.fn();
    const provider = new TwilioProductionProvider({
      accountSid: 'AC_PROD',
      authToken: 'AUTH_PROD',
      from: 'whatsapp:+14155238886',
      contentSidMap: {}, // empty map
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validTemplatePayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TEMPLATE_NOT_REGISTERED_medication_reminder_v1',
    });
    expect(mockTransport).not.toHaveBeenCalled();
  });

  it('returns structured failure when API returns HTTP 4xx/5xx error', async () => {
    const mockTransport: TwilioProductionHttpTransport = jest.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({
        code: 63016,
        message: 'Failed to send freeform message because outside the 24-hour window',
      }),
    });

    const provider = new TwilioProductionProvider({
      accountSid: 'AC_PROD',
      authToken: 'AUTH_PROD',
      from: 'whatsapp:+14155238886',
      contentSidMap: {
        medication_reminder_v1: 'HX_123',
      },
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validTemplatePayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TWILIO_PROD_API_ERROR_63016',
    });
  });

  it('returns structured network error when HTTP transport throws', async () => {
    const mockTransport: TwilioProductionHttpTransport = jest.fn().mockRejectedValue(new Error('Network timeout'));

    const provider = new TwilioProductionProvider({
      accountSid: 'AC_PROD',
      authToken: 'AUTH_PROD',
      from: 'whatsapp:+14155238886',
      contentSidMap: {
        medication_reminder_v1: 'HX_123',
      },
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validTemplatePayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TWILIO_PROD_NETWORK_ERROR',
    });
  });

  it('gracefully returns MISSING_CONFIGURATION when credentials are unset', async () => {
    const mockTransport = jest.fn();
    const provider = new TwilioProductionProvider({
      accountSid: undefined,
      authToken: undefined,
      from: undefined,
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validTemplatePayload);

    expect(result).toEqual({
      success: false,
      error_code: 'MISSING_CONFIGURATION',
    });
    expect(mockTransport).not.toHaveBeenCalled();
  });
});
