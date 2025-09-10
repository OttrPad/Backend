import * as Y from "yjs";
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  YjsRoom,
  UserInfo,
  CursorPosition,
  UserCursor,
  RoomStats,
} from "../types";

export class RoomManager {
  private rooms: Map<string, YjsRoom> = new Map();
  private userColors: string[] = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FFEAA7",
    "#DDA0DD",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E9",
    "#F8C471",
    "#82E0AA",
  ];
  private colorIndex = 0;

  /**
   * Get or create a room
   */
  getOrCreateRoom(roomId: string): YjsRoom {
    let room = this.rooms.get(roomId);

    if (!room) {
      console.log(`🏠 Creating new room: ${roomId}`);

      // Create new Yjs document
      const doc = new Y.Doc();

      // Initialize shared types
      const blocks = doc.getArray("blocks");
      const cursors = doc.getMap("cursors");
      const metadata = doc.getMap("metadata");

      // Set initial metadata
      metadata.set("roomId", roomId);
      metadata.set("createdAt", Date.now());
      metadata.set("version", 1);

      room = {
        roomId,
        doc,
        participants: new Map(),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        isActive: true,
      };

      this.rooms.set(roomId, room);
    }

    return room;
  }

  /**
   * Add user to room
   */
  addUserToRoom(roomId: string, user: UserInfo): void {
    const room = this.getOrCreateRoom(roomId);

    // Assign a color to the user if not already assigned
    if (!user.userColor) {
      user.userColor = this.getNextUserColor();
    }

    room.participants.set(user.userId, user);
    room.lastActivity = Date.now();

    console.log(
      `👤 User ${user.userName} (${user.userId}) joined room ${roomId}`
    );

    // Broadcast user joined event to other participants
    this.broadcastToRoom(
      roomId,
      {
        type: "presence",
        data: {
          type: "user_joined",
          userId: user.userId,
          userName: user.userName,
          userColor: user.userColor,
        },
        timestamp: Date.now(),
      },
      user.userId
    );

    // Update user cursor in shared state
    this.updateUserCursor(roomId, user.userId, {
      blockId: "",
      position: 0,
    });
  }

  /**
   * Remove user from room
   */
  removeUserFromRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.participants.get(userId);
    if (user) {
      console.log(`👋 User ${user.userName} (${userId}) left room ${roomId}`);

      // Remove from participants
      room.participants.delete(userId);

      // Remove cursor from shared state
      const cursors = room.doc.getMap("cursors");
      cursors.delete(userId);

      // Broadcast user left event
      this.broadcastToRoom(roomId, {
        type: "presence",
        data: {
          type: "user_left",
          userId: userId,
          userName: user.userName,
        },
        timestamp: Date.now(),
      });

      // If no participants left, mark room as inactive
      if (room.participants.size === 0) {
        room.isActive = false;
        console.log(`🏠 Room ${roomId} is now empty and inactive`);
      }
    }
  }

  /**
   * Update user cursor position
   */
  updateUserCursor(
    roomId: string,
    userId: string,
    cursor: CursorPosition
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.participants.get(userId);
    if (!user) return;

    // Update user's cursor in memory
    user.cursor = cursor;
    user.lastActivity = Date.now();
    room.lastActivity = Date.now();

    // Update cursor in shared Yjs state
    const cursors = room.doc.getMap("cursors");
    const userCursorMap = new Y.Map();

    userCursorMap.set("userId", userId);
    userCursorMap.set("userName", user.userName);
    userCursorMap.set("userColor", user.userColor);
    userCursorMap.set("blockId", cursor.blockId);
    userCursorMap.set("position", cursor.position);
    userCursorMap.set("selection", cursor.selection);
    userCursorMap.set("lastUpdated", Date.now());

    cursors.set(userId, userCursorMap);
  }

  /**
   * Get all user cursors in a room
   */
  getRoomCursors(roomId: string): UserCursor[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const cursors: UserCursor[] = [];
    const cursorsMap = room.doc.getMap("cursors");

    cursorsMap.forEach((cursorMapValue, userId) => {
      const cursorMap = cursorMapValue as Y.Map<any>;
      const cursor: UserCursor = {
        userId: cursorMap.get("userId"),
        userName: cursorMap.get("userName"),
        userColor: cursorMap.get("userColor"),
        blockId: cursorMap.get("blockId"),
        position: cursorMap.get("position"),
        selection: cursorMap.get("selection"),
        lastUpdated: cursorMap.get("lastUpdated"),
      };
      cursors.push(cursor);
    });

    return cursors;
  }

  /**
   * Broadcast message to all users in a room (excluding sender)
   */
  broadcastToRoom(roomId: string, message: any, excludeUserId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.participants.forEach((user) => {
      if (excludeUserId && user.userId === excludeUserId) return;

      if (user.websocket.readyState === WebSocket.OPEN) {
        try {
          user.websocket.send(JSON.stringify(message));
        } catch (error) {
          console.error(
            `Failed to send message to user ${user.userId}:`,
            error
          );
        }
      }
    });
  }

  /**
   * Get room statistics
   */
  getRoomStats(roomId: string): RoomStats | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      roomId,
      activeUsers: room.participants.size,
      totalUsers: room.participants.size, // In Phase 1, these are the same
      documentSize: Y.encodeStateAsUpdate(room.doc).length,
      lastActivity: room.lastActivity,
      createdAt: room.createdAt,
    };
  }

  /**
   * Get all rooms statistics
   */
  getAllRoomsStats(): RoomStats[] {
    const stats: RoomStats[] = [];

    this.rooms.forEach((room) => {
      const roomStats = this.getRoomStats(room.roomId);
      if (roomStats) {
        stats.push(roomStats);
      }
    });

    return stats;
  }

  /**
   * Clean up inactive rooms
   */
  cleanupInactiveRooms(maxInactiveTime: number = 2 * 60 * 60 * 1000): void {
    const now = Date.now();
    const roomsToDelete: string[] = [];

    this.rooms.forEach((room) => {
      if (!room.isActive && now - room.lastActivity > maxInactiveTime) {
        roomsToDelete.push(room.roomId);
      }
    });

    roomsToDelete.forEach((roomId) => {
      console.log(`🧹 Cleaning up inactive room: ${roomId}`);
      this.rooms.delete(roomId);
    });

    if (roomsToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${roomsToDelete.length} inactive rooms`);
    }
  }

  /**
   * Get next user color
   */
  private getNextUserColor(): string {
    const color = this.userColors[this.colorIndex % this.userColors.length];
    this.colorIndex++;
    return color;
  }

  /**
   * Get total number of active rooms
   */
  getActiveRoomsCount(): number {
    let activeCount = 0;
    this.rooms.forEach((room) => {
      if (room.isActive) activeCount++;
    });
    return activeCount;
  }

  /**
   * Get total number of connected users across all rooms
   */
  getTotalUsersCount(): number {
    let totalUsers = 0;
    this.rooms.forEach((room) => {
      totalUsers += room.participants.size;
    });
    return totalUsers;
  }

  /**
   * Get a specific room (without creating it)
   */
  getRoom(roomId: string): YjsRoom | undefined {
    return this.rooms.get(roomId);
  }
}
