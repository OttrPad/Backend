# Real-time Code Collaboration API Guide

This guide covers the **real-time code collaboration features** for implementing collaborative notebooks and live code editing.

_Note: Chat functionality, authentication, and basic Socket.IO connection are already implemented._

## 🎯 Overview

The collaboration service provides:

- **Multiple notebooks per room** with independent Y.Doc instances
- **Block-level collaboration** within notebooks (code, markdown, output blocks)
- **Real-time cursor tracking** down to specific blocks and lines
- **Live code synchronization** with conflict-free editing via YJS
- **Typing indicators** and **text selection sharing**

## 🌐 API Endpoints & Configuration

### Base URLs

```javascript
// For REST API calls
const API_BASE_URL = "http://localhost:4000";

// For Socket.IO connection
const SOCKET_IO_URL = "http://localhost:5002";
```

### Frontend Environment Variables

```bash
# Development
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5002

# Production
NEXT_PUBLIC_API_URL=https://api.yourapp.com
NEXT_PUBLIC_SOCKET_URL=https://collab.yourapp.com
```

### Socket.IO Connection Setup

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5002", {
  auth: {
    token: "your-jwt-token",
  },
  transports: ["websocket", "polling"],
});

// Connection status
socket.on("connect", () => {
  console.log("Connected to collaboration service:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Disconnected from collaboration service");
});
```

### Health Checks & API Documentation

```bash
# API health check
GET http://localhost:4000/health

# API Documentation (Swagger)
GET http://localhost:4000/api-docs
```

### Development vs Production

```javascript
// Development configuration
const config = {
  apiBaseUrl: "http://localhost:4000",
  socketUrl: "http://localhost:5002",
};

// Production configuration
const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL,
};
```

### Authentication

All REST API endpoints require JWT authentication:

```javascript
// Add JWT token to all requests
const headers = {
  Authorization: `Bearer ${yourJwtToken}`,
  "Content-Type": "application/json",
};

// For Socket.IO authentication
const socket = io("http://localhost:5002", {
  auth: {
    token: yourJwtToken,
  },
});
```

## 📡 Prerequisites

Assuming you already have:

- ✅ Socket.IO connection established
- ✅ User authenticated with JWT
- ✅ Joined a collaboration room
- ✅ Chat functionality working

## 📓 Notebook Management

### List Notebooks in a Room

```http
GET http://localhost:4000/api/collaboration/rooms/{roomId}/notebooks
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "notebook_123_abc",
      "title": "My Data Analysis",
      "roomId": "room123",
      "createdBy": "user456",
      "createdAt": 1694426400000,
      "updatedAt": 1694426400000
    }
  ]
}
```

### Create a New Notebook

```http
POST http://localhost:4000/api/collaboration/rooms/{roomId}/notebooks
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "title": "My New Notebook"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "notebook_124_def",
    "title": "My New Notebook",
    "roomId": "room123",
    "createdBy": "user456",
    "createdAt": 1694426500000,
    "updatedAt": 1694426500000
  }
}
```

### Update/Rename a Notebook

```http
PUT http://localhost:4000/api/collaboration/notebooks/{notebookId}
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "title": "Renamed Notebook"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "notebook_124_def",
    "title": "Renamed Notebook",
    "roomId": "room123",
    "createdBy": "user456",
    "createdAt": 1694426500000,
    "updatedAt": 1694426600000
  }
}
```

### Delete a Notebook

```http
DELETE http://localhost:4000/api/collaboration/notebooks/{notebookId}
Authorization: Bearer your-jwt-token
```

**Response:**

```json
{
  "success": true,
  "message": "Notebook deleted successfully",
  "data": {
    "notebookId": "notebook_124_def"
  }
}
```

### Real-time Notebook Events

```javascript
// Listen for new notebooks created by others
socket.on("notebook:created", (data) => {
  console.log("New notebook created:", data.notebook);
  console.log("Created by:", data.createdBy);
});

