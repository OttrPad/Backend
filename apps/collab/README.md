# Collaboration Service

The **Collaboration Service** handles real-time features for the Realtime Code Editor, including WebSocket connections, chat messaging, code synchronization, and collaborative editing using Socket.IO and Yjs.

## 🚀 Overview

- **Port**: `5002` (configurable via `COLLABORATION_HTTP_PORT`)
- **Purpose**: Real-time collaboration, chat, code synchronization
- **Dependencies**: Socket.IO, Yjs, Express.js, JWT verification
- **WebSocket Endpoint**: `ws://localhost:5002`

## 📡 Features

- **💬 Real-time Chat**: Instant messaging within rooms
- **⚡ Code Synchronization**: Collaborative code editing with Yjs
- **👥 Presence Awareness**: User cursors and active participants
- **🔐 Secure WebSockets**: JWT authentication for all connections
- **📊 Room Statistics**: Live participant counts and activity
- **🎯 Event Broadcasting**: Custom event system for room coordination

## 🏗️ Architecture

```
Frontend WebSocket → Collaboration Service → JWT Validation → Room Events
                                         ↓
                              Broadcast to Room Participants
```

Direct WebSocket connection from frontend to collaboration service, bypassing the API Gateway for real-time performance.

## 🛠️ Development

### Start the Service

```bash
# From project root
cd apps/collab
pnpm dev

# Or from root using turbo
pnpm dev:collab
```

### Environment Variables

```bash
# Service Configuration
COLLABORATION_HTTP_PORT=5002
NODE_ENV=development

# Authentication
SUPABASE_JWT_SECRET=your_supabase_jwt_secret

# CORS Configuration
FRONTEND_URL=http://localhost:3000
```

### Available Scripts

```bash
pnpm dev          # Start in development mode with hot reload
pnpm dev:no-watch # Start without file watching
pnpm build        # Compile TypeScript to JavaScript
pnpm start        # Start production build
```

## 🔌 WebSocket API

### Connection

**Endpoint**: `ws://localhost:5002`

**Authentication**: Required on connection

```javascript
const socket = io("ws://localhost:5002", {
  auth: {
    token: "Bearer YOUR_JWT_TOKEN",
  },
});
```

### Events

#### Client → Server Events

| Event             | Payload                                        | Description                |
| ----------------- | ---------------------------------------------- | -------------------------- |
| `join_room`       | `{ roomId: string }`                           | Join a collaboration room  |
| `leave_room`      | `{ roomId: string }`                           | Leave a collaboration room |
| `send_message`    | `{ roomId: string, message: string }`          | Send chat message to room  |
| `code_change`     | `{ roomId: string, delta: any }`               | Broadcast code changes     |
| `cursor_position` | `{ roomId: string, position: Position }`       | Update cursor position     |
| `custom_event`    | `{ roomId: string, event: string, data: any }` | Send custom room event     |

#### Server → Client Events

| Event          | Payload                                                  | Description               |
| -------------- | -------------------------------------------------------- | ------------------------- |
| `room_joined`  | `{ roomId: string, participants: User[] }`               | Successfully joined room  |
| `room_left`    | `{ roomId: string }`                                     | Successfully left room    |
| `new_message`  | `{ roomId: string, message: Message }`                   | New chat message received |
| `code_updated` | `{ roomId: string, delta: any }`                         | Code changes from others  |
| `cursor_moved` | `{ roomId: string, userId: string, position: Position }` | User cursor update        |
| `user_joined`  | `{ roomId: string, user: User }`                         | User joined the room      |
| `user_left`    | `{ roomId: string, userId: string }`                     | User left the room        |
| `error`        | `{ message: string, code?: string }`                     | Error notification        |

## 📚 HTTP API Endpoints

### Health & Status

| Method | Endpoint                    | Description                   | Auth Required |
| ------ | --------------------------- | ----------------------------- | ------------- |
| `GET`  | `/health`                   | Service health check          | ❌            |
| `GET`  | `/api/collaboration/health` | Detailed collaboration status | ❌            |

