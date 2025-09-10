# 🚀 Yjs Real-time Collaboration Service

## Overview

This service provides real-time collaborative code editing using Yjs (Yet Another JS) for peer-to-peer synchronization. Currently implementing **Phase 1** - basic in-memory collaboration.

## Architecture - Phase 1 (Simple)

```
Frontend (Monaco + Yjs) ↔ WebSocket ↔ Yjs Document (Memory) ↔ Other Users
                                   ↓
                             Simple Auth Check
                                   ↓
                             Existing Room System
```

### What's Implemented (Phase 1)

✅ **Basic real-time collaboration** - Yjs handles text synchronization in memory  
✅ **WebSocket authentication** - JWT token validation using existing Supabase auth  
✅ **Room access control** - Uses existing room permissions system  
✅ **User presence & cursors** - Real-time cursor positions and user indicators  
✅ **Simple room management** - In-memory room state with cleanup  
✅ **Health monitoring** - Basic stats and health check endpoints

### What's NOT Yet Implemented (Phase 2+)

❌ Database persistence of document state  
❌ Version control and document history  
❌ Redis caching for horizontal scaling  
❌ Advanced conflict resolution  
❌ Document recovery from crashes

## Quick Start

### 1. Install Dependencies

```bash
cd apps/collaboration
pnpm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your Supabase credentials:

```env
YJS_WEBSOCKET_PORT=4002
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Start the Service

From the root Backend directory:

```bash
# Start collaboration service only
pnpm dev:collaboration

# Or start all services
pnpm dev
```

### 4. Verify It's Running

- **WebSocket**: `ws://localhost:4002/yjs`
- **Health Check**: `http://localhost:5002/health`
- **Stats**: `http://localhost:5002/stats`

## API Endpoints

### REST API (Port 5002)

| Endpoint                                        | Method | Description                   |
| ----------------------------------------------- | ------ | ----------------------------- |
| `/health`                                       | GET    | Service health check          |
| `/stats`                                        | GET    | Service and room statistics   |
| `/api/collaboration/rooms/:roomId/document`     | GET    | Get current document state    |
| `/api/collaboration/rooms/:roomId/cursors`      | GET    | Get all user cursor positions |
| `/api/collaboration/rooms/:roomId/participants` | GET    | Get active participants       |

### WebSocket API (Port 4002)

**Connection**: `ws://localhost:4002/yjs`

#### Message Types

1. **Authentication** (Required first)

```json
{
  "type": "auth",
  "data": {
    "token": "Bearer your-jwt-token",
    "roomId": "123"
  }
}
```

2. **Cursor Updates**

```json
{
  "type": "cursor",
  "data": {
    "blockId": "block-123",
    "position": 45,
    "selection": { "start": 40, "end": 50 }
  }
}
```

3. **Yjs Sync** (Handled automatically by y-websocket)

## Integration with Existing System

### Authentication Flow

1. **Frontend**: User already authenticated with Supabase
2. **WebSocket**: Send JWT token in auth message
3. **Service**: Validates token with Supabase
4. **Room Access**: Checks existing room permissions (`Room_users` or `Allowed_emails`)
5. **Success**: User joins collaborative session

### Room Permission Integration

The service uses your existing room system:

- **Room creators**: Always have admin access
- **Room members**: Access based on `Room_users` table role
- **Invited users**: Access based on `Allowed_emails` table

## Frontend Integration Guide

### 1. Install Yjs on Frontend

```bash
npm install yjs y-websocket
```

### 2. Basic Integration Example

```typescript
// hooks/useYjsCollaboration.ts
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export const useYjsCollaboration = (roomId: string, token: string) => {
  const doc = new Y.Doc();

  const provider = new WebsocketProvider(
    "ws://localhost:4002/yjs",
    roomId,
    doc,
    {
      params: { token }, // JWT token for auth
    }
  );

  // Get shared types
  const blocks = doc.getArray("blocks");
  const cursors = doc.getMap("cursors");

  return { doc, provider, blocks, cursors };
};
```

### 3. Monaco Editor Integration

```typescript
// components/SharedMonacoEditor.tsx
import { useYjsCollaboration } from '../hooks/useYjsCollaboration';
import { MonacoBinding } from 'y-monaco';

const SharedMonacoEditor = ({ roomId, token }) => {
  const { doc, provider } = useYjsCollaboration(roomId, token);
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    if (editor && doc) {
      // Bind Monaco editor to Yjs
      const yText = doc.getText('content');
      const binding = new MonacoBinding(
        yText,
        editor.getModel(),
        new Set([editor])
      );

      return () => binding.destroy();
    }
  }, [editor, doc]);

  return <MonacoEditor onMount={setEditor} />;
};
```

