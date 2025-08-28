# Realtime Collaboration API Documentation

This document describes the WebSocket-based realtime collaboration system and HTTP endpoints for managing realtime features.

## 🔌 WebSocket Connection (Socket.IO)

### Connection Setup

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token-here' // JWT token from Supabase auth
  }
});
```

### Authentication
- JWT token is required for WebSocket connection
- Token should be passed in the `auth.token` field during connection
- Uses the same JWT token from Supabase authentication

### Server URL
- Development: `http://localhost:3001` (Core service)
- Production: Use your Core service URL

---

## 📨 Socket.IO Events

### Client → Server Events

#### 1. Join Room
```javascript
socket.emit('join-room', {
  roomId: 'room-uuid-here'
});
```

#### 2. Leave Room
```javascript
socket.emit('leave-room');
```

#### 3. Code Change
```javascript
socket.emit('code-change', {
  content: 'console.log("Hello World!");',
  cursorPosition: { line: 1, column: 10 } // optional
});
```

#### 4. Cursor Movement
```javascript
socket.emit('cursor-move', {
  position: { line: 5, column: 15 }
});
```

#### 5. Selection Change
```javascript
socket.emit('selection-change', {
  startPos: { line: 1, column: 0 },
  endPos: { line: 3, column: 25 }
});
```

### Server → Client Events

#### 1. User Joined
```javascript
socket.on('user-joined', (data) => {
  console.log('User joined:', data);
  // data: { roomId, userId, userEmail, timestamp }
});
```

#### 2. User Left
```javascript
socket.on('user-left', (data) => {
  console.log('User left:', data);
  // data: { roomId, userId, userEmail, timestamp }
});
```

#### 3. Room Participants (on join)
```javascript
socket.on('room-participants', (data) => {
  console.log('Current participants:', data.participants);
  // data: { roomId, participants: [{ userId, userEmail, socketId }] }
});
```

#### 4. Code Changed
```javascript
socket.on('code-changed', (data) => {
  console.log('Code changed by:', data.userEmail);
  // data: { roomId, userId, userEmail, content, cursorPosition?, timestamp }
});
```

#### 5. Cursor Moved
```javascript
socket.on('cursor-moved', (data) => {
  console.log('Cursor moved:', data);
  // data: { roomId, userId, userEmail, position: { line, column }, timestamp }
});
```

#### 6. Selection Changed
```javascript
socket.on('selection-changed', (data) => {
  console.log('Selection changed:', data);
  // data: { roomId, userId, userEmail, startPos, endPos, timestamp }
});
```

#### 7. User Kicked
```javascript
socket.on('user-kicked', (data) => {
  console.log('User was kicked:', data);
  // data: { roomId, kickedUserId, kickedUserEmail, timestamp }
});
```

#### 8. Kicked from Room (you were kicked)
```javascript
socket.on('kicked-from-room', (data) => {
  console.log('You were kicked from room:', data);
  // data: { roomId, reason, timestamp }
  // Handle redirect/cleanup here
});
```

#### 9. Content Saved
```javascript
socket.on('content-saved', (data) => {
  console.log('Content saved:', data);
  // data: { roomId, content, language, savedBy, savedByEmail, timestamp }
});
```

#### 10. Custom Broadcast Events
```javascript
socket.on('custom-notification', (data) => {
  console.log('Custom event received:', data);
  // Handle custom events sent via /api/rooms/:id/broadcast
});
```

---

## 🌐 HTTP REST Endpoints

### Base URL
- API Gateway: `http://localhost:3000/api`
- All endpoints require JWT authentication via `Authorization: Bearer <token>` header

### 1. Get Room Participants
```http
GET /api/rooms/{roomId}/participants
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "message": "Room participants retrieved successfully",
  "roomId": "room-uuid",
  "participants": [
    {
      "userId": "user-123",
      "userEmail": "user@example.com",
      "socketId": "socket-abc123",
      "joinedAt": 1703123456789
    }
  ],
  "totalCount": 1
}
```

### 2. Kick User from Room
```http
POST /api/rooms/{roomId}/kick
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "userId": "user-to-kick-123"
}
```

**Response:**
```json
{
  "message": "User kicked from room successfully",
  "roomId": "room-uuid",
  "kickedUserId": "user-to-kick-123",
  "kickedBy": {
    "id": "admin-user-123",
    "email": "admin@example.com"
  }
}
```

