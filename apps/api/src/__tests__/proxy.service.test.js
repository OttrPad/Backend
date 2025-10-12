"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const proxy_service_1 = require("../services/proxy.service");
jest.mock('axios');
const mockedAxios = axios_1.default;
function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.set = jest.fn();
    return res;
}
describe('ServiceProxy', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });
    test('returns 404 for unknown service', async () => {
        const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'localhost', originalUrl: '/x', body: {}, query: {} };
        const res = makeRes();
        await proxy_service_1.serviceProxy.proxyRequest('unknown', '/path', req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Service not found' }));
    });
    test('forwards successful response from axios', async () => {
        const req = { method: 'POST', headers: { 'content-type': 'application/json' }, ip: '1.2.3.4', get: () => 'host', originalUrl: '/api/rooms', body: { foo: 'bar' }, query: {} };
        const res = makeRes();
        mockedAxios.mockImplementationOnce(() => Promise.resolve({
            status: 201,
            data: { ok: true },
            headers: { 'x-custom': 'v' },
        }));
        await proxy_service_1.serviceProxy.proxyRequest('core', '/rooms', req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ ok: true });
        expect(res.set).toHaveBeenCalledWith('x-custom', 'v');
    });
    test('handles ECONNREFUSED', async () => {
        const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} };
        const res = makeRes();
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        mockedAxios.mockImplementationOnce(() => Promise.reject(err));
        await proxy_service_1.serviceProxy.proxyRequest('core', '/status', req, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Service unavailable' }));
    });
    test('handles ECONNABORTED (timeout)', async () => {
        const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} };
        const res = makeRes();
        const err = new Error('timeout');
        err.code = 'ECONNABORTED';
        mockedAxios.mockImplementationOnce(() => Promise.reject(err));
        await proxy_service_1.serviceProxy.proxyRequest('core', '/status', req, res);
        expect(res.status).toHaveBeenCalledWith(504);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Gateway timeout' }));
    });
    test('handles generic error', async () => {
        const req = { method: 'GET', headers: {}, ip: '127.0.0.1', get: () => 'h', originalUrl: '/x', body: {}, query: {} };
        const res = makeRes();
        const err = new Error('boom');
        mockedAxios.mockImplementationOnce(() => Promise.reject(err));
        await proxy_service_1.serviceProxy.proxyRequest('core', '/status', req, res);
        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Bad gateway' }));
    });
    test('checkHealth returns healthy/unhealthy mapping', async () => {
        mockedAxios.get = jest.fn().mockImplementation((url) => {
            if (url.includes('3001')) {
                return Promise.resolve({ data: { ok: true }, headers: { 'x-response-time': '10ms' } });
            }
            return Promise.reject(new Error('not reachable'));
        });
        const result = await proxy_service_1.serviceProxy.checkHealth();
        expect(result.core).toBeDefined();
        expect(result.collaboration).toBeDefined();
    });
});
