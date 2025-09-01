import { Server as SocketServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { addChatMessage, getRoomChatMessages } from "./chatService"; // Import chat service


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

    // a user connect
    // this.io.on("connection", (socket: AuthenticatedSocket) => {
    //     console.log("A user connected:", socket.id);
    //     // ...other handlers...

    //     socket.emit("message", { content: "Welcome to the chat!" });
    // });

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log("A user connected:", socket.id);
      console.log(`✅ User ${socket.userEmail} (${socket.userId}) connected to WebSocket`);

      // Welcome current user
      socket.emit("message", { content: "Welcome to the chat!" });

      // Broadcast when a user connects
      socket.broadcast.emit('message', { content: 'A user has joined the chat' });

      // Handle joining a room
      socket.on("join-room", (data: { roomId: string }) => {
        this.handleJoinRoom(socket, data.roomId);
      });

      // Handle leaving a room
      socket.on("leave-room", () => {
        this.handleLeaveRoom(socket);
      });


      // socket.on(
      //   "chat:send",
      //   async (data: { roomId: string; userId?: string; content?: string; message?: string }) => {
      //     const uid = data.userId || socket.userId!;

      //     // 🔑 Normalize message field
      //     const msg = (data.content ?? data.message ?? "").trim();

      //     console.log("[chat:send] received =>", {
      //       roomId: data.roomId,
      //       uid,
      //       contentLen: msg.length,
      //     });

      //     if (!msg) {
      //       console.warn("[chat:send] message is missing or empty");
      //       socket.emit("chat:error", { message: "Message cannot be empty" });
      //       return;
      //     }

      //     try {
      //       await this.handleChatSend(socket, { roomId: data.roomId, uid, message: msg });
      //       console.log("[chat:send] handled successfully", {
      //         roomId: data.roomId,
      //         uid,
      //         contentLen: msg.length,
      //       });
      //     } catch (e) {
      //       console.error("[chat:send] failed:", e);
      //     }
      //   }
      // );



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

      // Handle disconnect
      socket.on("disconnect", () => {
        this.io.emit('message', { content: 'A user has left the chat' });
        this.handleDisconnect(socket);
      });

      // Listen for chatMessage
      socket.on("chat:send", (data: { roomId: string; uid: string; message: string }) => {
        // console.log("[chat:send] event received:", data);
        this.io.emit('message', { content: data.message });
        this.handleChatSend(socket, data);
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





// private async handleChatSend(
//   socket: AuthenticatedSocket,
//   data: { roomId: string; uid: string; message: string }
// ) {
//   if (!data.roomId || !data.uid || !data.message?.trim()) {
//     console.warn("[handleChatSend] missing field(s)", {
//       uid: data.uid,
//       roomId: data.roomId,
//       message: data.message,
//     });
//     socket.emit("chat:error", { message: "roomId, uid and message are required" });
//     return;
//   }

//   try {
//     console.log("[handleChatSend] inserting into array =>", {
//       room_id: data.roomId,
//       uid: data.uid,
//       messageLen: data.message.length,
//     });

//     const savedMessage = await addChatMessage(data.roomId, data.uid, data.message);

//     this.io.to(data.roomId).emit("chat:new", {
//       roomId: data.roomId,
//       message: savedMessage,
//     });
//   } catch (err) {
//     console.error("[handleChatSend] DB insert FAILED:", err);
//     socket.emit("chat:error", { message: "Failed to send message" });
//   }
// }

private async handleChatSend(
  socket: AuthenticatedSocket,
  data: { roomId: string; uid: string; message: string }
) {
  if (!data.roomId || !data.uid || !data.message?.trim()) {
    // console.warn("[handleChatSend] missing field(s)", {
    //   uid: data.uid,
    //   roomId: data.roomId,
    //   message: data.message,
    // });
    socket.emit("chat:error", { message: "roomId, uid and message are required" });
    return;
  }

  const payload = {
    roomId: data.roomId,
    uid: data.uid,
    content: data.message,
    timestamp: Date.now(),
  };

  // console.log("[handleChatSend] broadcasting =>", {
  //   room_id: data.roomId,
  //   uid: data.uid,
  //   messageLen: data.message.length,
  // });

  // No DB insert — just broadcast to everyone in the room
  this.io.to(data.roomId).emit("chat:new", payload);
}



  private handleJoinRoom(socket: AuthenticatedSocket, roomId: string) {
    if (!socket.userId || !socket.userEmail) return;

    // Leave the previous room if any
    this.handleLeaveRoom(socket);

    // Join the new room
    socket.roomId = roomId;
    socket.join(roomId);

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

    socket.to(roomId).emit("user-joined", joinEvent);

    // Send current participants list to the new user
    const participants = Array.from(this.roomParticipants[roomId].values());
    socket.emit("room-participants", { roomId, participants });

    console.log(`✅ User ${socket.userEmail} joined room ${roomId}`);
  }

  private handleLeaveRoom(socket: AuthenticatedSocket) {
    if (!socket.roomId || !socket.userId) return;

    const roomId = socket.roomId;
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
