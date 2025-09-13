import { Server as SocketServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { YjsDocumentManager } from "./yjsDocumentManager.service";

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
  changeId?: string; // For tracking individual changes
  fileId?: string; // For multi-file support
  fileName?: string; // Human-readable filename
  lineNumber?: number; // Specific line being edited
  changeType?: "edit" | "insert" | "delete"; // Type of change
}

interface CursorMoveEvent {
  roomId: string;
  userId: string;
  userEmail: string;
  position: { line: number; column: number };
  timestamp: number;
}

interface SelectionChangeEvent {
  roomId: string;
  userId: string;
  userEmail: string;
  startPos: { line: number; column: number };
  endPos: { line: number; column: number };
  timestamp: number;
}

interface TypingIndicatorEvent {
  userId: string;
  userEmail: string;
  position?: { line: number; column: number };
  timestamp: number;
}

interface LanguageChangeEvent {
  userId: string;
  userEmail: string;
  language: string;
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
  private codeHistory: { [roomId: string]: CodeChangeEvent[] } = {}; // Track code changes per room
  private yjsManager: YjsDocumentManager; // Add YJS integration

  // Configuration from environment variables
  private readonly maxChatMessageLength: number;
  private readonly chatHistoryLimit: number;
  private readonly codeHistoryLimit: number;

