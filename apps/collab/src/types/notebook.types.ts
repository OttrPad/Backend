// TypeScript interfaces for the notebook collaboration system
export interface NotebookBlock {
  id: string;
  type: "code" | "markdown" | "output";
  language?: string; // for code blocks
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotebookDocument {
  id: string;
  title: string;
  roomId: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserPresence {
  userId: string;
  userEmail: string;
  userName: string;
  notebookId: string;
  blockId: string;
  line: number;
  column: number;
  color: string;
  timestamp: number;
}

export interface YjsNotebookData {
  blocks: Map<string, NotebookBlock>; // Y.Map
  blockContent: Map<string, any>; // Y.Map containing Y.Text for each block
  metadata: Map<string, any>; // Y.Map for notebook metadata
}

export interface CollaborationRoom {
  roomId: string;
  notebooks: Map<string, YjsNotebookData>; // notebookId -> Y.Doc data
  participants: Map<string, UserPresence>;
  chatHistory: Array<ChatMessage>;
  createdAt: number;
  lastActivity: number;
}

export interface CodeExecutionResult {
  blockId: string;
  output: string;
  error?: string;
  executionTime: number;
  timestamp: number;
}

export interface BlockCursorPosition {
  blockId: string;
  line: number;
  column: number;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface ChatMessage {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

// Socket event types
export interface SocketEvents {
  // Authentication
  "join-room": (data: { roomId: string; token: string }) => void;
  "leave-room": (data: { roomId: string }) => void;

  // Notebook management
  "create-notebook": (data: { roomId: string; title: string }) => void;
  "delete-notebook": (data: { roomId: string; notebookId: string }) => void;
  "get-notebooks": (data: { roomId: string }) => void;

  // Block management
  "create-block": (data: {
    roomId: string;
    notebookId: string;
    type: string;
    position: number;
    language?: string;
  }) => void;
  "delete-block": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
  }) => void;
  "move-block": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
    newPosition: number;
  }) => void;

  // Content synchronization
  "yjs-update": (data: {
    roomId: string;
    notebookId: string;
    update: Uint8Array;
  }) => void;
  "yjs-sync-request": (data: { roomId: string; notebookId: string }) => void;

  // Cursor and presence
  "cursor-position": (data: {
    roomId: string;
    notebookId: string;
    position: BlockCursorPosition;
  }) => void;
  "user-presence": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
    line: number;
    column: number;
  }) => void;

  // Code execution
  "execute-block": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
    code: string;
  }) => void;

  // Chat
  "send-message": (data: { roomId: string; message: string }) => void;
}

export interface ClientEvents {
  // Room events
  "room-joined": (data: {
    roomId: string;
    participants: UserPresence[];
  }) => void;
  "room-left": (data: { roomId: string }) => void;
  "user-joined": (data: { roomId: string; user: UserPresence }) => void;
  "user-left": (data: { roomId: string; userId: string }) => void;

  // Notebook events
  "notebook-created": (data: {
    roomId: string;
    notebook: NotebookDocument;
  }) => void;
  "notebook-deleted": (data: { roomId: string; notebookId: string }) => void;
  "notebooks-list": (data: {
    roomId: string;
    notebooks: NotebookDocument[];
  }) => void;

  // Block events
  "block-created": (data: {
    roomId: string;
    notebookId: string;
    block: NotebookBlock;
  }) => void;
  "block-deleted": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
  }) => void;
  "block-moved": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
    newPosition: number;
  }) => void;

  // Content synchronization
  "yjs-update": (data: {
    roomId: string;
    notebookId: string;
    update: Uint8Array;
  }) => void;
  "yjs-sync-response": (data: {
    roomId: string;
    notebookId: string;
    state: Uint8Array;
  }) => void;

  // Cursor and presence
  "cursor-update": (data: {
    roomId: string;
    notebookId: string;
    userId: string;
    position: BlockCursorPosition;
  }) => void;
  "presence-update": (data: {
    roomId: string;
    notebookId: string;
    users: UserPresence[];
  }) => void;

  // Code execution
  "execution-result": (data: {
    roomId: string;
    notebookId: string;
    blockId: string;
    result: CodeExecutionResult;
  }) => void;

  // Chat
  "message-received": (data: { roomId: string; message: ChatMessage }) => void;
  "chat-history": (data: { roomId: string; messages: ChatMessage[] }) => void;

  // Error handling
  error: (data: { code: string; message: string; details?: any }) => void;
}
