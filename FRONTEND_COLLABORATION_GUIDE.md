# Real-time Collaboration API Reference

Quick API reference for implementing real-time collaborative features.

## 🌐 Configuration

```javascript
// Base URLs
const API_BASE_URL = "http://localhost:4000";
const SOCKET_IO_URL = "http://localhost:5002";

// Socket.IO Connection
const socket = io("http://localhost:5002", {
  auth: { token: "your-jwt-token" },
  transports: ["websocket", "polling"],
});

// Authentication Headers
const headers = {
  Authorization: `Bearer ${yourJwtToken}`,
  "Content-Type": "application/json",
};
```

## 📓 REST API Endpoints

### Notebook Management

#### List Notebooks

**Purpose:** Retrieves all notebooks within a specific collaboration room. Used to populate the notebook sidebar and show available notebooks to users.

**Expected Input:**

- `roomId` (path parameter) - The room ID where notebooks are stored
- JWT token in Authorization header

**Returns:** Array of notebook objects with metadata including creation time, last update, and ownership information.

```http
GET /api/collaboration/rooms/{roomId}/notebooks
Authorization: Bearer {token}
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

#### Create Notebook

**Purpose:** Creates a new notebook within a room. Automatically sets the current user as the creator and initializes an empty YJS document for real-time collaboration.

**Expected Input:**

- `roomId` (path parameter) - The room where the notebook will be created
- `title` (body) - The display name for the notebook
- JWT token for user identification and authorization

**Returns:** Complete notebook object with generated ID and metadata. Also broadcasts `notebook:created` event to all room participants.

```http
POST /api/collaboration/rooms/{roomId}/notebooks
Authorization: Bearer {token}
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

#### Update Notebook

**Purpose:** Renames an existing notebook. Only the creator or users with edit permissions can update notebooks.

**Expected Input:**

- `notebookId` (path parameter) - The notebook to update
- `title` (body) - New display name for the notebook
- JWT token for authorization

**Returns:** Updated notebook object with new title and updated timestamp. Also broadcasts `notebook:updated` event to all room participants.

```http
PUT /api/collaboration/notebooks/{notebookId}
Authorization: Bearer {token}
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

#### Delete Notebook

**Purpose:** Permanently removes a notebook and all its blocks. Only the creator or room admin can delete notebooks. This action cannot be undone.

**Expected Input:**

- `notebookId` (path parameter) - The notebook to delete
- JWT token for authorization

**Returns:** Confirmation message with the deleted notebook ID. Also broadcasts `notebook:deleted` event to all room participants and cleans up YJS documents.

```http
DELETE /api/collaboration/notebooks/{notebookId}
Authorization: Bearer {token}
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

### Block Management

#### Get Blocks

**Purpose:** Retrieves all blocks within a notebook in sequential order. Used to render the notebook interface and establish the current block structure for collaboration.

**Expected Input:**

- `notebookId` (path parameter) - The notebook containing the blocks
- No authentication required for reading

**Returns:** Array of block objects ordered by position, including type, language, and metadata.

```http
GET /api/collaboration/notebooks/{notebookId}/blocks
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

#### Create Block

**Purpose:** Adds a new block to a notebook at the specified position. Creates YJS text binding for real-time collaborative editing of the block content.

**Expected Input:**

- `notebookId` (path parameter) - The notebook to add the block to
- `type` (body) - Block type: "code", "markdown", or "output"
- `position` (body) - Position index within the notebook
- `language` (body, optional) - Programming language for code blocks
- JWT token for authorization

**Returns:** Complete block object with generated ID. Also broadcasts `block:created` event to all room participants.

```http
POST /api/collaboration/notebooks/{notebookId}/blocks
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "code",
  "position": 0,
  "language": "python"
}
```

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

#### Delete Block

**Purpose:** Permanently removes a block from the notebook. Cleans up YJS bindings and adjusts positions of subsequent blocks automatically.

**Expected Input:**

- `notebookId` (path parameter) - The notebook containing the block
- `blockId` (path parameter) - The block to delete
- JWT token for authorization

**Returns:** Success confirmation. Also broadcasts `block:deleted` event to all room participants.

```http
DELETE /api/collaboration/notebooks/{notebookId}/blocks/{blockId}
Authorization: Bearer {token}
```

**Response:**

```json
{
  "success": true,
  "message": "Block deleted successfully"
}
```

#### Move Block

**Purpose:** Changes the position of a block within the notebook. Automatically adjusts positions of other blocks to maintain sequential order. Used for drag-and-drop reordering.

**Expected Input:**

- `notebookId` (path parameter) - The notebook containing the block
- `blockId` (path parameter) - The block to move
- `position` (body) - New position index
- JWT token for authorization

**Returns:** Updated block information. Also broadcasts `block:moved` event to all room participants.

```http
PUT /api/collaboration/notebooks/{notebookId}/blocks/{blockId}/position
Authorization: Bearer {token}
Content-Type: application/json