// Listen for notebook updates (renames)
socket.on("notebook:updated", (data) => {
  console.log("Notebook updated:", data.notebook);
  console.log("Updated by:", data.updatedBy);
});

// Listen for notebook deletions
socket.on("notebook:deleted", (data) => {
  console.log("Notebook deleted:", data.notebookId);
  console.log("Deleted by:", data.deletedBy);
});

// Create notebook via Socket.IO (alternative to REST)
socket.emit("notebook:create", {
  roomId: "room123",
  title: "My Socket Notebook",
});

// Update notebook via Socket.IO (alternative to REST)
socket.emit("notebook:update", {
  notebookId: "notebook_123_abc",
  title: "Renamed via Socket",
});

// Delete notebook via Socket.IO
socket.emit("notebook:delete", {
  roomId: "room123",
  notebookId: "notebook_123_abc",
});
```

## 🧱 Block Management

### Get Blocks in a Notebook

```http
GET http://localhost:4000/api/collaboration/notebooks/{notebookId}/blocks
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "block_789_xyz",
      "type": "code",
      "language": "python",
      "position": 0,
      "createdAt": 1694426600000,
      "updatedAt": 1694426600000
    },
    {
      "id": "block_790_abc",
      "type": "markdown",
      "position": 1,
      "createdAt": 1694426700000,
      "updatedAt": 1694426700000
    }
  ]
}
```

### Create a New Block

```http
POST http://localhost:4000/api/collaboration/notebooks/{notebookId}/blocks
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "type": "code",
  "position": 0,
  "language": "python"
}
```

**Block Types:**

- `"code"` - Code cell (requires `language` field)
- `"markdown"` - Markdown cell
- `"output"` - Output cell

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "block_791_def",
    "type": "code",
    "language": "python",
    "position": 0,
    "createdAt": 1694426800000,
    "updatedAt": 1694426800000
  }
}
```

### Delete a Block

```http
DELETE http://localhost:4000/api/collaboration/notebooks/{notebookId}/blocks/{blockId}
Authorization: Bearer your-jwt-token
```

### Move a Block

```http
PUT http://localhost:4000/api/collaboration/notebooks/{notebookId}/blocks/{blockId}/position
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "position": 2
}
```

### Get Block Content

```http
GET http://localhost:4000/api/collaboration/notebooks/{notebookId}/blocks/{blockId}/content
```

**Response:**

```json
{
  "success": true,
  "data": {
    "content": "import pandas as pd\nprint('Hello World')"
  }
}
```

## ⌨️ Real-time Code Collaboration

### Send Code Changes

```javascript
// Basic code change
socket.emit("code-change", {
  content: 'print("Hello World")',
  cursorPosition: { line: 0, column: 20 },
  changeId: "change_123", // optional
});

// Code change in specific notebook block
socket.emit("code-change", {
  content: 'import pandas as pd\ndf = pd.read_csv("data.csv")',
  cursorPosition: { line: 1, column: 25 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
  changeId: "change_456",
});
```

### Receive Code Changes

```javascript
socket.on("code-changed", (data) => {
  console.log("Code changed by:", data.userEmail);
  console.log("New content:", data.content);
  console.log("Cursor at:", data.cursorPosition);
  console.log("In notebook:", data.fileId); // notebookId if provided
  console.log("Change ID:", data.changeId);
  console.log("Timestamp:", data.timestamp);
});
```

## 🖱️ Cursor and Selection Tracking

### Send Cursor Movement

```javascript
// Basic cursor movement
socket.emit("cursor-move", {
  position: { line: 5, column: 12 },
});

// Cursor movement in specific block
socket.emit("cursor-move", {
  position: { line: 5, column: 12 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});
```

### Receive Cursor Updates

