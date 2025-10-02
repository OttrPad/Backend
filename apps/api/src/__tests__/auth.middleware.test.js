"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_middleware_1 = require("../middleware/auth.middleware");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// pnpm --filter api test
describe('auth middleware', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.resetModules();
        process.env = Object.assign({}, OLD_ENV);
        process.env.SUPABASE_JWT_SECRET = 'testsecret';
    });
    afterEach(() => {
        process.env = OLD_ENV;
        jest.restoreAllMocks();
    });
    test('returns 401 when missing header', async () => {
        const req = { headers: {} };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        await (0, auth_middleware_1.verifySupabaseJWT)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
    test('returns 401 when invalid token', async () => {
        const req = { headers: { authorization: 'Bearer badtoken' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        jest.spyOn(jsonwebtoken_1.default, 'verify').mockImplementation(() => { throw new jsonwebtoken_1.default.JsonWebTokenError('invalid'); });
        await (0, auth_middleware_1.verifySupabaseJWT)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
    test('attaches user on valid token', async () => {
        const payload = { sub: '123', email: 'a@b.com', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60 };
        const token = jsonwebtoken_1.default.sign(payload, process.env.SUPABASE_JWT_SECRET);
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        await (0, auth_middleware_1.verifySupabaseJWT)(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.email).toBe('a@b.com');
    });
});