{
  "position": 2
}
```

**Response:**

```json
{
  "success": true,
  "message": "Block moved successfully"
}
```

#### Get Block Content

**Purpose:** Retrieves the current text content of a block. Used for initial loading and non-real-time access to block content.

**Expected Input:**

- `notebookId` (path parameter) - The notebook containing the block
- `blockId` (path parameter) - The block to get content from
- No authentication required for reading

**Returns:** Current text content of the block.

```http
GET /api/collaboration/notebooks/{notebookId}/blocks/{blockId}/content
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

### YJS Document State

#### Get Document State

**Purpose:** Retrieves the complete YJS document state for a notebook. Used when a client needs to synchronize with the current state of all blocks in the notebook.

**Expected Input:**

- `notebookId` (path parameter) - The notebook to get state for
- No authentication required for reading

**Returns:** Base64-encoded YJS document state containing all block content and metadata.

```http
GET /api/collaboration/notebooks/{notebookId}/state
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

#### Load Document

**Purpose:** Initializes or loads a YJS document for a notebook in the server's memory. Must be called before starting real-time collaboration on a notebook.

**Expected Input:**

- `notebookId` (path parameter) - The notebook to load
- No authentication required

**Returns:** Confirmation that the document is ready for real-time collaboration.

```http
POST /api/collaboration/notebooks/{notebookId}/load
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

## 📡 Socket.IO Events

### Outgoing Events (Client → Server)

#### Join Room

**Purpose:** Connects the client to a specific collaboration room. Must be called after socket connection to start receiving room events.

**Expected Data:**

- `roomId` - The room to join

```javascript
socket.emit("join-room", {
  roomId: "room123",
});
```

#### Code Changes

**Purpose:** Broadcasts code content changes to all participants. Used for non-YJS collaborative editing and visual feedback.

**Expected Data:**

- `content` - The updated code content
- `cursorPosition` - Current cursor position
- `notebookId` - Target notebook ID
- `blockId` - Target block ID
- `changeId` - Unique change identifier

```javascript
socket.emit("code-change", {
  content: 'print("Hello World")',
  cursorPosition: { line: 0, column: 20 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
  changeId: "change_123",
});
```

#### Cursor Movement

**Purpose:** Shares cursor position with other users for real-time collaboration awareness. Shows where each user is currently editing.

**Expected Data:**

- `position` - Cursor line and column
- `notebookId` - Current notebook
- `blockId` - Current block

```javascript
socket.emit("cursor-move", {
  position: { line: 5, column: 12 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});
```

#### Text Selection

**Purpose:** Shares text selection ranges with other users. Displays what text other users have highlighted.

**Expected Data:**

- `startPos` - Selection start position
- `endPos` - Selection end position
- `notebookId` - Current notebook
- `blockId` - Current block

```javascript
socket.emit("selection-change", {
  startPos: { line: 2, column: 0 },
  endPos: { line: 4, column: 15 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});
```

#### Typing Status

**Purpose:** Shows typing indicators to other users. Automatically times out to avoid stuck indicators.

**Expected Data for Start:**

- `position` - Where the user is typing
- `notebookId` - Current notebook
- `blockId` - Current block

**Expected Data for Stop:**

- No data required

```javascript
// Start typing
socket.emit("typing-start", {
  position: { line: 3, column: 8 },
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});

// Stop typing
socket.emit("typing-stop");
```

#### Language Change

**Purpose:** Notifies other users when a block's programming language is changed. Updates syntax highlighting across all clients.

**Expected Data:**

- `language` - The new programming language

```javascript
socket.emit("language-change", {
  language: "python",
});
```

#### Block Focus/Blur

**Purpose:** Tracks when users start or stop editing specific blocks. Used for showing which blocks are currently being edited.

**Expected Data:**

- `notebookId` - The notebook containing the block
- `blockId` - The block being focused/blurred

```javascript
// Focus on block
socket.emit("user-focus-block", {
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});

// Blur from block
socket.emit("user-blur-block", {
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});
```

