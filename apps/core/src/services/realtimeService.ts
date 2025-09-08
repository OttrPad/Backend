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

class RealtimeService {
  private io: SocketServer;
  private roomParticipants: RoomParticipants = {};

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));


    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log("A user connected:", socket.id);
      console.log(`✅ User ${socket.userEmail} (${socket.userId}) connected to WebSocket`);

      // Welcome current user
      socket.emit("message", { content: "Welcome to the chat!" });

      // Broadcast when a user connects
      
      // socket.broadcast.emit('message', { content: 'A user has connected' });
 
      // Handle disconnect
      socket.on("disconnect", () => {
        // this.io.emit('message', { content: 'A user has disconnected' });
        this.handleDisconnect(socket);
      });


      socket.on(
        "chat:send",
        (
          data: { roomId?: string; message?: string; uid?: string; email?: string },
          ack?: (res: { ok: boolean; error?: string }) => void
        ) => this.handleChatSend(socket, data, ack)
      );

      
      // Handle joining a room
      socket.on("joinRoom", (data: { roomId: string }) => {
        
        this.handleJoinRoom(socket, data.roomId);
      });

      // Handle leaving a room
      socket.on("leaveRoom", () => {
        this.handleLeaveRoom(socket);
      });

      // Handle leaving a chat
      // socket.on("leave chat", () => {
      //   this.handleLeaveChat(socket);
      // });

      // Handle code changes
      socket.on("code-change", (data: { content: string; cursorPosition?: { line: number; column: number } }) => {
        this.handleCodeChange(socket, data);
      });

      // Handle cursor movements
      socket.on("cursor-move", (data: { position: { line: number; column: number } }) => {
        this.handleCursorMove(socket, data);
      });

      // Handle user selection changes
      socket.on("selection-change", (data: { startPos: { line: number; column: number }; endPos: { line: number; column: number } }) => {
        this.handleSelectionChange(socket, data);
      });


    });
  }

  private async authenticateSocket(socket: AuthenticatedSocket, next: Function) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      if (!jwtSecret) {
        return next(new Error("JWT secret not configured"));
      }

      const decoded = jwt.verify(token, jwtSecret) as any;
      socket.userId = decoded.sub;
      socket.userEmail = decoded.email;

      next();
    } catch (error) {
      console.error("Socket authentication failed:", error);
      next(new Error("Invalid token"));
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

      if (msg.length > 5000) {
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

      const payload = {
        uid: data.uid || socket.userId,
        email: data.email || socket.userEmail,
        content: msg,
        timestamp: Date.now(),
      };

      const roomSize = this.io.sockets.adapter.rooms.get(roomId)?.size || 0;
      console.log("[chat:send] broadcasting to room:", {
        roomId,
        roomSize,
        from: socket.userEmail,
      });

      // Broadcast (excludes sender to match original logic)
      socket.to(roomId).emit("message", payload);
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
    this.handleLeaveRoom(socket);

    // Join the new room
    socket.roomId = roomId;
    socket.join(roomId);
    socket.to(roomId).emit('message', { content: `${socket.userEmail} has joined the chat` });

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
    const joinEvent: UserJoinEvent = {
      roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      timestamp: Date.now(),
    };

    socket.to(roomId).emit("joinRoom", joinEvent);
   
    // Send current participants list to the new user
    const participants = Array.from(this.roomParticipants[roomId].values());
    socket.emit("room-participants", { roomId, participants });

    console.log(`✅ User ${socket.userEmail} joined room ${roomId}`);
  }



  private handleLeaveRoom(socket: AuthenticatedSocket) {
    if (!socket.roomId || !socket.userId) return;

    const roomId = socket.roomId;
    socket.to(roomId).emit('message', { content: `${socket.userEmail} has left the chat` });
    socket.leave(roomId);

    // Remove user from room participants
    if (this.roomParticipants[roomId]) {
      this.roomParticipants[roomId].delete(socket.userId);

      // Clean up empty rooms
      if (this.roomParticipants[roomId].size === 0) {
        delete this.roomParticipants[roomId];
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
    console.log(`✅ User ${socket.userEmail} left room ${roomId}`);
  }


  // private handleLeaveChat(socket: AuthenticatedSocket) {
  //   if (!socket.roomId || !socket.userId) return;

  //   const roomId = socket.roomId;
  //   socket.to(roomId).emit('message', { content: `${socket.userEmail} has left the chat` });

  //   // Notify others about user leaving
  //   socket.to(roomId).emit("user-left", {
  //     roomId,
  //     userId: socket.userId,
  //     userEmail: socket.userEmail,
  //     timestamp: Date.now(),
  //   });
  // }


  private handleCodeChange(socket: AuthenticatedSocket, data: { content: string; cursorPosition?: { line: number; column: number } }) {
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

    console.log(`📝 Code change by ${socket.userEmail} in room ${socket.roomId}`);
  }



  private handleCursorMove(socket: AuthenticatedSocket, data: { position: { line: number; column: number } }) {
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



  private handleSelectionChange(socket: AuthenticatedSocket, data: { startPos: { line: number; column: number }; endPos: { line: number; column: number } }) {
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
    console.log(`❌ User ${socket.userEmail} (${socket.userId}) disconnected`);
    this.handleLeaveRoom(socket);
  }



  // Public methods for external use
  public getRoomParticipants(roomId: string): UserInfo[] {
    return this.roomParticipants[roomId] ? Array.from(this.roomParticipants[roomId].values()) : [];
  }



  public kickUserFromRoom(roomId: string, userId: string) {
    if (this.roomParticipants[roomId]) {
      const userInfo = this.roomParticipants[roomId].get(userId);
      if (userInfo) {
        const socket = this.io.sockets.sockets.get(userInfo.socketId);
        if (socket) {
          socket.emit("kicked-from-room", { roomId, reason: "Removed by room admin" });
          socket.disconnect();
        }
      }
    }
  }


  
  public broadcastToRoom(roomId: string, event: string, data: any) {
    this.io.to(roomId).emit(event, data);
  }
}

export default RealtimeService;