### 3. Broadcast Custom Event
```http
POST /api/rooms/{roomId}/broadcast
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "event": "custom-notification",
  "data": {
    "message": "Meeting starts in 5 minutes!",
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "message": "Event broadcast successfully",
  "roomId": "room-uuid",
  "event": "custom-notification",
  "broadcastBy": {
    "id": "user-123",
    "email": "user@example.com"
  }
}
```

### 4. Save Room Content
```http
POST /api/rooms/{roomId}/save
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "content": "console.log('Hello World!');",
  "language": "javascript"
}
```

**Response:**
```json
{
  "message": "Room content saved successfully",
  "roomId": "room-uuid",
  "savedBy": {
    "id": "user-123",
    "email": "user@example.com"
  },
  "timestamp": 1703123456789
}
```

---

## 🔧 Frontend Integration Example

```javascript
import io from 'socket.io-client';

class RealtimeEditor {
  constructor(roomId, jwtToken) {
    this.roomId = roomId;
    this.socket = io('http://localhost:3001', {
      auth: { token: jwtToken }
    });
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Connection established
    this.socket.on('connect', () => {
      console.log('Connected to realtime server');
      this.joinRoom();
    });

    // Join room automatically on connect
    this.socket.on('connect', () => {
      this.joinRoom();
    });

    // Handle incoming code changes
    this.socket.on('code-changed', (data) => {
      if (data.userId !== this.getCurrentUserId()) {
        this.updateEditorContent(data.content);
        this.showUserCursor(data.userId, data.cursorPosition);
      }
    });

    // Handle cursor movements
    this.socket.on('cursor-moved', (data) => {
      if (data.userId !== this.getCurrentUserId()) {
        this.showUserCursor(data.userId, data.position);
      }
    });

    // Handle user presence
    this.socket.on('user-joined', (data) => {
      this.showUserJoinedNotification(data.userEmail);
    });

    this.socket.on('user-left', (data) => {
      this.hideUserCursor(data.userId);
      this.showUserLeftNotification(data.userEmail);
    });

    // Handle being kicked
    this.socket.on('kicked-from-room', (data) => {
      alert('You were removed from the room');
      window.location.href = '/dashboard';
    });
  }

  joinRoom() {
    this.socket.emit('join-room', { roomId: this.roomId });
  }

  onCodeChange(content, cursorPosition) {
    this.socket.emit('code-change', {
      content,
      cursorPosition
    });
  }

  onCursorMove(position) {
    this.socket.emit('cursor-move', { position });
  }

  async saveContent(content, language) {
    try {
      const response = await fetch(`/api/rooms/${this.roomId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({ content, language })
      });
      
      if (response.ok) {
        console.log('Content saved successfully');
      }
    } catch (error) {
      console.error('Failed to save content:', error);
    }
  }

  // Implement these methods based on your editor
  updateEditorContent(content) { /* Update your editor */ }
  showUserCursor(userId, position) { /* Show cursor indicator */ }
  hideUserCursor(userId) { /* Hide cursor indicator */ }
  getCurrentUserId() { /* Return current user ID */ }
  showUserJoinedNotification(email) { /* Show notification */ }
  showUserLeftNotification(email) { /* Show notification */ }
}

// Usage
const editor = new RealtimeEditor('room-uuid-123', 'jwt-token-here');
```

---

## 🚨 Error Handling

### Socket.IO Connection Errors
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Handle authentication failure or network issues
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Handle reconnection logic
});
```

### HTTP API Errors
- **400**: Bad request (missing parameters)
- **401**: Unauthorized (invalid/missing JWT token)
- **404**: Room not found
- **500**: Internal server error

---

## 📝 Notes for Testing

1. **Start the services:**
   ```bash
   pnpm run dev
   ```

2. **Test WebSocket connection:**
   - Use browser dev tools or Socket.IO client
   - Connect to `http://localhost:3001`
   - Pass JWT token in auth

3. **Test HTTP endpoints:**
   - Use Swagger UI at `http://localhost:3000/api-docs`
   - Or use Postman/curl with proper headers

4. **Multiple users:**
   - Open multiple browser tabs/windows
   - Each with different JWT tokens
   - Join the same room to test collaboration

---

## 🔐 Security Notes

- JWT tokens are validated on both HTTP and WebSocket connections
- Room access control is currently disabled for testing
- Users can only see data from rooms they're connected to
- All events include sender information (userId, userEmail)
