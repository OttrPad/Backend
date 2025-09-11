import { Server as SocketServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  roomId?: string;
}

interface UserInfo {
  userId: string;
  userEmail: string;
  socketId: string;
}

interface RoomParticipants {
  [roomId: string]: Map<string, UserInfo>;
}

interface CodeChangeEvent {
  roomId: string;
  userId: string;
  userEmail: string;
  content: string;
  cursorPosition?: { line: number; column: number };
  timestamp: number;
}

interface CursorMoveEvent {
  roomId: string;
  userId: string;
  userEmail: string;
  position: { line: number; column: number };
  timestamp: number;
}

interface UserJoinEvent {
  roomId: string;
  userId: string;
  userEmail: string;
  timestamp: number;
}

interface ChatMessage {
  uid: string;
  email: string;
  content: string;
  timestamp: number;
}

class RealtimeCollaborationService {
  private io: SocketServer;
  private roomParticipants: RoomParticipants = {};
  private chatHistory: { [roomId: string]: ChatMessage[] } = {};

  // Configuration from environment variables
  private readonly maxChatMessageLength: number;
  private readonly chatHistoryLimit: number;

  constructor(httpServer: HttpServer) {
    this.maxChatMessageLength = parseInt(
      process.env.CHAT_MESSAGE_MAX_LENGTH || "5000"
    );
    this.chatHistoryLimit = parseInt(process.env.CHAT_HISTORY_LIMIT || "100");

    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupSocketHandlers();
    console.log("🔌 Realtime Collaboration Service initialized");
  }

  /**
   * Fetch room data from core service using room code
   */
  private async getRoomByCode(
    roomCode: string,
    userId: string,
    userEmail: string
  ) {
    try {
      const coreServiceUrl =
        process.env.CORE_SERVICE_URL || "http://localhost:4001";

      // Prepare headers for core service authentication
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-gateway-user-id": userId,
        "x-gateway-user-email": userEmail,
        "x-original-url": "/api/rooms/join", // Required by core service
      };

      // Add shared secret if configured
      const sharedSecret = process.env.GATEWAY_SHARED_SECRET;
      if (sharedSecret) {
        headers["x-gateway-secret"] = sharedSecret;
      }

      console.log(`Calling core service to resolve room code: ${roomCode}`);

      const response = await fetch(`${coreServiceUrl}/api/rooms/join`, {
        method: "POST",
        headers,
        body: JSON.stringify({ room_code: roomCode }),
      });

      if (!response.ok) {
        // Log more detailed error info
        let errorText = "";
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = "Could not read error response";
        }

        console.error(`Core service error ${response.status}:`, errorText);

        if (response.status === 404) {
          return null; // Room not found
        }
        throw new Error(`Core service error: ${response.status}`);
      }

      let data;
      try {
        console.log(
          `Response status: ${response.status}, attempting to parse JSON...`
        );
        data = await response.json();
        console.log(
          `Core service response data:`,
          JSON.stringify(data, null, 2)
        );
      } catch (jsonError) {
        console.error(`Failed to parse JSON response:`, jsonError);
        // Get raw text for debugging - but response body might already be consumed
        try {
          const responseClone = response.clone();
          const responseText = await responseClone.text();
          console.error(`Raw response text:`, responseText);
        } catch (e) {
          console.error(`Could not read response text for debugging`);
        }
        throw new Error(`Invalid JSON response from core service`);
      }

