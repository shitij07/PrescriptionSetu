/**
 * CORS Middleware Integration Tests.
 * Authoritative sources: `SAFETY_INVARIANTS.md`, `PercriptionSetuMASTERPLAN.md` §18.5.
 */

import request from 'supertest';
import express from 'express';
import { createCorsMiddleware } from '../../src/middleware/cors';

describe('CORS Middleware (createCorsMiddleware)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows requests from default dashboard origin http://localhost:3001 and sets CORS headers', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'http://localhost:3001');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(res.headers['vary']).toBe('Origin');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('allows requests from http://127.0.0.1:3001 as alternative local dev origin', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'http://127.0.0.1:3001');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3001');
  });

  it('handles preflight OPTIONS requests for allowed origin with 204 No Content', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options('/test')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('does NOT set Access-Control-Allow-Origin header for untrusted external origins', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://malicious-site.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports custom allowedOrigins via options object', async () => {
    const app = express();
    app.use(createCorsMiddleware({ allowedOrigins: ['https://custom-dashboard.org'] }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://custom-dashboard.org');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://custom-dashboard.org');
  });

  it('supports custom origins via ALLOWED_ORIGINS environment variable', async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:3001,https://staging-caregiver.org';
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://staging-caregiver.org');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://staging-caregiver.org');
  });
});
