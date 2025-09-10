import { WebSocket } from "ws";
import * as Y from "yjs";

// Basic interfaces for Phase 1
export interface UserInfo {
  userId: string;
  userName: string;
  userEmail: string;
  userColor: string;
  websocket: WebSocket;
  cursor?: CursorPosition;
  joinedAt: number;
  lastActivity: number;
}

export interface CursorPosition {
  blockId: string;
  position: number;
  selection?: {
    start: number;
    end: number;
  };
}

export interface YjsRoom {
  roomId: string;
  doc: Y.Doc;
  participants: Map<string, UserInfo>;
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
}

// Yjs Document Structure
export interface YjsSharedDoc {
  blocks: Y.Array<Y.Map<any>>;
  cursors: Y.Map<Y.Map<any>>;
  metadata: Y.Map<any>;
}

export interface YjsBlock {
  id: string;
  lang: "python" | "json" | "markdown" | "javascript" | "typescript";
  content: string; // Will be Y.Text in the actual Yjs doc
  collapsed: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserCursor {
  userId: string;
  userName: string;
  userColor: string;
  blockId: string;
  position: number;
  selection?: {
    start: number;
    end: number;
  };
  lastUpdated: number;
}

// WebSocket message types
export interface WebSocketMessage {
  type:
    | "auth"
    | "cursor"
    | "presence"
    | "sync"
    | "error"
    | "snapshot"
    | "doc_sync"
    | "doc_update"
    | "snapshot_created"
    | "auth_success";
  data: any;
  userId?: string;
  roomId?: string;
  timestamp: number;
}

export interface AuthMessage {
  token: string;
  roomId: string;
}

export interface CursorMessage {
  blockId: string;
  position: number;
  selection?: {
    start: number;
    end: number;
  };
}

export interface PresenceMessage {
  type: "user_joined" | "user_left" | "user_active" | "user_idle";
  userId: string;
  userName?: string;
  userColor?: string;
}

// Authentication types
export interface AuthenticatedUser {
  userId: string;
  email: string;
  name?: string;
}

export interface RoomAccess {
  hasAccess: boolean;
  role: "admin" | "editor" | "viewer";
}

// Error types
export interface CollaborationError {
  code: string;
  message: string;
  details?: any;
}

// Configuration types
export interface CollaborationConfig {
  port: number;
  maxRoomsInMemory: number;
  roomInactiveTimeout: number;
  userInactiveTimeout: number;
  maxUsersPerRoom: number;
  enableLogging: boolean;
}

// Statistics types
export interface RoomStats {
  roomId: string;
  activeUsers: number;
  totalUsers: number;
  documentSize: number;
  lastActivity: number;
  createdAt: number;
}

export interface ServerStats {
  activeRooms: number;
  totalConnections: number;
  memoryUsage: number;
  uptime: number;
  roomStats: RoomStats[];
}

// Connection management types
export interface ConnectionHealth {
  userId: string;
  roomId: string;
  lastPing: number;
  lastPong: number;
  missedPings: number;
  isAlive: boolean;
  connectedAt: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  connectionsPerRoom: Record<string, number>;
  averageSessionDuration: number;
  disconnectionReasons: Record<string, number>;
}

// Document persistence types
export interface DocumentState {
  roomId: string;
  yjsState: Uint8Array;
  version: number;
  lastUpdated: number;
  activeUsers: string[];
}

export interface DocumentVersion {
  id: string;
  roomId: string;
  yjsState: Uint8Array;
  version: number;
  createdBy: string;
  createdAt: number;
  snapshotReason: "manual" | "auto" | "milestone";
}
