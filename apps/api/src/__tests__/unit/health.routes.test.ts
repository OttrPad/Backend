import request from 'supertest';
import express from 'express';
import healthRouter from '../../routes/health.routes';
import { serviceProxy } from '../../services/proxy.service';

describe('health routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use('/', healthRouter);
  });

  afterEach(() => jest.restoreAllMocks());

  test('GET /health returns gateway health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('API Gateway');
  });

  test('GET /health/services returns 200 when all healthy', async () => {
    jest.spyOn(serviceProxy, 'checkHealth').mockResolvedValueOnce({
      core: { status: 'healthy' },
      collaboration: { status: 'healthy' },
    } as any);

    const res = await request(app).get('/health/services');
    expect(res.status).toBe(200);
    expect(res.body.services).toBeDefined();
    expect(res.body.overall_status).toBe('healthy');
  });

  test('GET /health/services returns 503 when degraded', async () => {
    jest.spyOn(serviceProxy, 'checkHealth').mockResolvedValueOnce({
      core: { status: 'unhealthy' },
      collaboration: { status: 'healthy' },
    } as any);

    const res = await request(app).get('/health/services');
    expect(res.status).toBe(503);
    expect(res.body.overall_status).toBe('degraded');
  });
});
