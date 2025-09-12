import RealtimeCollaborationService from '../services/realtimeCollaborationService';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// We'll test pure logic methods without starting an actual HTTP server/socket.io instance

describe('RealtimeCollaborationService - unit tests (logic only)', () => {
  test('addToChatHistory and sendChatHistory behavior', () => {
    // Create an object that resembles the class but with minimal io object that has an emit function
    const fakeIo: any = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: { sockets: new Map() },
      adapter: { rooms: new Map() },
    };

    // Instantiate via Object.create to bypass constructor behavior
    // (constructor expects an HttpServer and sets up socket.io)
    const svc: any = Object.create(RealtimeCollaborationService.prototype);
    svc.io = fakeIo;
    svc.chatHistory = {};
    svc.chatHistoryLimit = 3;

    // Call addToChatHistory
    svc.addToChatHistory('room1', { uid: 'u1', email: 'a@b', content: 'm1', timestamp: 1 });
    svc.addToChatHistory('room1', { uid: 'u2', email: 'a@b', content: 'm2', timestamp: 2 });
    svc.addToChatHistory('room1', { uid: 'u3', email: 'a@b', content: 'm3', timestamp: 3 });
    svc.addToChatHistory('room1', { uid: 'u4', email: 'a@b', content: 'm4', timestamp: 4 });

    // Should keep only last 3
    expect(svc.chatHistory['room1'].length).toBe(3);
    expect(svc.chatHistory['room1'][0].content).toBe('m2');

    // Mock socket with emit to capture chat-history
    const fakeSocket = { emit: jest.fn() };
    svc.sendChatHistory(fakeSocket as any, 'room1');
    expect(fakeSocket.emit).toHaveBeenCalledWith('chat-history', expect.objectContaining({ roomId: 'room1' }));
  });

  test('getRoomParticipants and broadcastToRoom stub', () => {
    const fakeIo: any = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: { sockets: new Map() },
    };

    const svc: any = Object.create(RealtimeCollaborationService.prototype);
    svc.io = fakeIo;
    svc.roomParticipants = {
      roomA: new Map([['u1', { userId: 'u1', userEmail: 'a@b', socketId: 's1' }]]),
    };

    const participants = svc.getRoomParticipants('roomA');
    expect(participants.length).toBe(1);
    expect(participants[0].userId).toBe('u1');

    svc.broadcastToRoom('roomA', 'ev', { hello: true });
    expect(fakeIo.to).toHaveBeenCalledWith('roomA');
    expect(fakeIo.emit).toHaveBeenCalledWith('ev', { hello: true });
  });
});
