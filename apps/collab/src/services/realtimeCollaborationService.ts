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

  private setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(
        `✅ User ${socket.userEmail} (${socket.userId}) connected to Collaboration Service`
      );

      // Welcome current user
      // socket.emit("message", { content: "Welcome to the collaboration room!", timestamp: Date.now(), system: true });

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
      // socket.on("request-chat-history", (data: { roomId: string }) => {
      //   this.sendChatHistory(socket, data.roomId);
      // });
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

      // Ensure sender is in the room
      if (!socket.rooms.has(roomId)) {
        const error = "Join the room before sending messages";
        console.warn("[chat:send] sender not in room:", {
          socketId: socket.id,
          roomId,
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

      // Store message in chat history
      this.addToChatHistory(roomId, chatMessage);

      const roomSize = this.io.sockets.adapter.rooms.get(roomId)?.size || 0;
      console.log("[chat:send] broadcasting to room:", {
        roomId,
        roomSize,
        from: socket.userEmail,
      });

      // Broadcast to all users in the room (including sender for consistency)
      this.io.to(roomId).emit("message", chatMessage);
      ack?.({ ok: true });
    } catch (err) {
      console.error("[chat:send] error:", err);
      socket.emit("chat:error", { message: "Failed to send message" });
      ack?.({ ok: false, error: "Failed to send message" });
    }
  }

  

  private handleJoinRoom(socket: AuthenticatedSocket, roomId: string) {
    if (!socket.userId || !socket.userEmail) return;

    // Leave the previous room if any
    // this.handleLeaveRoom(socket);

    // Join the new room
    socket.roomId = roomId;
    socket.join(roomId);



    // Notify other users in the room
    socket.to(roomId).emit("message", {
      content: `${socket.userEmail} has joined the collaboration room`,
      timestamp: Date.now(),
      system: true,
    });


    // Add user to room participants
    if (!this.roomParticipants[roomId]) {
      this.roomParticipants[roomId] = new Map();
    }

    const userInfo: UserInfo = {
      userId: socket.userId,
      userEmail: socket.userEmail,
      socketId: socket.id,
    };

    this.roomParticipants[roomId].set(socket.userId, userInfo);

    // Notify others in the room about the new user
    // const joinEvent: UserJoinEvent = {
    //   roomId,
    //   userId: socket.userId,
    //   userEmail: socket.userEmail,
    //   timestamp: Date.now(),
    // };

    // socket.to(roomId).emit("user-joined", joinEvent);

    // Send current participants list to the new user
    // const participants = Array.from(this.roomParticipants[roomId].values());
    // socket.emit("room-participants", { roomId, participants });

    // Send chat history to the new user
    this.sendChatHistory(socket, roomId);

    console.log(
      `✅ User ${socket.userEmail} joined collaboration room ${roomId}`
    );
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
    // socket.to(roomId).emit("user-left", {
    //   roomId,
    //   userId: socket.userId,
    //   userEmail: socket.userEmail,
    //   timestamp: Date.now(),
    // });

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