  constructor(httpServer: HttpServer) {
    this.maxChatMessageLength = parseInt(
      process.env.CHAT_MESSAGE_MAX_LENGTH || "5000"
    );
    this.chatHistoryLimit = parseInt(process.env.CHAT_HISTORY_LIMIT || "100");
    this.codeHistoryLimit = parseInt(process.env.CODE_HISTORY_LIMIT || "50");

    // Initialize YJS document manager
    this.yjsManager = new YjsDocumentManager();

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
          changeId?: string;
          notebookId?: string; // Optional: sync with YJS if provided
          blockId?: string; // Optional: sync with specific block
        }) => {
          this.handleCodeChange(socket, data);
        }
      );

      socket.on(
        "cursor-move",
        (data: {
          position: { line: number; column: number };
          notebookId?: string;
          blockId?: string;
        }) => {
          this.handleCursorMove(socket, data);
        }
      );

      socket.on(
        "selection-change",
        (data: {
          startPos: { line: number; column: number };
          endPos: { line: number; column: number };
          notebookId?: string;
          blockId?: string;
        }) => {
          this.handleSelectionChange(socket, data);
        }
      );

      // Additional code collaboration events
      socket.on(
        "typing-start",
        (data: {
          position: { line: number; column: number };
          notebookId?: string;
          blockId?: string;
        }) => {
          this.handleTypingStart(socket, data);
        }
      );

      socket.on("typing-stop", () => {
        this.handleTypingStop(socket);
      });

      socket.on("language-change", (data: { language: string }) => {
        this.handleLanguageChange(socket, data);
      });

      // YJS Document collaboration events
      socket.on(
        "yjs-update",
        (data: { notebookId: string; update: string }) => {
          this.handleYjsUpdate(socket, data);
        }
      );

      socket.on("request-yjs-state", (data: { notebookId: string }) => {
        this.handleRequestYjsState(socket, data);
      });

      // Notebook management events
      socket.on(
        "notebook:create",
        (data: { roomId: string; title: string }) => {
          this.handleCreateNotebook(socket, data);
        }
      );

      socket.on(
        "notebook:delete",
        (data: { roomId: string; notebookId: string }) => {
          this.handleDeleteNotebook(socket, data);
        }
      );

      socket.on(
        "notebook:update",
        (data: { notebookId: string; title: string }) => {
          this.handleUpdateNotebook(socket, data);
        }
      );

      // Request chat history when joining a room
      socket.on("request-chat-history", (data: { roomId: string }) => {
        this.sendChatHistory(socket, data.roomId);
      });
    });
  }

  private handleYjsUpdate(
    socket: AuthenticatedSocket,
    data: { notebookId: string; update: string }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    try {
      // Apply the update to the YJS document
      const updateBytes = Buffer.from(data.update, "base64");
      this.yjsManager.applyUpdate(data.notebookId, updateBytes);

      // Broadcast the update to other users in the room
      socket.to(socket.roomId).emit("yjs-update", {
        notebookId: data.notebookId,
        update: data.update,
        userId: socket.userId,
        userEmail: socket.userEmail,
      });

      console.log(
        `📝 YJS update applied for notebook ${data.notebookId} by ${socket.userEmail}`
      );
    } catch (error) {
      console.error("Error handling YJS update:", error);
      socket.emit("error", {
        message: "Failed to apply document update",
      });
    }
  }

  private handleRequestYjsState(
    socket: AuthenticatedSocket,
    data: { notebookId: string }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    try {
      // Get the current state of the YJS document
      const state = this.yjsManager.getDocumentState(data.notebookId);
      const stateBase64 = Buffer.from(state).toString("base64");

      // Send the state back to the requesting client
      socket.emit("yjs-state", {
        notebookId: data.notebookId,
        state: stateBase64,
      });

      console.log(
        `📤 YJS state sent for notebook ${data.notebookId} to ${socket.userEmail}`
      );
    } catch (error) {
      console.error("Error handling YJS state request:", error);
      socket.emit("error", {
        message: "Failed to get document state",
      });
    }
  }

  private async handleCreateNotebook(
    socket: AuthenticatedSocket,
    data: { roomId: string; title: string }
  ) {
    if (!socket.userId || !socket.userEmail) return;

    try {
      const notebook = await this.yjsManager.createNotebook(
        data.roomId,
        data.title,
        socket.userId
      );

      // Broadcast the new notebook to all users in the room
      this.io.to(data.roomId).emit("notebook:created", {
        notebook,
        createdBy: socket.userEmail,
        timestamp: Date.now(),
      });

      console.log(
        `📓 Notebook "${data.title}" created in room ${data.roomId} by ${socket.userEmail}`
      );
    } catch (error) {
      console.error("Error creating notebook:", error);
      socket.emit("error", {
        message: "Failed to create notebook",
      });
    }
  }

  private handleDeleteNotebook(
    socket: AuthenticatedSocket,
    data: { roomId: string; notebookId: string }
  ) {
    if (!socket.userId || !socket.userEmail) return;

    try {
      // Broadcast notebook deletion to all users in the room
      this.io.to(data.roomId).emit("notebook:deleted", {
        notebookId: data.notebookId,
        deletedBy: socket.userEmail,
        timestamp: Date.now(),
      });

      console.log(
        `🗑️ Notebook ${data.notebookId} deleted from room ${data.roomId} by ${socket.userEmail}`
      );
    } catch (error) {
      console.error("Error deleting notebook:", error);
      socket.emit("error", {
        message: "Failed to delete notebook",
      });
    }
  }

  private async handleUpdateNotebook(
    socket: AuthenticatedSocket,
    data: { notebookId: string; title: string }
  ) {
    if (!socket.userId || !socket.userEmail) return;

    try {
      // Update the notebook
      const updatedNotebook = await this.yjsManager.updateNotebook(
        data.notebookId,
        {
          title: data.title,
        }
      );

      if (!updatedNotebook) {
        socket.emit("error", {
          message: "Notebook not found",
        });
        return;
      }

      // Find the room ID for the notebook
      let roomId: string | null = null;
      for (const [currentRoomId, participants] of Object.entries(
        this.roomParticipants
      )) {
        if (participants.has(socket.userId)) {
          roomId = currentRoomId;
          break;
        }
      }

      if (roomId) {
        // Broadcast notebook update to all users in the room
        this.io.to(roomId).emit("notebook:updated", {
          notebook: updatedNotebook,
          updatedBy: socket.userEmail,
          timestamp: Date.now(),
        });

        console.log(
          `📝 Notebook ${data.notebookId} renamed to "${data.title}" by ${socket.userEmail}`
        );
      }
    } catch (error) {
      console.error("Error updating notebook:", error);
      socket.emit("error", {
        message: "Failed to update notebook",
      });
    }
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
    this.handleLeaveRoom(socket);

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

    // Send chat history to the new user
    this.sendChatHistory(socket, roomId);

    // Send code history to the new user
    this.sendCodeHistory(socket, roomId);

    // Ensure default notebook exists for the room
    this.ensureDefaultNotebook(roomId, socket.userId);

    console.log(
      `✅ User ${socket.userEmail} joined collaboration room ${roomId}`
    );
  }

  private async ensureDefaultNotebook(roomId: string, userId: string) {
    try {
      const notebooks = await this.yjsManager.getNotebooks(roomId);

      // Check if there's already a default notebook (main.py)
      const hasDefaultNotebook = notebooks.some((nb) => nb.title === "main.py");

      if (!hasDefaultNotebook) {
        // Create the default notebook
        const defaultNotebook = await this.yjsManager.createNotebook(
          roomId,
          "main.py",
          userId
        );

        // Create a default code block
        const defaultBlock = this.yjsManager.createBlock(
          defaultNotebook.id,
          "code",
          0,
          "python"
        );

        console.log(`📓 Created default notebook "main.py" for room ${roomId}`);

        // Notify all users in the room about the new notebook
        this.io.to(roomId).emit("notebook:created", {
          notebook: defaultNotebook,
          createdBy: userId,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("Error ensuring default notebook:", error);
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
        delete this.codeHistory[roomId]; // Also clean up code history
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
    data: {
      content: string;
      cursorPosition?: { line: number; column: number };
      changeId?: string;
      notebookId?: string; // Optional: sync with YJS if provided
      blockId?: string; // Optional: sync with specific block
    }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const changeEvent: CodeChangeEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      content: data.content,
      cursorPosition: data.cursorPosition,
      changeId:
        data.changeId ||
        `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      fileId: data.notebookId || "main", // Use notebookId as fileId if provided
      fileName: data.notebookId ? `${data.notebookId}.ipynb` : "main.js",
      lineNumber: data.cursorPosition?.line || 0,
      changeType: "edit", // Default change type
    };

    // If notebookId and blockId are provided, sync with YJS document
    if (data.notebookId && data.blockId) {
      try {
        const ytext = this.yjsManager.getBlockText(
          data.notebookId,
          data.blockId
        );
        if (ytext) {
          // Update the YJS text content
          ytext.delete(0, ytext.length);
          ytext.insert(0, data.content);

          console.log(
            `🔄 Synced code change with YJS notebook ${data.notebookId}, block ${data.blockId}`
          );
        }
      } catch (error) {
        console.error("Error syncing code change with YJS:", error);
      }
    }

    // Broadcast to all other users in the room
    socket.to(socket.roomId).emit("code-changed", changeEvent);

    // Store the change in history
    this.addToCodeHistory(socket.roomId, changeEvent);

    console.log(
      `📝 Code change by ${socket.userEmail} in room ${socket.roomId}`
    );
  }

  private handleCursorMove(
    socket: AuthenticatedSocket,
    data: {
      position: { line: number; column: number };
      notebookId?: string;
      blockId?: string;
    }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const cursorEvent: CursorMoveEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      position: data.position,
      timestamp: Date.now(),
    };

    // Enhanced cursor event with block information
    const enhancedCursorEvent = {
      ...cursorEvent,
      notebookId: data.notebookId,
      blockId: data.blockId,
    };

    // Broadcast cursor position to all other users in the room
    socket.to(socket.roomId).emit("cursor-moved", enhancedCursorEvent);
  }

  private handleSelectionChange(
    socket: AuthenticatedSocket,
    data: {
      startPos: { line: number; column: number };
      endPos: { line: number; column: number };
      notebookId?: string;
      blockId?: string;
    }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    const selectionEvent = {
      roomId: socket.roomId,
      userId: socket.userId,
      userEmail: socket.userEmail,
      startPos: data.startPos,
      endPos: data.endPos,
      notebookId: data.notebookId,
      blockId: data.blockId,
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

  private addToCodeHistory(roomId: string, changeEvent: CodeChangeEvent) {
    if (!this.codeHistory[roomId]) {
      this.codeHistory[roomId] = [];
    }

    this.codeHistory[roomId].push(changeEvent);

    // Keep only the most recent code changes
    if (this.codeHistory[roomId].length > this.codeHistoryLimit) {
      this.codeHistory[roomId] = this.codeHistory[roomId].slice(
        -this.codeHistoryLimit
      );
    }
  }

  private sendChatHistory(socket: AuthenticatedSocket, roomId: string) {
    const history = this.chatHistory[roomId] || [];
    socket.emit("chat-history", { roomId, messages: history });
  }

  private sendCodeHistory(socket: AuthenticatedSocket, roomId: string) {
    const history = this.codeHistory[roomId] || [];
    socket.emit("code-history", { roomId, changes: history });
  }

  // Public methods for external access
  public getRoomParticipants(roomId: string): UserInfo[] {
    return Array.from(this.roomParticipants[roomId]?.values() || []);
  }

  private handleTypingStart(
    socket: AuthenticatedSocket,
    data: {
      position: { line: number; column: number };
      notebookId?: string;
      blockId?: string;
    }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    // Broadcast to other users in the room
    socket.to(socket.roomId).emit("typing-start", {
      userId: socket.userId,
      userEmail: socket.userEmail,
      position: data.position,
      notebookId: data.notebookId,
      blockId: data.blockId,
      timestamp: Date.now(),
    });
  }

  private handleTypingStop(socket: AuthenticatedSocket) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    // Broadcast to other users in the room
    socket.to(socket.roomId).emit("typing-stop", {
      userId: socket.userId,
      userEmail: socket.userEmail,
      timestamp: Date.now(),
    });
  }

  private handleLanguageChange(
    socket: AuthenticatedSocket,
    data: { language: string }
  ) {
    if (!socket.roomId || !socket.userId || !socket.userEmail) return;

    // Broadcast to other users in the room
    socket.to(socket.roomId).emit("language-change", {
      userId: socket.userId,
      userEmail: socket.userEmail,
      language: data.language,
      timestamp: Date.now(),
    });
  }

  public broadcastToRoom(roomId: string, event: string, data: any) {
    this.io.to(roomId).emit(event, data);
  }

  public getRoomCodeHistory(roomId: string): CodeChangeEvent[] {
    return this.codeHistory[roomId] || [];
  }

  public getRoomChatHistory(roomId: string): ChatMessage[] {
    return this.chatHistory[roomId] || [];
  }

  public clearRoomHistory(
    roomId: string,
    type: "chat" | "code" | "all" = "all"
  ) {
    if (type === "chat" || type === "all") {
      delete this.chatHistory[roomId];
    }
    if (type === "code" || type === "all") {
      delete this.codeHistory[roomId];
    }
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

  public getYjsManager(): YjsDocumentManager {
    return this.yjsManager;
  }
}

export default RealtimeCollaborationService;