      console.log(
        `Room code ${roomCode} resolved successfully to room ID: ${data.room?.id}`
      );
      return data.room;
    } catch (error) {
      console.error("Failed to fetch room by code:", error);
      throw error;
    }
  }

  private setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(
        `✅ User ${socket.userEmail} (${socket.userId}) connected to Collaboration Service`
      );

      // Welcome current user
      socket.emit("message", { content: "Welcome to the collaboration room!" });

      // Handle disconnect
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });

      // Chat functionality
      socket.on(
        "chat:send",
        (
          data: {
            roomId?: string;
            message?: string;
            uid?: string;
            email?: string;
          },
          ack?: (res: { ok: boolean; error?: string }) => void
        ) => this.handleChatSend(socket, data, ack)
      );

      // Room management
      socket.on("join-room", (data: { roomId: string }) => {
        this.handleJoinRoom(socket, data.roomId);
      });

      socket.on("leave-room", () => {
        this.handleLeaveRoom(socket);
      });

      // Real-time code collaboration
      socket.on(
        "code-change",
        (data: {
          content: string;
          cursorPosition?: { line: number; column: number };
        }) => {
          this.handleCodeChange(socket, data);
        }
      );

      socket.on(
        "cursor-move",
        (data: { position: { line: number; column: number } }) => {
          this.handleCursorMove(socket, data);
        }
      );

      socket.on(
        "selection-change",
        (data: {
          startPos: { line: number; column: number };
          endPos: { line: number; column: number };
        }) => {
          this.handleSelectionChange(socket, data);
        }
      );

      // Request chat history when joining a room
      socket.on("request-chat-history", (data: { roomId: string }) => {
        this.sendChatHistory(socket, data.roomId);
      });
    });
  }

  private async authenticateSocket(
    socket: AuthenticatedSocket,
    next: Function
  ) {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
      if (!JWT_SECRET) {
        return next(
          new Error("Authentication error: JWT secret not configured")
        );
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      socket.userId = decoded.sub;
      socket.userEmail = decoded.email;

      console.log(
        `🔐 Authenticated user: ${socket.userEmail} (${socket.userId})`
      );
      next();
    } catch (error) {
      console.error("❌ Authentication failed:", error);
      next(new Error("Authentication failed"));
    }
  }

  private async handleJoinRoom(socket: AuthenticatedSocket, roomId: string) {
    if (!socket.userId || !socket.userEmail) return;

    // If roomId looks like a room code (contains dashes), convert it to room ID
    let actualRoomId = roomId;

    if (roomId.includes("-")) {
      console.log(`Converting room code ${roomId} to room ID...`);
      try {
        const roomData = await this.getRoomByCode(
          roomId,
          socket.userId,
          socket.userEmail
        );
        console.log(`getRoomByCode returned in join:`, roomData);
        if (!roomData) {
          console.error(`Room not found for code: ${roomId}`);
          return;
        }
        actualRoomId = roomData.id.toString();
        console.log(`Room code ${roomId} resolved to room ID: ${actualRoomId}`);
      } catch (error) {
        console.error("Room code conversion failed:", error);
        return;
      }
    }

    // Leave the previous room if any
    this.handleLeaveRoom(socket);

    // Join the new room using the actual room ID
    socket.roomId = actualRoomId;
    socket.join(actualRoomId);

    // Notify other users in the room
    socket.to(actualRoomId).emit("message", {
      content: `${socket.userEmail} has joined the collaboration room`,
      timestamp: Date.now(),
      system: true,
    });

    // Add user to room participants
    if (!this.roomParticipants[actualRoomId]) {
      this.roomParticipants[actualRoomId] = new Map();
    }

    const userInfo: UserInfo = {
      userId: socket.userId,
      userEmail: socket.userEmail,
      socketId: socket.id,
    };

    this.roomParticipants[actualRoomId].set(socket.userId, userInfo);

    // Notify others in the room about the new user
    const joinEvent: UserJoinEvent = {
      roomId: actualRoomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      timestamp: Date.now(),
    };

    socket.to(actualRoomId).emit("user-joined", joinEvent);

    // Send current participants list to the new user
    const participants = Array.from(
      this.roomParticipants[actualRoomId].values()
    );
    socket.emit("room-participants", { roomId: actualRoomId, participants });

    // Send chat history to the new user
    this.sendChatHistory(socket, actualRoomId);

    console.log(
      `✅ User ${socket.userEmail} joined collaboration room ${actualRoomId}`
    );
  }

  private async handleChatSend(
    socket: AuthenticatedSocket,
    data: { roomId?: string; message?: string; uid?: string; email?: string },
    ack?: (res: { ok: boolean; error?: string }) => void
  ) {
    try {
      console.log("[chat:send] incoming:", {
        socketId: socket.id,
        userId: socket.userId,
        email: socket.userEmail,
        data,
      });

      const roomId = (data?.roomId || "").trim();
      const msg = (data?.message || "").trim();

      if (!roomId || !msg) {
        const error = "roomId and message are required";
        console.warn("[chat:send] validation failed:", {
          socketId: socket.id,
          roomId,
          hasMsg: !!msg,
        });
        socket.emit("chat:error", { message: error });
        ack?.({ ok: false, error });
        return;
      }

      if (msg.length > this.maxChatMessageLength) {
        const error = "Message is too long";
        console.warn("[chat:send] message too long:", {
          socketId: socket.id,
          length: msg.length,
          roomId,
        });
        socket.emit("chat:error", { message: error });
        ack?.({ ok: false, error });
        return;
      }

      // Convert room code to actual room ID if needed
      let actualRoomId = roomId;
      if (roomId.includes("-") && socket.userId && socket.userEmail) {
        console.log(`Converting room code ${roomId} to room ID for chat...`);
        try {
          const roomData = await this.getRoomByCode(
            roomId,
            socket.userId,
            socket.userEmail
          );
          console.log(`getRoomByCode returned:`, roomData);
          if (roomData) {
            actualRoomId = roomData.id.toString();
            console.log(
              `Room code ${roomId} resolved to room ID: ${actualRoomId} for chat`
            );
          } else {
            console.log(
              `getRoomByCode returned null/falsy for room code: ${roomId}`
            );
          }
        } catch (error) {
          console.error("Room code conversion failed in chat:", error);
          // Continue with original roomId if conversion fails
        }
      }

      // Ensure sender is in the room (using actual room ID)
      if (!socket.rooms.has(actualRoomId)) {
        const error = "Join the room before sending messages";
        console.warn("[chat:send] sender not in room:", {
          socketId: socket.id,
          roomId,
          actualRoomId,
          rooms: Array.from(socket.rooms),
        });
        socket.emit("chat:error", { message: error });
        ack?.({ ok: false, error });
        return;
      }

      const chatMessage: ChatMessage = {
        uid: data.uid || socket.userId!,
        email: data.email || socket.userEmail!,
        content: msg,
        timestamp: Date.now(),
      };

      // Store message in chat history using actual room ID
      this.addToChatHistory(actualRoomId, chatMessage);

      const roomSize =
        this.io.sockets.adapter.rooms.get(actualRoomId)?.size || 0;
      console.log("[chat:send] broadcasting to room:", {
        roomId,
        actualRoomId,
        roomSize,
        from: socket.userEmail,
      });

      // Broadcast to all users in the room (including sender for consistency)
      this.io.to(actualRoomId).emit("message", chatMessage);
      ack?.({ ok: true });
    } catch (err) {
      console.error("[chat:send] error:", err);
      socket.emit("chat:error", { message: "Failed to send message" });
      ack?.({ ok: false, error: "Failed to send message" });
    }
  }

  private handleLeaveRoom(socket: AuthenticatedSocket) {
    if (!socket.roomId || !socket.userId) return;

    const roomId = socket.roomId;

    // Notify other users
    socket.to(roomId).emit("message", {
      content: `${socket.userEmail} has left the collaboration room`,
      timestamp: Date.now(),
      system: true,
    });

    socket.leave(roomId);

    // Remove user from room participants
    if (this.roomParticipants[roomId]) {
      this.roomParticipants[roomId].delete(socket.userId);

      // Clean up empty rooms
      if (this.roomParticipants[roomId].size === 0) {
        delete this.roomParticipants[roomId];
        delete this.chatHistory[roomId]; // Also clean up chat history
      }
    }

    // Notify others about user leaving
    socket.to(roomId).emit("user-left", {
      roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      timestamp: Date.now(),
    });

    socket.roomId = undefined;
    console.log(
      `✅ User ${socket.userEmail} left collaboration room ${roomId}`
    );
  }

  private handleCodeChange(
    socket: AuthenticatedSocket,
    data: { content: string; cursorPosition?: { line: number; column: number } }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const changeEvent: CodeChangeEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      content: data.content,
      cursorPosition: data.cursorPosition,
      timestamp: Date.now(),
    };

    // Broadcast to all other users in the room
    socket.to(socket.roomId).emit("code-changed", changeEvent);

    console.log(
      `📝 Code change by ${socket.userEmail} in room ${socket.roomId}`
    );
  }

  private handleCursorMove(
    socket: AuthenticatedSocket,
    data: { position: { line: number; column: number } }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const cursorEvent: CursorMoveEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      position: data.position,
      timestamp: Date.now(),
    };

    // Broadcast cursor position to all other users in the room
    socket.to(socket.roomId).emit("cursor-moved", cursorEvent);
  }

  private handleSelectionChange(
    socket: AuthenticatedSocket,
    data: {
      startPos: { line: number; column: number };
      endPos: { line: number; column: number };
    }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const selectionEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      startPos: data.startPos,
      endPos: data.endPos,
      timestamp: Date.now(),
    };

    // Broadcast selection to all other users in the room
    socket.to(socket.roomId).emit("selection-changed", selectionEvent);
  }

  private handleDisconnect(socket: AuthenticatedSocket) {
    console.log(
      `❌ User ${socket.userEmail} (${socket.userId}) disconnected from Collaboration Service`
    );
    this.handleLeaveRoom(socket);
  }

  private addToChatHistory(roomId: string, message: ChatMessage) {
    if (!this.chatHistory[roomId]) {
      this.chatHistory[roomId] = [];
    }

    this.chatHistory[roomId].push(message);

    // Keep only the most recent messages
    if (this.chatHistory[roomId].length > this.chatHistoryLimit) {
      this.chatHistory[roomId] = this.chatHistory[roomId].slice(
        -this.chatHistoryLimit
      );
    }
  }

  private sendChatHistory(socket: AuthenticatedSocket, roomId: string) {
    const history = this.chatHistory[roomId] || [];
    socket.emit("chat-history", { roomId, messages: history });
  }

  // Public methods for external access
  public getRoomParticipants(roomId: string): UserInfo[] {
    return Array.from(this.roomParticipants[roomId]?.values() || []);
  }

  public broadcastToRoom(roomId: string, event: string, data: any) {
    this.io.to(roomId).emit(event, data);
  }

  public kickUserFromRoom(roomId: string, userId: string, reason?: string) {
    const userInfo = this.roomParticipants[roomId]?.get(userId);
    if (userInfo) {
      const socket = this.io.sockets.sockets.get(userInfo.socketId);
      if (socket) {
        socket.emit("kicked-from-room", {
          roomId,
          reason,
          timestamp: Date.now(),
        });
        socket.leave(roomId);
        this.handleLeaveRoom(socket as AuthenticatedSocket);
      }
    }
  }
}

export default RealtimeCollaborationService;
