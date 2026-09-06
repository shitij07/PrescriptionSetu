/**
 * Twilio Sandbox Message Provider Unit Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 6, `docs/DECISIONS.md` D-030, `SAFETY_INVARIANTS.md` SI-16.
 */

import { TwilioSandboxProvider, type TwilioHttpTransport } from '../../src/delivery/twilio-sandbox-provider';
import type { ReminderPayload } from '../../src/domain/types';

describe('TwilioSandboxProvider', () => {
  const validRenderedPayload: ReminderPayload = {
    type: 'rendered_text',
    body: 'नमस्कार, गोळी घेण्याची वेळ झाली आहे.',
    language: 'mr',
  };

  it('successfully dispatches rendered_text message via injected HTTP transport', async () => {
    const mockTransport: TwilioHttpTransport = jest.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({
        sid: 'SM_SANDBOX_TEST_12345',
        status: 'queued',
      }),
    });

    const provider = new TwilioSandboxProvider({
      accountSid: 'AC_TEST_ACCOUNT',
      authToken: 'AUTH_TEST_TOKEN',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validRenderedPayload);

    expect(result).toEqual({
      success: true,
      provider_message_id: 'SM_SANDBOX_TEST_12345',
    });

    expect(mockTransport).toHaveBeenCalledTimes(1);
    const [url, options] = (mockTransport as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_TEST_ACCOUNT/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toContain('Basic '); // Basic auth header
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Parse URL-encoded body
    const params = new URLSearchParams(options.body);
    expect(params.get('From')).toBe('whatsapp:+14155238886');
    expect(params.get('To')).toBe('whatsapp:+919876543210');
    expect(params.get('Body')).toBe('नमस्कार, गोळी घेण्याची वेळ झाली आहे.');
  });

  it('normalizes destination numbers without double-prefixing', async () => {
    const mockTransport: TwilioHttpTransport = jest.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ sid: 'SM_123', status: 'queued' }),
    });

    const provider = new TwilioSandboxProvider({
      accountSid: 'AC_TEST',
      authToken: 'AUTH_TEST',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    // Case 1: already fully prefixed with 'whatsapp:+'
    await provider.sendMessage('whatsapp:+919876543210', validRenderedPayload);
    let params = new URLSearchParams((mockTransport as jest.Mock).mock.calls[0][1].body);
    expect(params.get('To')).toBe('whatsapp:+919876543210');

    // Case 2: prefixed with 'whatsapp:' but no '+'
    await provider.sendMessage('whatsapp:919876543210', validRenderedPayload);
    params = new URLSearchParams((mockTransport as jest.Mock).mock.calls[1][1].body);
    expect(params.get('To')).toBe('whatsapp:+919876543210');

    // Case 3: raw number with '+'
    await provider.sendMessage('+919876543210', validRenderedPayload);
    params = new URLSearchParams((mockTransport as jest.Mock).mock.calls[2][1].body);
    expect(params.get('To')).toBe('whatsapp:+919876543210');

    // Case 4: raw number without '+'
    await provider.sendMessage('919876543210', validRenderedPayload);
    params = new URLSearchParams((mockTransport as jest.Mock).mock.calls[3][1].body);
    expect(params.get('To')).toBe('whatsapp:+919876543210');
  });

  it('rejects template payloads with structured error (Sandbox supports rendered_text only)', async () => {
    const mockTransport = jest.fn();
    const provider = new TwilioSandboxProvider({
      accountSid: 'AC_TEST',
      authToken: 'AUTH_TEST',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    const templatePayload: ReminderPayload = {
      type: 'template',
      template_name: 'medication_reminder',
      language: 'mr',
      variables: ['Metformin', '1 tab', '08:00 AM'],
    };

    const result = await provider.sendMessage('+919876543210', templatePayload);

    expect(result).toEqual({
      success: false,
      error_code: 'SANDBOX_TEMPLATE_UNSUPPORTED',
    });
    expect(mockTransport).not.toHaveBeenCalled();
  });

  it('returns structured failure when Twilio returns HTTP 4xx/5xx errors', async () => {
    const mockTransport: TwilioHttpTransport = jest.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({
        code: 21608,
        message: 'The number is unverified. Trial accounts cannot send messages to unverified numbers.',
      }),
    });

    const provider = new TwilioSandboxProvider({
      accountSid: 'AC_TEST',
      authToken: 'AUTH_TEST',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validRenderedPayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TWILIO_API_ERROR_21608',
    });
  });

  it('returns structured network error when HTTP transport throws', async () => {
    const mockTransport: TwilioHttpTransport = jest.fn().mockRejectedValue(new Error('Connection reset'));

    const provider = new TwilioSandboxProvider({
      accountSid: 'AC_TEST',
      authToken: 'AUTH_TEST',
      from: 'whatsapp:+14155238886',
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validRenderedPayload);

    expect(result).toEqual({
      success: false,
      error_code: 'TWILIO_NETWORK_ERROR',
    });
  });

  it('gracefully handles missing credentials configuration with MISSING_CONFIGURATION code', async () => {
    const mockTransport = jest.fn();
    const provider = new TwilioSandboxProvider({
      accountSid: undefined,
      authToken: undefined,
      from: undefined,
      transport: mockTransport,
    });

    const result = await provider.sendMessage('+919876543210', validRenderedPayload);

    expect(result).toEqual({
      success: false,
      error_code: 'MISSING_CONFIGURATION',
    });
    expect(mockTransport).not.toHaveBeenCalled();
  });
});
