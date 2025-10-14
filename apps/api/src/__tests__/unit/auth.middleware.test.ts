import { verifySupabaseJWT } from '../../middleware/auth.middleware';
import jwt from 'jsonwebtoken';

// pnpm --filter api test

describe('auth middleware', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.SUPABASE_JWT_SECRET = 'testsecret';
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  test('returns 401 when missing header', async () => {
    const req: any = { headers: {} };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await verifySupabaseJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when invalid token', async () => {
    const req: any = { headers: { authorization: 'Bearer badtoken' } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw new jwt.JsonWebTokenError('invalid'); });

    await verifySupabaseJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches user on valid token', async () => {
    const payload = { sub: '123', email: 'a@b.com', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60 };
    const token = jwt.sign(payload as any, process.env.SUPABASE_JWT_SECRET!);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await verifySupabaseJWT(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('a@b.com');
  });
});