```javascript
socket.on("cursor-moved", (data) => {
  console.log("User cursor moved:", data.userEmail);
  console.log("Position:", data.position);
  console.log("In notebook:", data.notebookId);
  console.log("In block:", data.blockId);

  // Update cursor visualization in your editor
  showUserCursor(data.userId, data.position, data.notebookId, data.blockId);
});
```

### Send Text Selection

```javascript
socket.emit("selection-change", {
  startPos: { line: 2, column: 0 },
  endPos: { line: 4, column: 15 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});
```

### Receive Selection Updates

```javascript
socket.on("selection-changed", (data) => {
  console.log("User selected text:", data.userEmail);
  console.log("Selection:", data.startPos, "to", data.endPos);

  // Highlight selected text in your editor
  showUserSelection(
    data.userId,
    data.startPos,
    data.endPos,
    data.notebookId,
    data.blockId
  );
});
```

## ⌨️ Typing Indicators

### Send Typing Status

```javascript
// User started typing
socket.emit("typing-start", {
  position: { line: 3, column: 8 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});

// User stopped typing
socket.emit("typing-stop");
```

### Receive Typing Updates

```javascript
socket.on("typing-start", (data) => {
  console.log(data.userEmail + " is typing at:", data.position);
  showTypingIndicator(
    data.userId,
    data.position,
    data.notebookId,
    data.blockId
  );
});

socket.on("typing-stop", (data) => {
  console.log(data.userEmail + " stopped typing");
  hideTypingIndicator(data.userId);
});
```

## 🎨 Language Synchronization

### Send Language Changes

```javascript
socket.emit("language-change", {
  language: "python",
});
```

### Receive Language Updates

```javascript
socket.on("language-change", (data) => {
  console.log("Language changed to:", data.language);
  console.log("Changed by:", data.userEmail);

  // Update syntax highlighting
  updateEditorLanguage(data.language);
});
```

## 🔄 YJS Document Synchronization

For advanced conflict-free collaborative editing using YJS:

### Send YJS Updates

```javascript
// When your YJS document changes
ydoc.on("update", (update) => {
  const updateBase64 = btoa(String.fromCharCode(...update));
  socket.emit("yjs-update", {
    notebookId: "notebook_123_abc",
    update: updateBase64,
  });
});
```

### Receive YJS Updates

```javascript
socket.on("yjs-update", (data) => {
  if (data.notebookId === currentNotebookId) {
    const update = Uint8Array.from(atob(data.update), (c) => c.charCodeAt(0));
    Y.applyUpdate(ydoc, update);
  }
});
```

### Request Document State

```javascript
// Request current state when joining
socket.emit("request-yjs-state", {
  notebookId: "notebook_123_abc",
});

socket.on("yjs-state", (data) => {
  const state = Uint8Array.from(atob(data.state), (c) => c.charCodeAt(0));
  Y.applyUpdate(ydoc, state);
});
```

## 👥 User Presence in Code Blocks

Since users are already tracked in the room, you can now track their presence in specific notebooks and blocks:

```javascript
// Track when users enter/leave specific notebooks or blocks
socket.on("cursor-moved", (data) => {
  // Update user presence in specific blocks
  updateUserPresenceInBlock(data.userId, data.notebookId, data.blockId);
});

socket.on("typing-start", (data) => {
  // Show user is actively editing a specific block
  showUserTypingInBlock(data.userId, data.notebookId, data.blockId);
});
```

## 🔧 Document State Management

### Get YJS Document State

```http
GET http://localhost:4000/api/collaboration/notebooks/{notebookId}/state
```

**Response:**

```json
{
  "success": true,
  "data": {
    "state": "base64-encoded-yjs-state"
  }
}
```

### Load Document

```http
POST http://localhost:4000/api/collaboration/notebooks/{notebookId}/load
```

**Response:**

```json
{
  "success": true,
  "message": "Document ready (in-memory mode)",
  "data": {
    "notebookId": "notebook_123_abc"
  }
}
```

## 🚨 Error Handling

### Code Collaboration Errors

