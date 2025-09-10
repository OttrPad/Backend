import { WebSocket } from "ws";
import { UserInfo, ConnectionHealth, ConnectionMetrics } from "../types";

export class ConnectionManager {
  private activeConnections: Map<string, Map<string, UserInfo>> = new Map();
  private connectionHealth: Map<string, ConnectionHealth> = new Map();
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    connectionsPerRoom: {},
    averageSessionDuration: 0,
    disconnectionReasons: {},
  };

  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_MISSED_PINGS = 3;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Add user to room and initialize connection monitoring
   */
  addUserToRoom(roomId: string, userInfo: UserInfo): void {
    console.log(`👤 Adding user ${userInfo.userId} to room ${roomId}`);

    // Initialize room if it doesn't exist
    if (!this.activeConnections.has(roomId)) {
      this.activeConnections.set(roomId, new Map());
      this.metrics.connectionsPerRoom[roomId] = 0;
    }

    // Add user to room
    this.activeConnections.get(roomId)!.set(userInfo.userId, userInfo);
    this.metrics.connectionsPerRoom[roomId]++;
    this.metrics.totalConnections++;

    // Initialize connection health tracking
    this.connectionHealth.set(userInfo.userId, {
      userId: userInfo.userId,
      roomId,
      lastPing: Date.now(),
      lastPong: Date.now(),
      missedPings: 0,
      isAlive: true,
      connectedAt: Date.now(),
    });

    // Set up WebSocket ping/pong for this connection
    this.setupConnectionMonitoring(userInfo.websocket, userInfo.userId);

    console.log(
      `✅ User ${userInfo.userId} added to room ${roomId}. Room now has ${this.getRoomUserCount(roomId)} users`
    );
  }

  /**
   * Remove user from room and clean up monitoring
   */
  removeUserFromRoom(
    roomId: string,
    userId: string,
    reason: string = "unknown"
  ): void {
    console.log(
      `👋 Removing user ${userId} from room ${roomId}. Reason: ${reason}`
    );

    const room = this.activeConnections.get(roomId);
    if (room && room.has(userId)) {
      // Calculate session duration
      const health = this.connectionHealth.get(userId);
      if (health) {
        const sessionDuration = Date.now() - health.connectedAt;
        this.updateSessionMetrics(sessionDuration);
        this.connectionHealth.delete(userId);
      }

      // Remove user from room
      room.delete(userId);
      this.metrics.connectionsPerRoom[roomId]--;
      this.metrics.totalConnections--;

      // Track disconnection reason
      this.metrics.disconnectionReasons[reason] =
        (this.metrics.disconnectionReasons[reason] || 0) + 1;

      // Clean up empty room
      if (room.size === 0) {
        this.activeConnections.delete(roomId);
        delete this.metrics.connectionsPerRoom[roomId];
        console.log(`🗑️ Room ${roomId} is now empty and has been cleaned up`);
      }

      console.log(
        `✅ User ${userId} removed from room ${roomId}. Room now has ${this.getRoomUserCount(roomId)} users`
      );
    }
  }

  /**
   * Get all users in a specific room
   */
  getRoomUsers(roomId: string): UserInfo[] {
    const room = this.activeConnections.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  /**
   * Get user count for a room
   */
  getRoomUserCount(roomId: string): number {
    const room = this.activeConnections.get(roomId);
    return room ? room.size : 0;
  }

  /**
   * Get all active rooms
   */
  getActiveRooms(): string[] {
    return Array.from(this.activeConnections.keys());
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection health for a user
   */
  getConnectionHealth(userId: string): ConnectionHealth | null {
    return this.connectionHealth.get(userId) || null;
  }

  /**
   * Set up ping/pong monitoring for a WebSocket connection
   */
  private setupConnectionMonitoring(ws: WebSocket, userId: string): void {
    // Handle pong responses
    ws.on("pong", () => {
      const health = this.connectionHealth.get(userId);
      if (health) {
        health.lastPong = Date.now();
        health.missedPings = 0;
        health.isAlive = true;
        console.log(`🏓 Received pong from user ${userId}`);
      }
    });

    // Handle connection close
    ws.on("close", (code: number, reason: Buffer) => {
      const reasonString = reason.toString() || `code_${code}`;
      console.log(
        `❌ WebSocket closed for user ${userId}: ${code} - ${reasonString}`
      );

      const health = this.connectionHealth.get(userId);
      if (health) {
        this.removeUserFromRoom(health.roomId, userId, reasonString);
      }
    });

    // Handle connection errors
    ws.on("error", (error: Error) => {
      console.error(`🚨 WebSocket error for user ${userId}:`, error);
      const health = this.connectionHealth.get(userId);
      if (health) {
        this.removeUserFromRoom(health.roomId, userId, "websocket_error");
      }
    });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      this.checkConnections();
    }, this.PING_INTERVAL);

    console.log(
      `💓 Started heartbeat monitor (interval: ${this.PING_INTERVAL}ms)`
    );
  }

  /**
   * Check all connections and send pings
   */
  private checkConnections(): void {
    const now = Date.now();
    const toRemove: { roomId: string; userId: string }[] = [];

    for (const [userId, health] of this.connectionHealth.entries()) {
      const timeSinceLastPong = now - health.lastPong;

      // Check if connection is stale
      if (timeSinceLastPong > this.PING_INTERVAL + this.PONG_TIMEOUT) {
        health.missedPings++;
        console.log(
          `⚠️ User ${userId} missed ping (${health.missedPings}/${this.MAX_MISSED_PINGS})`
        );

        // Mark as dead if too many missed pings
        if (health.missedPings >= this.MAX_MISSED_PINGS) {
          health.isAlive = false;
          toRemove.push({ roomId: health.roomId, userId });
          continue;
        }
      }

      // Send ping to active connections
      const room = this.activeConnections.get(health.roomId);
      const user = room?.get(userId);

      if (user && user.websocket.readyState === WebSocket.OPEN) {
        try {
          user.websocket.ping();
          health.lastPing = now;
          console.log(`🏓 Sent ping to user ${userId}`);
        } catch (error) {
          console.error(`❌ Failed to ping user ${userId}:`, error);
          health.missedPings++;
        }
      } else {
        // WebSocket is not open
        toRemove.push({ roomId: health.roomId, userId });
      }
    }

    // Remove dead connections
    toRemove.forEach(({ roomId, userId }) => {
      this.removeUserFromRoom(roomId, userId, "heartbeat_timeout");
    });

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} dead connections`);
    }
  }

  /**
   * Update session duration metrics
   */
  private updateSessionMetrics(sessionDuration: number): void {
    const currentAvg = this.metrics.averageSessionDuration;
    const totalSessions = this.metrics.totalConnections;

    // Simple moving average calculation
    this.metrics.averageSessionDuration =
      (currentAvg * (totalSessions - 1) + sessionDuration) / totalSessions;
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    console.log("🛑 Shutting down connection manager...");

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all active connections
    for (const [roomId, users] of this.activeConnections.entries()) {
      for (const [userId, user] of users.entries()) {
        try {
          user.websocket.close(1001, "Server shutdown");
        } catch (error) {
          console.error(`Error closing connection for user ${userId}:`, error);
        }
      }
    }

    this.activeConnections.clear();
    this.connectionHealth.clear();

    console.log("✅ Connection manager shutdown complete");
  }

  /**
   * Get detailed status for monitoring
   */
  getDetailedStatus(): {
    activeRooms: number;
    totalUsers: number;
    roomDetails: Array<{ roomId: string; userCount: number; users: string[] }>;
    healthStatus: Array<{
      userId: string;
      roomId: string;
      isAlive: boolean;
      missedPings: number;
    }>;
    metrics: ConnectionMetrics;
  } {
    const roomDetails = Array.from(this.activeConnections.entries()).map(
      ([roomId, users]) => ({
        roomId,
        userCount: users.size,
        users: Array.from(users.keys()),
      })
    );

    const healthStatus = Array.from(this.connectionHealth.values()).map(
      (health) => ({
        userId: health.userId,
        roomId: health.roomId,
        isAlive: health.isAlive,
        missedPings: health.missedPings,
      })
    );

    return {
      activeRooms: this.activeConnections.size,
      totalUsers: this.metrics.totalConnections,
      roomDetails,
      healthStatus,
      metrics: this.getMetrics(),
    };
  }
}
