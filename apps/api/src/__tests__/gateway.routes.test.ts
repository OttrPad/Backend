import express from 'express';
import request from 'supertest';

// Mock auth middleware to bypass
jest.mock('../middleware/auth.middleware', () => ({
  verifySupabaseJWT: (req: any, res: any, next: any) => next(),
}));

import gatewayRouter from '../routes/gateway.routes';
import * as proxyModule from '../services/proxy.service';

describe('gateway routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', gatewayRouter);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /api/rooms proxies to core /rooms', async () => {
    const spy = jest.spyOn(proxyModule.serviceProxy, 'proxyRequest').mockImplementationOnce((async (service: any, path: any, req: any, res: any) => {
      res.status(201).json({ message: 'proxied' });
    }) as any);

    const res = await request(app).post('/api/rooms').send({ name: 'x' });
    expect(spy).toHaveBeenCalledWith('core', '/rooms', expect.anything(), expect.anything());
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('proxied');
  });

  test('GET /api/collaboration/health proxies to collaboration service', async () => {
    const spy = jest.spyOn(proxyModule.serviceProxy, 'proxyRequest').mockImplementationOnce((async (service: any, path: any, req: any, res: any) => {
      res.status(200).json({ ok: true });
    }) as any);

    const res = await request(app).get('/api/collaboration/health');
    expect(spy).toHaveBeenCalledWith('collaboration', '/api/collaboration/health', expect.anything(), expect.anything());
    expect(res.status).toBe(200);
  });
});
