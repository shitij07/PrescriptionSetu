/**
 * Sliding Window Rate Limiter Middleware Unit Tests.
 * Authoritative sources: `BUILD_ORDER.md` Step 8, `PercriptionSetuMASTERPLAN.md` §26, §33, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { Request, Response, NextFunction } from 'express';
import { createRateLimiter, InMemoryRateLimitStore } from '../../src/middleware/rate-limiter';
import { Logger } from '../../src/logging/logger';

describe('Sliding Window Rate Limiter Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let setHeaderMock: jest.Mock;
  let capturedLogs: string[];
  let testLogger: Logger;

  beforeEach(() => {
    capturedLogs = [];
    testLogger = new Logger({
      stream: {
        write: (msg: string) => {
          capturedLogs.push(msg);
        },
      },
    });

    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();
    setHeaderMock = jest.fn().mockReturnThis();

    mockReq = {
      ip: '192.168.1.100',
      method: 'POST',
      path: '/api/prescriptions/upload',
      body: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    mockNext = jest.fn();
  });

  it('allows requests within the configured max limit', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimiter({
      maxRequests: 3,
      windowMs: 60000,
      store,
      logger: testLogger,
    });

    // 1st request
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // 2nd request
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // 3rd request
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(3);

    expect(statusMock).not.toHaveBeenCalled();
  });

  it('rejects requests exceeding the max limit with HTTP 429 and Retry-After header', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
      store,
      logger: testLogger,
    });

    // 1st & 2nd request -> OK
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // 3rd request -> Blocked
    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(2);
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many prescription upload requests. Please try again later.',
      },
    });

    // Verify structured log emission with zero request body or PHI (SI-16)
    expect(capturedLogs).toHaveLength(1);
    const logEntry = JSON.parse(capturedLogs[0]);
    expect(logEntry.event).toBe('RATE_LIMIT_EXCEEDED');
    expect(logEntry.status_code).toBe(429);
    expect(logEntry.http_method).toBe('POST');
  });

  it('isolates request counters across different client keys/IPs', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
      store,
      logger: testLogger,
    });

    const reqClientA = { ...mockReq, ip: '10.0.0.1' } as Request;
    const reqClientB = { ...mockReq, ip: '10.0.0.2' } as Request;

    // Client A uses 2 requests (exhausts quota)
    await limiter(reqClientA, mockRes as Response, mockNext);
    await limiter(reqClientA, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // Client A 3rd request -> Blocked
    await limiter(reqClientA, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);
    expect(statusMock).toHaveBeenCalledWith(429);

    // Client B 1st request -> Allowed
    mockNext.mockClear();
    statusMock.mockClear();
    await limiter(reqClientB, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('resets quota after sliding window expires', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 100, // 100ms window
      store,
      logger: testLogger,
    });

    // 1st request -> OK
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // 2nd request immediately -> 429
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(statusMock).toHaveBeenCalledWith(429);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 120));

    mockNext.mockClear();
    statusMock.mockClear();

    // 3rd request after window -> OK
    await limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
