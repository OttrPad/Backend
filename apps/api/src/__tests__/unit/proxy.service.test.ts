import axios from 'axios';
import { serviceProxy as singleton } from '../../services/proxy.service';
import { Request, Response } from 'express';

jest.mock('axios');
const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;

function makeRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res as Response);
  res.json = jest.fn().mockReturnValue(res as Response);
  res.set = jest.fn();
  return res as Response;
}

describe('ServiceProxy', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns 404 for unknown service', async () => {
    const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'localhost', originalUrl: '/x', body: {}, query: {} } as any as Request;
    const res = makeRes();

    await singleton.proxyRequest('unknown', '/path', req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Service not found' }));
  });

  test('forwards successful response from axios', async () => {
    const req = { method: 'POST', headers: { 'content-type': 'application/json' }, ip: '1.2.3.4', get: () => 'host', originalUrl: '/api/rooms', body: { foo: 'bar' }, query: {} } as any as Request;
    const res = makeRes();

    (mockedAxios as any).mockImplementationOnce((): any => Promise.resolve({
      status: 201,
      data: { ok: true },
      headers: { 'x-custom': 'v' },
    }));

    await singleton.proxyRequest('core', '/rooms', req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(res.set).toHaveBeenCalledWith('x-custom', 'v');
  });

  test('handles ECONNREFUSED', async () => {
    const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} } as any as Request;
    const res = makeRes();

    const err: any = new Error('connect ECONNREFUSED');
    err.code = 'ECONNREFUSED';
  (mockedAxios as any).mockImplementationOnce(() => Promise.reject(err));

    await singleton.proxyRequest('core', '/status', req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Service unavailable' }));
  });

  test('handles ECONNABORTED (timeout)', async () => {
    const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} } as any as Request;
    const res = makeRes();

    const err: any = new Error('timeout');
    err.code = 'ECONNABORTED';
  (mockedAxios as any).mockImplementationOnce(() => Promise.reject(err));

    await singleton.proxyRequest('core', '/status', req, res);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Gateway timeout' }));
  });

  test('handles generic error', async () => {
    const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} } as any as Request;
    const res = makeRes();

    const err: any = new Error('boom');
  (mockedAxios as any).mockImplementationOnce(() => Promise.reject(err));

    await singleton.proxyRequest('core', '/status', req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Bad gateway' }));
  });

  test('checkHealth returns healthy/unhealthy mapping', async () => {
  mockedAxios.get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('3001')) {
        return Promise.resolve({ data: { ok: true }, headers: { 'x-response-time': '10ms' } });
      }
      return Promise.reject(new Error('not reachable'));
    });

    const result = await singleton.checkHealth();

    expect(result.core).toBeDefined();
    expect(result.collaboration).toBeDefined();
  });
});