```javascript
socket.on("error", (error) => {
  console.error("Collaboration error:", error.message);
  // Handle YJS sync errors, document access, etc.
});
```

### REST API Errors

All REST endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error message"
}
```

## 🎯 Complete Code Collaboration Implementation

```javascript
class NotebookCollaboration {
  constructor(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;
    this.notebooks = new Map(); // notebookId -> YJS Doc
    this.activeUsers = new Map(); // userId -> { notebookId, blockId, cursor }

    this.setupCodeCollaborationEvents();
  }

  setupCodeCollaborationEvents() {
    // Real-time code collaboration
    this.socket.on("code-changed", (data) => {
      this.updateEditorContent(data);
    });

    this.socket.on("cursor-moved", (data) => {
      this.updateUserCursor(data);
    });

    this.socket.on("selection-changed", (data) => {
      this.updateUserSelection(data);
    });

    this.socket.on("typing-start", (data) => {
      this.showTypingIndicator(data);
    });

    this.socket.on("typing-stop", (data) => {
      this.hideTypingIndicator(data);
    });

    this.socket.on("language-change", (data) => {
      this.updateLanguage(data);
    });

    // Notebook management
    this.socket.on("notebook:created", (data) => {
      this.addNotebookToList(data.notebook);
    });

    this.socket.on("notebook:updated", (data) => {
      this.updateNotebookInList(data.notebook);
    });

    this.socket.on("notebook:deleted", (data) => {
      this.removeNotebookFromList(data.notebookId);
    });

    // YJS document synchronization
    this.socket.on("yjs-update", (data) => {
      this.applyYjsUpdate(data);
    });

    this.socket.on("yjs-state", (data) => {
      this.syncYjsState(data);
    });
  }

  // Notebook management
  async createNotebook(title) {
    const response = await fetch(
      `http://localhost:4000/api/collaboration/rooms/${this.roomId}/notebooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );
    return response.json();
  }

  async getNotebooks() {
    const response = await fetch(
      `http://localhost:4000/api/collaboration/rooms/${this.roomId}/notebooks`
    );
    return response.json();
  }

