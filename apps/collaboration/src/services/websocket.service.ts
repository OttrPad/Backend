import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import { AuthService } from "../services/auth.service";
import { RoomManager } from "../services/room.service";
import { ConnectionManager } from "../services/connectionManager.service";
import { DocumentStore } from "../services/documentStore.service";
import {
  UserInfo,
  WebSocketMessage,
  AuthMessage,
  CursorMessage,
  CollaborationConfig,
  ServerStats,
} from "../types";

export class YjsWebSocketServer {
  private wss: WebSocketServer;
  private authService: AuthService;
  private roomManager: RoomManager;
  private connectionManager: ConnectionManager;
  private documentStore: DocumentStore;
  private config: CollaborationConfig;
  private startTime: number;

  constructor(config: CollaborationConfig, roomManager?: RoomManager) {
    this.config = config;
    this.authService = new AuthService();
    this.roomManager = roomManager || new RoomManager();
    this.connectionManager = new ConnectionManager();
    this.documentStore = new DocumentStore();
    this.startTime = Date.now();

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: config.port,
      path: "/yjs",
    });

    console.log(
      `🚀 Enhanced Yjs WebSocket server starting on port ${config.port}`
    );
    this.setupWebSocketServer();
    this.startCleanupInterval();
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket, request) => {
      console.log(
        "🔗 New WebSocket connection from",
        request.socket.remoteAddress
      );

      let authenticatedUser: UserInfo | null = null;
      let currentRoomId: string | null = null;

      // Handle incoming messages
      ws.on("message", async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());

          switch (message.type) {
            case "auth":
              await this.handleAuth(
                ws,
                message.data as AuthMessage,
                async (user, roomId) => {
                  authenticatedUser = user;
                  currentRoomId = roomId;

                  // Load existing document for this room
                  await this.loadAndSyncDocument(roomId, user);

                  // Add user to connection manager
                  this.connectionManager.addUserToRoom(roomId, user);

                  // Add user to room manager
                  this.roomManager.addUserToRoom(roomId, user);
                }
              );
              break;

            case "cursor":
              if (authenticatedUser && currentRoomId) {
                this.handleCursorUpdate(
                  currentRoomId,
                  authenticatedUser.userId,
                  message.data as CursorMessage
                );
              }
              break;

            case "sync":
              // Handle Yjs sync messages
              if (authenticatedUser && currentRoomId) {
                await this.handleYjsSync(
                  currentRoomId,
                  message.data,
                  authenticatedUser.userId
                );
              }
              break;

            case "snapshot":
              // Handle manual snapshot creation
              if (authenticatedUser && currentRoomId) {
                await this.createManualSnapshot(
                  currentRoomId,
                  authenticatedUser.userId
                );
              }
              break;

            default:
              console.warn("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
          this.sendError(ws, "INVALID_MESSAGE", "Failed to process message");
        }
      });

      // Connection close handling
      ws.on("close", async (code: number, reason: Buffer) => {
        console.log(
          `👋 WebSocket connection closed: ${code} - ${reason.toString()}`
        );
        if (authenticatedUser && currentRoomId) {
          // Remove from connection manager (handles cleanup)
          this.connectionManager.removeUserFromRoom(
            currentRoomId,
            authenticatedUser.userId,
            `close_${code}`
          );

          // Remove from room manager
          this.roomManager.removeUserFromRoom(
            currentRoomId,
            authenticatedUser.userId
          );

          // Save document if this was the last user
          const remainingUsers =
            this.connectionManager.getRoomUserCount(currentRoomId);
          if (remainingUsers === 0) {
            await this.saveDocumentOnRoomEmpty(currentRoomId);
          }
        }
      });

      // Connection error handling
      ws.on("error", async (error: Error) => {
        console.error("🚨 WebSocket error:", error);
        if (authenticatedUser && currentRoomId) {
          this.connectionManager.removeUserFromRoom(
            currentRoomId,
            authenticatedUser.userId,
            "websocket_error"
          );

          this.roomManager.removeUserFromRoom(
            currentRoomId,
            authenticatedUser.userId
          );
        }
      });
    });

    this.wss.on("listening", () => {
      console.log(
        `✅ Enhanced Yjs WebSocket server listening on port ${this.config.port}`
      );
    });
  }

  private async handleAuth(
    ws: WebSocket,
    authData: AuthMessage,
    onSuccess: (user: UserInfo, roomId: string) => void
  ): Promise<void> {
    try {
      console.log(`🔐 Authenticating user for room ${authData.roomId}`);
      console.log(`🔐 Token preview: ${authData.token.substring(0, 20)}...`);

      // Validate token
      const authenticatedUser = await this.authService.validateToken(
        authData.token
      );
      if (!authenticatedUser) {
        console.log(`❌ Token validation failed for room ${authData.roomId}`);
        this.sendError(ws, "INVALID_TOKEN", "Authentication failed");
        return;
      }

      console.log(
        `✅ Token validated for user: ${authenticatedUser.userId} (${authenticatedUser.email})`
      );

      // Check room access
      const roomAccess = await this.authService.checkRoomAccess(
        authenticatedUser.userId,
        authData.roomId,
        authenticatedUser.email
      );

      console.log(`🔐 Room access result:`, roomAccess);

      if (!roomAccess.hasAccess) {
        console.log(
          `❌ Access denied for user ${authenticatedUser.userId} to room ${authData.roomId}`
        );
        this.sendError(ws, "ACCESS_DENIED", "No access to this room");
        return;
      }

      console.log(
        `✅ Access granted for user ${authenticatedUser.userId} to room ${authData.roomId} with role ${roomAccess.role}`
      );

      // Create user info
      const userInfo: UserInfo = {
        userId: authenticatedUser.userId,
        userName: authenticatedUser.name || authenticatedUser.email,
        userEmail: authenticatedUser.email,
        userColor: "", // Will be assigned by room manager
        websocket: ws,
        joinedAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Add user to room
      this.roomManager.addUserToRoom(authData.roomId, userInfo);

      // Setup Yjs connection for this room
      this.setupYjsConnection(ws, authData.roomId);

      // Send success response
      ws.send(
        JSON.stringify({
          type: "auth_success",
          data: {
            userId: userInfo.userId,
            userName: userInfo.userName,
            userColor: userInfo.userColor,
            roomId: authData.roomId,
          },
          timestamp: Date.now(),
        })
      );

      console.log(
        `✅ User ${userInfo.userName} authenticated for room ${authData.roomId}`
      );
      onSuccess(userInfo, authData.roomId);
    } catch (error) {
      console.error("Authentication error:", error);
      this.sendError(ws, "AUTH_ERROR", "Authentication failed");
    }
  }

  private setupYjsConnection(ws: WebSocket, roomId: string): void {
    const room = this.roomManager.getOrCreateRoom(roomId);

    // Simple Yjs sync setup for Phase 1
    // We'll handle document sync through the shared document state
    try {
      // Listen for Yjs document updates
      room.doc.on("update", (update: Uint8Array) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Broadcast document updates to this client
          ws.send(
            JSON.stringify({
              type: "doc_update",
              data: Array.from(update),
              roomId: roomId,
              timestamp: Date.now(),
            })
          );
        }
      });

      console.log(`🔄 Yjs sync established for room ${roomId}`);
    } catch (error) {
      console.error("Failed to setup Yjs connection:", error);
    }
  }

  private handleCursorUpdate(
    roomId: string,
    userId: string,
    cursorData: CursorMessage
  ): void {
    this.roomManager.updateUserCursor(roomId, userId, {
      blockId: cursorData.blockId,
      position: cursorData.position,
      selection: cursorData.selection,
    });

    // Broadcast cursor update to other users
    this.roomManager.broadcastToRoom(
      roomId,
      {
        type: "cursor",
        data: {
          userId,
          ...cursorData,
        },
        timestamp: Date.now(),
      },
      userId
    );
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "error",
          data: {
            code,
            message,
          },
          timestamp: Date.now(),
        })
      );
    }
  }

  private startCleanupInterval(): void {
    // Cleanup inactive rooms every 30 minutes
    setInterval(
      () => {
        this.roomManager.cleanupInactiveRooms(this.config.roomInactiveTimeout);
      },
      30 * 60 * 1000
    );

    console.log("🧹 Room cleanup interval started (every 30 minutes)");
  }

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    const process = global.process;
    const memoryUsage = process.memoryUsage();

    return {
      activeRooms: this.roomManager.getActiveRoomsCount(),
      totalConnections: this.roomManager.getTotalUsersCount(),
      memoryUsage: memoryUsage.heapUsed,
      uptime: Date.now() - this.startTime,
      roomStats: this.roomManager.getAllRoomsStats(),
    };
  }

  /**
   * Load existing document state and sync with user
   */
  private async loadAndSyncDocument(
    roomId: string,
    user: UserInfo
  ): Promise<void> {
    try {
      console.log(
        `📖 Loading document for room ${roomId} and user ${user.userId}`
      );

      // Load existing document state
      const existingState = await this.documentStore.loadDocument(roomId);

      if (existingState && existingState.length > 0) {
        // Send existing document state to the new user
        const syncMessage = {
          type: "doc_sync",
          data: {
            state: Array.from(existingState),
            roomId: roomId,
          },
          timestamp: Date.now(),
        };

        user.websocket.send(JSON.stringify(syncMessage));
        console.log(
          `✅ Sent existing document state to user ${user.userId} (${existingState.length} bytes)`
        );
      } else {
        console.log(
          `📄 No existing document found for room ${roomId}, starting fresh`
        );
      }
    } catch (error) {
      console.error(`❌ Failed to load document for room ${roomId}:`, error);
    }
  }

  /**
   * Handle Yjs sync messages with persistence
   */
  private async handleYjsSync(
    roomId: string,
    data: any,
    userId?: string
  ): Promise<void> {
    try {
      // Process the Yjs sync normally
      if (Array.isArray(data.data)) {
        const update = new Uint8Array(data.data);

        // Broadcast to other users in the room
        const roomUsers = this.connectionManager.getRoomUsers(roomId);
        const syncMessage = {
          type: "doc_update",
          data: {
            data: data.data,
            roomId: roomId,
            userId: userId,
          },
          timestamp: Date.now(),
        };

        roomUsers.forEach((user) => {
          if (
            user.userId !== userId &&
            user.websocket.readyState === WebSocket.OPEN
          ) {
            user.websocket.send(JSON.stringify(syncMessage));
          }
        });

        // Auto-save document state
        const activeUserIds = roomUsers.map((u) => u.userId);
        this.documentStore.resetAutoSaveTimer(roomId, update, activeUserIds);

        console.log(
          `🔄 Synced document update from ${userId} to ${roomUsers.length - 1} other users`
        );
      }
    } catch (error) {
      console.error(`❌ Failed to handle Yjs sync for room ${roomId}:`, error);
    }
  }

  /**
   * Create manual snapshot
   */
  private async createManualSnapshot(
    roomId: string,
    userId: string
  ): Promise<void> {
    try {
      console.log(
        `📸 Creating manual snapshot for room ${roomId} by user ${userId}`
      );

      // Get current document state from room
      const room = this.roomManager.getRoom(roomId);
      if (!room || !room.doc) {
        throw new Error(`Room ${roomId} not found or has no document`);
      }

      const currentState = Y.encodeStateAsUpdate(room.doc);
      const snapshotId = await this.documentStore.createSnapshot(
        roomId,
        currentState,
        userId,
        "manual"
      );

      // Notify user of successful snapshot
      const user = this.connectionManager
        .getRoomUsers(roomId)
        .find((u) => u.userId === userId);
      if (user && user.websocket.readyState === WebSocket.OPEN) {
        user.websocket.send(
          JSON.stringify({
            type: "snapshot_created",
            data: {
              snapshotId,
              roomId,
              timestamp: Date.now(),
            },
          })
        );
      }

      console.log(`✅ Manual snapshot created: ${snapshotId}`);
    } catch (error) {
      console.error(
        `❌ Failed to create manual snapshot for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Save document when room becomes empty
   */
  private async saveDocumentOnRoomEmpty(roomId: string): Promise<void> {
    try {
      console.log(`💾 Saving document for empty room ${roomId}`);

      const room = this.roomManager.getRoom(roomId);
      if (room && room.doc) {
        const currentState = Y.encodeStateAsUpdate(room.doc);
        await this.documentStore.saveOnRoomEmpty(roomId, currentState);
        console.log(`✅ Document saved for empty room ${roomId}`);
      }
    } catch (error) {
      console.error(
        `❌ Failed to save document for empty room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Get enhanced server statistics
   */
  getEnhancedStats(): {
    server: ServerStats;
    connections: any;
    rooms: any;
  } {
    const baseStats = this.getStats();
    const connectionStats = this.connectionManager.getDetailedStatus();

    return {
      server: baseStats,
      connections: connectionStats,
      rooms: this.roomManager.getAllRoomsStats
        ? this.roomManager.getAllRoomsStats()
        : {},
    };
  }

  /**
   * Gracefully shutdown the server
   */
  shutdown(): void {
    console.log("🛑 Shutting down enhanced Yjs WebSocket server...");

    // Shutdown connection manager first
    this.connectionManager.shutdown();

    // Shutdown document store
    this.documentStore.shutdown();

    // Close all WebSocket connections
    this.wss.clients.forEach((ws) => {
      ws.terminate();
    });

    this.wss.close(() => {
      console.log("✅ Enhanced Yjs WebSocket server shut down");
    });
  }
}
