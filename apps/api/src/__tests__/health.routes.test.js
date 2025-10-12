"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const health_routes_1 = __importDefault(require("../routes/health.routes"));
const proxy_service_1 = require("../services/proxy.service");
describe('health routes', () => {
    let app;
    beforeEach(() => {
        app = (0, express_1.default)();
        app.use('/', health_routes_1.default);
    });
    afterEach(() => jest.restoreAllMocks());
    test('GET /health returns gateway health', async () => {
        const res = await (0, supertest_1.default)(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.service).toBe('API Gateway');
    });
    test('GET /health/services returns 200 when all healthy', async () => {
        jest.spyOn(proxy_service_1.serviceProxy, 'checkHealth').mockResolvedValueOnce({
            core: { status: 'healthy' },
            collaboration: { status: 'healthy' },
        });
        const res = await (0, supertest_1.default)(app).get('/health/services');
        expect(res.status).toBe(200);
        expect(res.body.services).toBeDefined();
        expect(res.body.overall_status).toBe('healthy');
    });
    test('GET /health/services returns 503 when degraded', async () => {
        jest.spyOn(proxy_service_1.serviceProxy, 'checkHealth').mockResolvedValueOnce({
            core: { status: 'unhealthy' },
            collaboration: { status: 'healthy' },
        });
        const res = await (0, supertest_1.default)(app).get('/health/services');
        expect(res.status).toBe(503);
        expect(res.body.overall_status).toBe('degraded');
    });
});
