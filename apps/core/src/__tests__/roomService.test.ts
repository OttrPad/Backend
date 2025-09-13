import * as roomService from '../services/roomService';
import { supabase } from '@packages/supabase';

jest.mock('@packages/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('roomService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('createRoom uses generated unique code and returns inserted data', async () => {
    // First call: generateUniqueRoomCode -> select().eq().single() should indicate no row (PGRST116)
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    };

    // Second call: insert(...).select().single() returns the inserted row
    const insertChain: any = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { room_id: 123, name: 'My Room', description: 'desc' }, error: null }),
    };

    (supabase.from as jest.Mock).mockImplementationOnce(() => selectChain).mockImplementationOnce(() => insertChain);

    const result = await roomService.createRoom('My Room', 'user-1', 'desc');
    expect(result).toBeDefined();
    expect(result.room_id).toBe(123);
    expect(result.name).toBe('My Room');
  });

  test('findRoomByName returns null when not found (PGRST116)', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), single };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const res = await roomService.findRoomByName('nonexistent');
    expect(res).toBeNull();
  });

  test('getAllRooms returns rooms and pagination info', async () => {
    const rooms = [{ room_id: 1 }, { room_id: 2 }];
    const chain = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: rooms, error: null, count: 2 }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain as any);

    const res = await roomService.getAllRooms(10, 0);
    expect(res.rooms).toEqual(rooms);
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(false);
  });
});