#### Block Content Changes

**Purpose:** Provides visual feedback about block content changes separate from YJS updates. Used for UI state management.

**Expected Data:**

- `notebookId` - The notebook containing the block
- `blockId` - The block being changed
- `content` - The new content
- `isExecuting` - Whether the block is currently executing

```javascript
socket.emit("block-content-changed", {
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
  content: "print('Hello World')",
  isExecuting: false,
});
```

#### YJS Updates

**Purpose:** Sends YJS document updates for conflict-free collaborative editing. Core mechanism for real-time synchronization.

**Expected Data:**

- `notebookId` - The notebook being updated
- `update` - Base64-encoded YJS update

```javascript
// Send YJS update
socket.emit("yjs-update", {
  notebookId: "notebook_123_abc",
  update: "base64-encoded-update",
});

// Request document state
socket.emit("request-yjs-state", {
  notebookId: "notebook_123_abc",
});
```

#### Notebook Management via Socket.IO

**Purpose:** Alternative to REST API for notebook CRUD operations. Provides real-time feedback for management actions.

**Expected Data:**

- For create: `roomId`, `title`
- For update: `notebookId`, `title`
- For delete: `roomId`, `notebookId`

```javascript
// Create notebook
socket.emit("notebook:create", {
  roomId: "room123",
  title: "My Socket Notebook",
});

// Update notebook
socket.emit("notebook:update", {
  notebookId: "notebook_123_abc",
  title: "Renamed via Socket",
});

// Delete notebook
socket.emit("notebook:delete", {
  roomId: "room123",
  notebookId: "notebook_123_abc",
});
```

#### Block Management via Socket.IO

**Purpose:** Alternative to REST API for block CRUD operations. Provides real-time feedback for block management actions.

**Expected Data:**

- For create: `notebookId`, `type`, `position`, `language?`
- For delete: `notebookId`, `blockId`
- For move: `notebookId`, `blockId`, `newPosition`

```javascript
// Create block
socket.emit("block:create", {
  notebookId: "notebook_123_abc",
  type: "code",
  position: 0,
  language: "python",
});

// Delete block
socket.emit("block:delete", {
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
});

// Move block
socket.emit("block:move", {
  notebookId: "notebook_123_abc",
  blockId: "block_789_xyz",
  newPosition: 2,
});
```

### Incoming Events (Server → Client)

#### Connection Events

**Purpose:** Handle Socket.IO connection lifecycle. Essential for managing connection state and reconnection logic.

**Received Data:**

- `connect`: No data, socket.id available
- `disconnect`: No data

**Usage:** Update UI connection status, reinitialize collaboration state on reconnection.

```javascript
socket.on("connect", () => {
  console.log("Connected:", socket.id);
  // Reinitialize: join room, request document states
});

socket.on("disconnect", () => {
  console.log("Disconnected");
  // Update UI: show offline status, queue operations
});
```

#### Notebook Events

**Purpose:** Receive real-time notifications about notebook lifecycle changes from any participant in the room.

**Received Data Structure:**

- `notebook:created`: `{ notebook: NotebookObject, createdBy: userId }`
- `notebook:updated`: `{ notebook: NotebookObject, updatedBy: userId }`
- `notebook:deleted`: `{ notebookId: string, deletedBy: userId }`

**Usage:** Update notebook lists, refresh UI, handle active notebook deletion.

```javascript
socket.on("notebook:created", (data) => {
  // data: { notebook: { id, title, roomId, createdBy, createdAt, updatedAt }, createdBy: "user456" }
  console.log(
    `New notebook "${data.notebook.title}" created by ${data.createdBy}`
  );
  // Add to notebook list, update UI
});

socket.on("notebook:updated", (data) => {
  // data: { notebook: { id, title, roomId, createdBy, createdAt, updatedAt }, updatedBy: "user789" }
  console.log(`Notebook "${data.notebook.title}" updated by ${data.updatedBy}`);
  // Update notebook in list, refresh if currently active
});

socket.on("notebook:deleted", (data) => {
  // data: { notebookId: "notebook_123_abc", deletedBy: "user456" }
  console.log(`Notebook deleted by ${data.deletedBy}`);
  // Remove from list, close if currently active, clear editor
});
```

#### Block Events

**Purpose:** Receive real-time notifications about block lifecycle changes within notebooks. Essential for maintaining synchronized block structure.

**Received Data Structure:**

