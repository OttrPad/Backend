import * as roomUserService from '../../services/roomUserService';
import { supabase } from '@packages/supabase';

jest.mock('@packages/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('roomUserService', () => {
  beforeEach(() => jest.resetAllMocks());

  test('addUserToRoom throws when user already exists', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { uid: 'u1' } }) };
    (supabase.from as jest.Mock).mockReturnValue(chain as any);

    await expect(roomUserService.addUserToRoom('1', 'u1')).rejects.toThrow('User is already a member of this room');
  });

  test('isUserInRoom returns true when found and false when not found', async () => {
    const singleTrue = jest.fn().mockResolvedValue({ data: { uid: 'u1' }, error: null });
    const singleFalse = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const chainTrue = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: singleTrue };
    const chainFalse = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: singleFalse };

    (supabase.from as jest.Mock).mockReturnValueOnce(chainTrue as any).mockReturnValueOnce(chainFalse as any);

    const res1 = await roomUserService.isUserInRoom('1', 'u1');
    expect(res1).toBe(true);

    const res2 = await roomUserService.isUserInRoom('1', 'u2');
    expect(res2).toBe(false);
  });

  test('updateUserType updates and returns data', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { uid: 'u1', type: 'editor' }, error: null }) };
    (supabase.from as jest.Mock).mockReturnValue(chain as any);

    const res = await roomUserService.updateUserType('1', 'u1', 'editor');
    expect(res.type).toBe('editor');
  });

  test('getRoomParticipants merges room users and allowed emails and deduplicates', async () => {
    // Prepare mocked data
    const roomUsers = [{ uid: 'u1', type: 'editor', joined_at: 'now' }];
    const invitedUsers = [{ email: 'invite@x.com', access_level: 'viewer', invited_at: 't', invited_by: 'u2' }];

    // Mock supabase.rpc to return user info for rpc call
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { email: 'member@x.com', name: 'Member Name' }, error: null });

    // Mock supabase.from to return different results depending on table
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'Room_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: roomUsers, error: null }),
          }),
        };
      }

      if (table === 'Allowed_emails') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: invitedUsers, error: null }),
          }),
        };
      }

      return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }) };
    });

    const participants = await roomUserService.getRoomParticipants('1');
    expect(Array.isArray(participants)).toBe(true);
    // Verify that member user is present and invited user present
    const member = participants.find((p: any) => p.user_id === 'u1');
    const invited = participants.find((p: any) => p.status === 'invited');
    expect(member).toBeDefined();
    expect(invited).toBeDefined();
  });
});