  async updateNotebook(notebookId, title) {
    const response = await fetch(
      `http://localhost:4000/api/collaboration/notebooks/${notebookId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );
    return response.json();
  }

  async deleteNotebook(notebookId) {
    const response = await fetch(
      `http://localhost:4000/api/collaboration/notebooks/${notebookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );
    return response.json();
  }

  // Block management
  async createBlock(notebookId, type, position, language) {
    const response = await fetch(
      `http://localhost:4000/api/collaboration/notebooks/${notebookId}/blocks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, position, language }),
      }
    );
    return response.json();
  }

  // Code collaboration methods
  sendCodeChange(content, cursorPosition, notebookId, blockId) {
    this.socket.emit("code-change", {
      content,
      cursorPosition,
      notebookId,
      blockId,
      changeId: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  sendCursorMove(position, notebookId, blockId) {
    this.socket.emit("cursor-move", {
      position,
      notebookId,
      blockId,
    });
  }

  sendTextSelection(startPos, endPos, notebookId, blockId) {
    this.socket.emit("selection-change", {
      startPos,
      endPos,
      notebookId,
      blockId,
    });
  }

  startTyping(position, notebookId, blockId) {
    this.socket.emit("typing-start", {
      position,
      notebookId,
      blockId,
    });
  }

  stopTyping() {
    this.socket.emit("typing-stop");
  }

  changeLanguage(language) {
    this.socket.emit("language-change", { language });
  }

  // YJS integration methods
  setupYjsDocument(notebookId) {
    // Request initial document state
    this.socket.emit("request-yjs-state", { notebookId });

    // Setup YJS document change listener
    const ydoc = new Y.Doc();
    ydoc.on("update", (update) => {
      const updateBase64 = btoa(String.fromCharCode(...update));
      this.socket.emit("yjs-update", {
        notebookId,
        update: updateBase64,
      });
    });

    this.notebooks.set(notebookId, ydoc);
    return ydoc;
  }

  applyYjsUpdate(data) {
    const ydoc = this.notebooks.get(data.notebookId);
    if (ydoc && data.userId !== this.userId) {
      const update = Uint8Array.from(atob(data.update), (c) => c.charCodeAt(0));
      Y.applyUpdate(ydoc, update);
    }
  }

  syncYjsState(data) {
    const ydoc = this.notebooks.get(data.notebookId);
    if (ydoc) {
      const state = Uint8Array.from(atob(data.state), (c) => c.charCodeAt(0));
      Y.applyUpdate(ydoc, state);
    }
  }

  // UI update methods (implement based on your editor)
  updateEditorContent(data) {
    // Update editor content in specific notebook/block
    console.log(
      `Code changed in ${data.fileId}:${data.blockId} by ${data.userEmail}`
    );
    // this.editor.setValue(data.content);
  }

  updateUserCursor(data) {
    // Show user cursor in specific block
    this.activeUsers.set(data.userId, {
      notebookId: data.notebookId,
      blockId: data.blockId,
      position: data.position,
      userEmail: data.userEmail,
    });
    // this.editor.showCursor(data.userId, data.position);
  }

  updateUserSelection(data) {
    // Show user text selection
    console.log(
      `User ${data.userEmail} selected text in ${data.notebookId}:${data.blockId}`
    );
    // this.editor.showSelection(data.userId, data.startPos, data.endPos);
  }

  showTypingIndicator(data) {
    // Show typing indicator for user in specific block
    console.log(
      `${data.userEmail} is typing in ${data.notebookId}:${data.blockId}`
    );
    // this.ui.showTypingIndicator(data.userId, data.blockId);
  }

  hideTypingIndicator(data) {
    // Hide typing indicator
    console.log(`${data.userEmail} stopped typing`);
    // this.ui.hideTypingIndicator(data.userId);
  }

  // Notebook UI update methods
  addNotebookToList(notebook) {
    // Add notebook to UI list
    console.log("Adding notebook to list:", notebook.title);
    // this.ui.addNotebook(notebook);
  }

  updateNotebookInList(notebook) {
    // Update notebook in UI list
    console.log("Updating notebook in list:", notebook.title);
    // this.ui.updateNotebook(notebook);
  }

  removeNotebookFromList(notebookId) {
    // Remove notebook from UI list
    console.log("Removing notebook from list:", notebookId);
    // this.ui.removeNotebook(notebookId);
  }
}

// Usage Example
const collaboration = new NotebookCollaboration(socket, "room123");

// Create a new notebook
const notebook = await collaboration.createNotebook("My ML Experiment");

// Create a code block
const block = await collaboration.createBlock(
  notebook.data.id,
  "code",
  0,
  "python"
);

// Start collaborating on the block
collaboration.sendCodeChange(
  "import pandas as pd\ndf = pd.read_csv('data.csv')",
  { line: 1, column: 25 },
  notebook.data.id,
  block.data.id
);
```

## Key Integration Points

### 1. **Multiple Notebooks per Room**

- Each room can have unlimited notebooks
- Each notebook gets its own Y.Doc for independent collaboration
- Use REST API to create/manage notebooks, Socket.IO for real-time sync

### 2. **Block-Level Collaboration**

- Create different block types: `code`, `markdown`, `output`
- Each block has independent Y.Text for content
- Track cursors and selections per block

### 3. **Real-time Synchronization**

- Send `code-change` events with `notebookId` and `blockId` for precise targeting
- Use YJS for conflict-free collaborative editing
- Track user presence down to specific blocks

### 4. **Conflict-Free Editing**

- YJS CRDT ensures no merge conflicts
- Automatic operational transformation
- Real-time synchronization across all users

This focused guide covers everything needed to implement advanced collaborative notebook editing with real-time code synchronization! 🚀