- `block:created`: `{ notebookId, block: BlockObject, createdBy: userId }`
- `block:deleted`: `{ notebookId, blockId, deletedBy: userId }`
- `block:moved`: `{ notebookId, blockId, newPosition, movedBy: userId }`

**Usage:** Update block lists, maintain proper order, refresh notebook view when blocks change.

```javascript
socket.on("block:created", (data) => {
  // data: { notebookId: "notebook_123_abc", block: { id, type, language, position, createdAt, updatedAt }, createdBy: "user456" }
  console.log(
    `New ${data.block.type} block created in notebook by ${data.createdBy}`
  );
  // Add block to notebook, resort by position, update UI
});

socket.on("block:deleted", (data) => {
  // data: { notebookId: "notebook_123_abc", blockId: "block_789_xyz", deletedBy: "user456" }
  console.log(`Block deleted from notebook by ${data.deletedBy}`);
  // Remove block from UI, close if currently editing, cleanup YJS bindings
});

socket.on("block:moved", (data) => {
  // data: { notebookId: "notebook_123_abc", blockId: "block_789_xyz", newPosition: 2, movedBy: "user456" }
  console.log(`Block moved to position ${data.newPosition} by ${data.movedBy}`);
  // Reorder blocks in UI, update positions, maintain editor focus
});
```

#### Real-time Collaboration Events

**Purpose:** Receive live updates about other users' editing activities. Core functionality for collaborative awareness and synchronization.

**Received Data Structure:**

- `code-changed`: `{ userEmail, content, cursorPosition, fileId, changeId, timestamp }`
- `cursor-moved`: `{ userId, userEmail, position, notebookId, blockId }`
- `selection-changed`: `{ userId, userEmail, startPos, endPos, notebookId, blockId }`
- `typing-start`: `{ userId, userEmail, position, notebookId, blockId }`
- `typing-stop`: `{ userId, userEmail }`
- `language-change`: `{ language, userEmail }`

**Usage:** Update editor content, show user cursors, display text selections, maintain collaboration awareness.

```javascript
socket.on("code-changed", (data) => {
  // data: { userEmail: "user@example.com", content: "print('Hello World')", cursorPosition: { line: 0, column: 20 }, fileId: "notebook_123_abc", changeId: "change_456", timestamp: "2025-09-13T10:30:00Z" }
  console.log(`Code changed by ${data.userEmail}`);
  // Update editor content (if not using YJS), show change indicator
});

socket.on("cursor-moved", (data) => {
  // data: { userId: "user456", userEmail: "user@example.com", position: { line: 5, column: 12 }, notebookId: "notebook_123_abc", blockId: "block_789_xyz" }
  console.log(`${data.userEmail} moved cursor in block ${data.blockId}`);
  // Display user cursor, update presence indicators
});

socket.on("typing-start", (data) => {
  // data: { userId: "user456", userEmail: "user@example.com", position: { line: 3, column: 8 }, notebookId: "notebook_123_abc", blockId: "block_789_xyz" }
  console.log(`${data.userEmail} started typing in block ${data.blockId}`);
  // Show typing indicator, update user presence
});

socket.on("language-change", (data) => {
  // data: { language: "python", userEmail: "user@example.com" }
  console.log(`Language changed to ${data.language} by ${data.userEmail}`);
  // Update syntax highlighting, refresh editor language
});
```

#### User Presence Events

**Purpose:** Track user activity and presence within the collaboration room. Essential for showing who's online and what they're working on.

**Received Data Structure:**

- `user-joined`: `{ userId, userEmail }` - Someone joined the room
- `user-left`: `{ userId, userEmail }` - Someone left the room
- `user-focus-block`: `{ userId, userEmail, notebookId, blockId }` - User started editing a block
- `user-blur-block`: `{ userId, userEmail, notebookId, blockId }` - User stopped editing a block

**Usage:** Update participant lists, show active users, highlight blocks being edited.

```javascript
socket.on("user-joined", (data) => {
  // data: { userId: "user789", userEmail: "newuser@example.com" }
  console.log(`${data.userEmail} joined the room`);
  // Add to participant list, show join notification
});

socket.on("user-focus-block", (data) => {
  // data: { userId: "user456", userEmail: "user@example.com", notebookId: "notebook_123_abc", blockId: "block_789_xyz" }
  console.log(`${data.userEmail} started editing block ${data.blockId}`);
  // Highlight block as active, show user avatar
});
```

#### YJS Events

**Purpose:** Handle YJS CRDT synchronization for conflict-free collaborative editing. Core mechanism for real-time document updates.