### Room Management

| Method | Endpoint                                 | Description                 | Auth Required |
| ------ | ---------------------------------------- | --------------------------- | ------------- |
| `GET`  | `/api/collaboration/rooms/:id/info`      | Get room collaboration info | ✅ (JWT)      |
| `GET`  | `/api/collaboration/rooms/:id/stats`     | Get room statistics         | ✅ (JWT)      |
| `POST` | `/api/collaboration/rooms/:id/broadcast` | Broadcast custom event      | ✅ (JWT)      |

## 🔐 Authentication Flow

### WebSocket Authentication

1. **Client** connects with JWT token in auth payload
2. **Service** validates JWT using Supabase secret
3. **User context** is extracted and stored with socket
4. **Room operations** use authenticated user context
5. **Connection** is rejected if authentication fails

### JWT Middleware

```typescript
io.use(authenticateSocket);

// Middleware validates token and adds user to socket
socket.user = {
  id: payload.sub,
  email: payload.email,
  role: payload.role,
};
```

## 📁 Project Structure

```
apps/collab/
├── src/
│   ├── middleware/
│   │   └── auth.middleware.ts           # JWT authentication
│   ├── routes/
│   │   └── collaboration.routes.ts      # HTTP API routes
│   ├── services/
│   │   └── realtimeCollaborationService.ts # Socket.IO server & events
│   └── app.ts                           # Express + Socket.IO setup
├── .env                                 # Local environment variables
├── package.json                         # Dependencies and scripts
├── tsconfig.json                        # TypeScript configuration
└── README.md                           # This file
```

## 🎯 Real-time Features

### Chat System

**Message Structure:**

```typescript
interface Message {
  id: string;
  roomId: string;
  userId: string;
  userEmail: string;
  content: string;
  timestamp: string;
  type: "text" | "system";
}
```

**Chat Flow:**

1. Client sends `send_message` event
2. Server validates user is in room
3. Message is broadcasted to all room participants
4. Message history is maintained in memory (future: persist to DB)

### Code Synchronization

**Using Yjs for Operational Transform:**

- **Conflict-free**: Multiple users can edit simultaneously
- **Real-time**: Changes are immediately synchronized
- **Persistent**: Document state is maintained
- **Efficient**: Only deltas are transmitted

### Presence Awareness

**Cursor Tracking:**

```typescript
interface CursorPosition {
  line: number;
  column: number;
  selection?: {
    start: Position;
    end: Position;
  };
}
```

**User Presence:**

- Active participants list
- Cursor positions
- User connection status
- Activity timestamps

## 🧪 Testing

### WebSocket Testing

**Using Socket.IO Client:**

```javascript
import { io } from "socket.io-client";

const socket = io("ws://localhost:5002", {
  auth: { token: "Bearer YOUR_JWT_TOKEN" },
});

// Test room joining
socket.emit("join_room", { roomId: "test-room" });

// Listen for events
socket.on("room_joined", (data) => {
  console.log("Joined room:", data);
});
```

**Manual Testing:**

```bash
# Health check
curl http://localhost:5002/health

# Room statistics
curl -H "Authorization: Bearer JWT_TOKEN" \
     http://localhost:5002/api/collaboration/rooms/room-id/stats

# Broadcast custom event
curl -X POST http://localhost:5002/api/collaboration/rooms/room-id/broadcast \
     -H "Authorization: Bearer JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"event": "custom_event", "data": {"message": "test"}}'
```

### Response Examples

**Health Check:**

```json
{
  "status": "ok",
  "service": "collaboration",
  "timestamp": "2025-09-10T10:30:00.000Z"
}
```

**Room Statistics:**

```json
{
  "roomId": "room-123",
  "activeUsers": 3,
  "messagesCount": 45,
  "codeChanges": 12,
  "timestamp": "2025-09-10T10:30:00.000Z"
}
```

