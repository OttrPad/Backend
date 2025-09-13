import * as allowedEmailService from '../services/allowedEmailService';
import { supabase } from '@packages/supabase';

jest.mock('@packages/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('allowedEmailService', () => {
  beforeEach(() => jest.resetAllMocks());

  test('addAllowedEmail throws when existing', async () => {
    const chainExisting = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 1 } }) };
    (supabase.from as jest.Mock).mockReturnValue(chainExisting as any);

    await expect(allowedEmailService.addAllowedEmail('1', 'a@b.com', 'viewer', 'u1')).rejects.toThrow('Email is already invited to this room');
  });

  test('checkEmailAccess returns allowed true when present', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { access_level: 'editor' } }) };
    (supabase.from as jest.Mock).mockReturnValue(chain as any);

    const res = await allowedEmailService.checkEmailAccess('1', 'a@b.com');
    expect(res.allowed).toBe(true);
    expect(res.accessLevel).toBe('editor');
  });

  test('getAllowedEmails returns empty array when none', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: null, error: null }) };
    (supabase.from as jest.Mock).mockReturnValue(chain as any);

    const res = await allowedEmailService.getAllowedEmails('1');
    expect(Array.isArray(res)).toBe(true);
  });
});