**Received Data Structure:**

- `yjs-update`: `{ notebookId, update, userId }` - Incremental document update
- `yjs-state`: `{ notebookId, state }` - Complete document state

**Usage:** Apply YJS updates to local document, synchronize collaborative editing state.

```javascript
socket.on("yjs-update", (data) => {
  // data: { notebookId: "notebook_123_abc", update: "base64-encoded-update", userId: "user456" }
  console.log(`YJS update received for notebook ${data.notebookId}`);
  // Apply update to YJS document, trigger collaborative editor sync
});

socket.on("yjs-state", (data) => {
  // data: { notebookId: "notebook_123_abc", state: "base64-encoded-state" }
  console.log(`YJS state received for notebook ${data.notebookId}`);
  // Initialize YJS document with complete state, sync collaborative editor
});
```

#### Chat Events

**Purpose:** Handle chat messages within the collaboration room. Provides communication alongside code collaboration.

**Received Data Structure:**

- `message`: `{ userId, email, content, timestamp }` - New chat message
- `chat-history`: `Array<{ userId, email, content, timestamp }>` - Chat history on join

**Usage:** Display chat messages, maintain chat history, show notifications.

```javascript
socket.on("message", (data) => {
  // data: { userId: "user456", email: "user@example.com", content: "Hey everyone!", timestamp: "2025-09-13T10:30:00Z" }
  console.log(`${data.email}: ${data.content}`);
  // Add to chat UI, show notification if not focused
});

socket.on("chat-history", (data) => {
  // data: { roomId: "room123", messages: [{ userId, email, content, timestamp }] }
  console.log(
    `Received ${data.messages.length} chat messages for room ${data.roomId}`
  );
  // Load chat history into UI
});
```

#### Chat Outgoing Events

**Purpose:** Send chat messages and request chat history.

**Expected Data:**

- `chat:send`: `{ roomId, content }` - Send a message
- `request-chat-history`: `{ roomId }` - Request chat history

```javascript
// Send a chat message
socket.emit("chat:send", {
  roomId: "room123",
  content: "Hello everyone!",
});

// Request chat history
socket.emit("request-chat-history", {
  roomId: "room123",
});
```

#### Room Events

**Purpose:** Receive current room participant information when joining or when the participant list changes.

**Received Data Structure:**

- `room-participants`: `Array<{ userId, email }>` - Current room participants

**Usage:** Initialize participant list, update room member display.

```javascript
socket.on("room-participants", (data) => {
  // data: [{ userId: "user123", email: "first@example.com" }, { userId: "user456", email: "second@example.com" }]
  console.log(`Room has ${data.length} participants`);
  // Initialize participant list, show online users
});
```

#### Error Events

**Purpose:** Handle collaboration-specific errors and failed operations. Essential for debugging and user feedback.

**Received Data Structure:**

- `error`: `{ message }` - Error description

**Usage:** Show error messages, handle failed operations, debug issues.

```javascript
socket.on("error", (data) => {
  // data: { message: "Failed to join room: insufficient permissions" }
  console.error(`Collaboration error: ${data.message}`);
  // Show error notification, handle failed operations
});
```

#### Additional Events

**Purpose:** Handle miscellaneous room and connection events.

**Outgoing Events:**

- `get-room-participants` - Request current room participants
- `leave-room` - Leave the current room

**Incoming Events:**

- `chat:error` - Chat-related errors

```javascript
// Request room participants
socket.emit("get-room-participants");

// Leave room
socket.emit("leave-room");

// Handle chat errors
socket.on("chat:error", (data) => {
  // data: { message: "Error description" }
  console.error("Chat error:", data.message);
});
```

## 🚨 Error Responses

**REST API Error Format:**

```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error message"
}
```

**Common HTTP Status Codes:**

- `401` - Unauthorized (invalid/missing JWT token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found (notebook/block doesn't exist)
- `400` - Bad request (invalid data)
- `500` - Internal server error

**Socket.IO Error Handling:**

```javascript
socket.on("error", (error) => {
  // Handle real-time collaboration errors
  console.error("Socket error:", error.message);
});

socket.on("connect_error", (error) => {
  // Handle connection errors (auth, network)
  console.error("Connection error:", error.message);
});
```

**All events include:**

- `userId` - User who triggered the event
- `userEmail` - Email of the user
- `timestamp` - When the event occurred
- Relevant data for the specific event type

This ensures complete real-time synchronization across all users in collaborative notebook editing sessions! 🚀