## Configuration

### Environment Variables

| Variable                    | Default | Description                   |
| --------------------------- | ------- | ----------------------------- |
| `YJS_WEBSOCKET_PORT`        | 4002    | WebSocket server port         |
| `YJS_MAX_ROOMS_IN_MEMORY`   | 100     | Max concurrent rooms          |
| `YJS_ROOM_INACTIVE_TIMEOUT` | 3600000 | Room cleanup timeout (1 hour) |
| `YJS_USER_INACTIVE_TIMEOUT` | 300000  | User timeout (5 minutes)      |
| `YJS_MAX_USERS_PER_ROOM`    | 50      | Max users per room            |
| `YJS_ENABLE_LOGGING`        | true    | Enable detailed logging       |

## Monitoring & Stats

### Health Check Response

```json
{
  "status": "healthy",
  "service": "collaboration",
  "timestamp": "2025-01-01T10:00:00.000Z",
  "uptime": 3600
}
```

### Stats Response

```json
{
  "activeRooms": 5,
  "totalConnections": 12,
  "memoryUsage": 1048576,
  "uptime": 3600000,
  "roomStats": [
    {
      "roomId": "123",
      "activeUsers": 3,
      "totalUsers": 3,
      "documentSize": 2048,
      "lastActivity": 1704110400000,
      "createdAt": 1704106800000
    }
  ]
}
```

## Development

### Project Structure

```
apps/collaboration/
├── src/
│   ├── types/           # TypeScript interfaces
│   ├── services/        # Core business logic
│   │   ├── auth.service.ts      # Authentication
│   │   ├── room.service.ts      # Room management
│   │   └── websocket.service.ts # WebSocket server
│   ├── routes/          # REST API endpoints
│   └── app.ts          # Main application
├── package.json
├── tsconfig.json
└── .env.example
```

### Key Classes

- **`YjsWebSocketServer`** - Main WebSocket server with authentication
- **`RoomManager`** - In-memory room and user management
- **`AuthService`** - JWT validation and room access checks
- **`createCollaborationRoutes`** - REST API for stats and document state

## Phase 2 Roadmap

### Next Features (Phase 2)

- [ ] Database persistence of document snapshots
- [ ] Document versioning and history
- [ ] Recovery from disconnections
- [ ] Redis caching for horizontal scaling
- [ ] Performance optimizations
- [ ] Advanced conflict resolution

### Database Schema (Phase 2)

```sql
-- Document snapshots table
CREATE TABLE collaboration_documents (
  room_id INTEGER REFERENCES rooms(room_id),
  document_state BYTEA, -- Yjs encoded state
  version INTEGER,
  created_at TIMESTAMPTZ,
  created_by UUID
);

-- Document versions/history
CREATE TABLE collaboration_versions (
  id UUID PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(room_id),
  version INTEGER,
  document_state BYTEA,
  changes_summary JSONB,
  created_at TIMESTAMPTZ,
  created_by UUID
);
```

## Troubleshooting

### Common Issues

1. **WebSocket connection fails**
   - Check port 4002 is available
   - Verify JWT token is valid
   - Check room permissions

2. **User can't join room**
   - Verify user is in `Room_users` or `Allowed_emails`
   - Check Supabase authentication
   - Review room access logs

3. **Text sync not working**
   - Check WebSocket connection is established
   - Verify Yjs provider is initialized
   - Look for authentication errors

### Debugging

Enable detailed logging:

```env
YJS_ENABLE_LOGGING=true
```

Check service stats:

```bash
curl http://localhost:5002/stats
```

## Security Considerations

### Phase 1 Security

✅ **JWT Authentication** - All WebSocket connections require valid JWT  
✅ **Room Access Control** - Uses existing room permission system  
✅ **Token Validation** - Validates tokens with Supabase  
✅ **User Isolation** - Users can only access rooms they have permissions for

### Phase 2 Security Enhancements

- Rate limiting on WebSocket connections
- Message size limits
- User action logging
- Advanced access control

## Performance Notes

### Phase 1 Limitations

- **Memory only** - All collaboration state in memory
- **Single server** - No horizontal scaling yet
- **No persistence** - Document state lost on restart
- **Basic cleanup** - Simple timeout-based room cleanup

### Expected Performance

- **Concurrent users per room**: Up to 50 users
- **Concurrent rooms**: Up to 100 rooms
- **Memory usage**: ~10MB per active room
- **Latency**: < 50ms for text synchronization

---

## Getting Help

For issues or questions:

1. Check the health endpoint: `http://localhost:5002/health`
2. Review service logs for errors
3. Verify environment configuration
4. Test with a simple WebSocket client first