## ⚡ Performance Optimization

### Connection Management

- **Room-based namespaces**: Efficient event targeting
- **Connection pooling**: Optimized socket handling
- **Memory management**: Cleanup on disconnect
- **Rate limiting**: Prevent event flooding

### Event Broadcasting

```typescript
// Efficient room broadcasting
socket.to(roomId).emit("event_name", data);

// Exclude sender
socket.to(roomId).emit("event_name", data);

// Include sender
io.to(roomId).emit("event_name", data);
```

### Memory Management

- **Room cleanup**: Remove empty rooms
- **Message pruning**: Limit in-memory message history
- **User cleanup**: Remove disconnected users
- **Document cleanup**: Clean up Yjs documents

## 🔧 Configuration

### Socket.IO Configuration

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});
```

### Yjs Document Management

```typescript
// Document per room
const roomDocuments = new Map<string, Y.Doc>();

// Automatic cleanup
const cleanupInterval = setInterval(
  () => {
    // Remove unused documents
  },
  5 * 60 * 1000
); // 5 minutes
```

## 🚧 Extending the Service

### Adding New Events

1. **Define event handler**:

```typescript
socket.on("new_event", (data) => {
  // Validate data
  // Process event
  // Broadcast to room
});
```

2. **Add to event types**:

```typescript
interface ServerToClientEvents {
  new_event: (data: EventData) => void;
}
```

3. **Update client documentation**

### Custom Room Logic

```typescript
class Room {
  constructor(public id: string) {}

  addParticipant(user: User) {
    /* ... */
  }
  removeParticipant(userId: string) {
    /* ... */
  }
  broadcastMessage(message: Message) {
    /* ... */
  }
}
```

## 📊 Monitoring & Analytics

### Real-time Metrics

- Connected users count
- Active rooms count
- Messages per second
- Connection/disconnection rate
- Error rates

### Room Analytics

- Peak concurrent users
- Message volume by room
- Code change frequency
- Session duration
- User engagement metrics

## 🔗 Integration with Other Services

### API Gateway Integration

- HTTP endpoints proxied through gateway
- Authentication handled independently
- CORS configured for direct connection

### Core Service Integration

- Room validation via HTTP calls
- User permissions verification
- Participant management coordination

## 🐛 Common Issues

### Connection Problems

```bash
# Check service is running
curl http://localhost:5002/health

# Verify WebSocket endpoint
# Should respond to: ws://localhost:5002
```

### Authentication Issues

```bash
# Verify JWT secret matches Supabase
echo $SUPABASE_JWT_SECRET

# Check token format and expiration
# Token should be valid Supabase JWT
```

### CORS Issues

```bash
# Update frontend URL
FRONTEND_URL=http://localhost:3000

# Restart service after changes
```

### Performance Issues

- Monitor memory usage for large rooms
- Implement message history limits
- Use connection pooling
- Optimize event broadcasting

## 🔮 Future Enhancements

### Planned Features

- **Message Persistence**: Store chat history in database
- **File Sharing**: Collaborative file uploads
- **Video/Audio**: WebRTC integration for calls
- **Advanced Permissions**: Granular room permissions
- **Analytics Dashboard**: Real-time collaboration metrics

### Scalability

- **Redis Adapter**: Multi-instance Socket.IO scaling
- **Message Queues**: Event processing optimization
- **Database Clustering**: Handle large-scale deployments
- **CDN Integration**: Global WebSocket endpoints

## 🔗 Related Services

- **[API Gateway](../api/README.md)** - HTTP request routing
- **[Core Service](../core/README.md)** - Room and user management
- **[Frontend Migration Guide](../../FRONTEND_CHAT_GUIDE.md)** - Client integration

---

**🔗 Part of the [Realtime Code Editor Backend](../../README.md) microservices architecture**

**💡 For frontend integration, see the [Frontend Chat Migration Guide](../../FRONTEND_CHAT_GUIDE.md)**
