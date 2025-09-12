import request from 'supertest';
import express from 'express';

// Use a manual mock for the serviceProxy
jest.mock('../services/proxy.service', () => ({
  serviceProxy: {
    checkHealth: jest.fn().mockResolvedValue({
      core: { status: 'healthy' },
      collaboration: { status: 'healthy' },
    }),
  },
}));

import healthRoutes from '../routes/health.routes';
import { serviceProxy } from '../services/proxy.service';

describe('Health routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use('/', healthRoutes);
  });

  test('GET /health returns gateway healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('API Gateway');
    expect(res.body.status).toBe('healthy');
  });

  test('GET /health/services returns services health', async () => {
    const res = await request(app).get('/health/services');
    expect(res.status).toBe(200);
    expect(res.body.services.core.status).toBe('healthy');
    expect(res.body.overall_status).toBe('healthy');
  });
});
