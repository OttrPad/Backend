"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
// Mock auth middleware to bypass
jest.mock('../middleware/auth.middleware', () => ({
    verifySupabaseJWT: (req, res, next) => next(),
}));
const gateway_routes_1 = __importDefault(require("../routes/gateway.routes"));
const proxyModule = __importStar(require("../services/proxy.service"));
describe('gateway routes', () => {
    let app;
    beforeEach(() => {
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api', gateway_routes_1.default);
    });
    afterEach(() => jest.restoreAllMocks());
    test('POST /api/rooms proxies to core /rooms', async () => {
        const spy = jest.spyOn(proxyModule.serviceProxy, 'proxyRequest').mockImplementationOnce((async (service, path, req, res) => {
            res.status(201).json({ message: 'proxied' });
        }));
        const res = await (0, supertest_1.default)(app).post('/api/rooms').send({ name: 'x' });
        expect(spy).toHaveBeenCalledWith('core', '/rooms', expect.anything(), expect.anything());
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('proxied');
    });
    test('GET /api/collaboration/health proxies to collaboration service', async () => {
        const spy = jest.spyOn(proxyModule.serviceProxy, 'proxyRequest').mockImplementationOnce((async (service, path, req, res) => {
            res.status(200).json({ ok: true });
        }));
        const res = await (0, supertest_1.default)(app).get('/api/collaboration/health');
        expect(spy).toHaveBeenCalledWith('collaboration', '/api/collaboration/health', expect.anything(), expect.anything());
        expect(res.status).toBe(200);
    });
});
