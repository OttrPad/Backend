# Frontend WebSocket Connection Guide

## Overview

The Yjs collaboration service is now running and ready for frontend connections. This guide explains how to connect to the WebSocket server for real-time collaboration.

## Service Information

- **WebSocket Server**: `ws://localhost:4002/yjs`
- **Health Check**: `http://localhost:5002/health`
- **Service Stats**: `http://localhost:5002/stats`
- **REST API**: All room/user APIs go through `http://localhost:4000/api/*`

## Connection Flow

### 1. Establish WebSocket Connection

```javascript
// Connect to the Yjs WebSocket server
const wsUrl = "ws://localhost:4002/yjs";
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log("✅ WebSocket connected");
  // Send authentication after connection
  authenticateUser();
};

ws.onclose = (event) => {
  console.log(`❌ WebSocket closed: ${event.code} - ${event.reason}`);
};

ws.onerror = (error) => {
  console.error("🚨 WebSocket error:", error);
};
```

### 2. Authentication

After WebSocket connects, authenticate with the same JWT token used for API calls:

```javascript
function authenticateUser() {
  const authMessage = {
    type: "auth",
    data: {
      roomId: "your-room-id", // Room ID from your application
      token: "your-jwt-token", // Same JWT token used for API calls
    },
  };

  ws.send(JSON.stringify(authMessage));
}

// Handle authentication response
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "auth_success":
      console.log("✅ Authentication successful");
      console.log("User info:", message.data);
      // Initialize Yjs document here
      initializeYjsDocument();
      break;

    case "error":
      console.error("❌ Authentication failed:", message.data);
      break;

    case "presence":
      handlePresenceUpdate(message.data);
      break;

    case "cursor":
      handleCursorUpdate(message.data);
      break;

    case "doc_update":
      handleDocumentUpdate(message.data);
      break;
  }
};
```

### 3. Initialize Yjs Document

```javascript
import * as Y from "yjs";

let yjsDoc = null;

function initializeYjsDocument() {
  // Create Yjs document
  yjsDoc = new Y.Doc();

  // Get shared types
  const blocks = yjsDoc.getArray("blocks");
  const cursors = yjsDoc.getMap("cursors");
  const metadata = yjsDoc.getMap("metadata");

  // Listen for document updates
  yjsDoc.on("update", (update) => {
    // Send updates to other clients via WebSocket
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "sync",
          data: Array.from(update),
        })
      );
    }
  });

  // Listen for text changes in blocks
  blocks.observe((event) => {
    console.log("📝 Document blocks changed:", event.changes);
    // Update your editor UI here
  });

  console.log("📄 Yjs document initialized");
}
```

### 4. Handle Real-time Events

```javascript
function handlePresenceUpdate(data) {
  switch (data.type) {
    case "user_joined":
      console.log(`👤 ${data.userName} joined the room`);
      // Update user list UI
      break;

    case "user_left":
      console.log(`👋 ${data.userName} left the room`);
      // Update user list UI
      break;
  }
}

function handleCursorUpdate(data) {
  console.log(`🎯 Cursor update from ${data.userId}:`, {
    blockId: data.blockId,
    position: data.position,
  });
  // Update cursor visualization in editor
}

function handleDocumentUpdate(data) {
  // Apply Yjs updates from other clients
  if (yjsDoc) {
    const update = new Uint8Array(data.data);
    Y.applyUpdate(yjsDoc, update);
  }
}
```

### 5. Send Cursor Updates

```javascript
function sendCursorUpdate(blockId, position, selection = null) {
  if (ws.readyState === WebSocket.OPEN) {
    const cursorMessage = {
      type: "cursor",
      data: {
        blockId: blockId,
        position: position,
        selection: selection,
      },
    };

    ws.send(JSON.stringify(cursorMessage));
  }
}

// Example: Call this when user's cursor moves
// sendCursorUpdate('block-123', 45, { start: 40, end: 50 });
```

## REST API Integration

While WebSocket handles real-time collaboration, use REST APIs for room management:

```javascript
// Get room participants (members + invited users)
async function getRoomParticipants(roomId) {
  const response = await fetch(
    `http://localhost:4000/api/rooms/${roomId}/participants`,
    {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.json();
}

// Get active collaboration participants (WebSocket users)
async function getActiveParticipants(roomId) {
  const response = await fetch(
    `http://localhost:4000/api/collaboration/rooms/${roomId}/participants`,
    {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.json();
}

// Get current document state
async function getDocumentState(roomId) {
  const response = await fetch(
    `http://localhost:4000/api/collaboration/rooms/${roomId}/document`,
    {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.json();
}
```

## Complete Example

```javascript
class CollaborationClient {
  constructor(roomId, jwtToken) {
    this.roomId = roomId;
    this.jwtToken = jwtToken;
    this.ws = null;
    this.yjsDoc = null;
    this.isAuthenticated = false;
  }

  connect() {
    this.ws = new WebSocket("ws://localhost:4002/yjs");

    this.ws.onopen = () => {
      console.log("✅ WebSocket connected");
      this.authenticate();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };

    this.ws.onclose = (event) => {
      console.log(`❌ Connection closed: ${event.code}`);
      this.isAuthenticated = false;
    };

    this.ws.onerror = (error) => {
      console.error("🚨 WebSocket error:", error);
    };
  }

  authenticate() {
    const authMessage = {
      type: "auth",
      data: {
        roomId: this.roomId,
        token: this.jwtToken,
      },
    };
    this.ws.send(JSON.stringify(authMessage));
  }

  handleMessage(message) {
    switch (message.type) {
      case "auth_success":
        this.isAuthenticated = true;
        this.initializeYjs();
        break;

      case "error":
        console.error("❌ Error:", message.data);
        break;

      case "presence":
        this.handlePresence(message.data);
        break;

      case "cursor":
        this.handleCursor(message.data);
        break;

      case "doc_update":
        this.handleDocUpdate(message.data);
        break;
    }
  }

  initializeYjs() {
    this.yjsDoc = new Y.Doc();

    // Set up your shared types
    const blocks = this.yjsDoc.getArray("blocks");

    // Listen for changes
    this.yjsDoc.on("update", (update) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "sync",
            data: Array.from(update),
          })
        );
      }
    });

    console.log("📄 Yjs initialized for room:", this.roomId);
  }

  handlePresence(data) {
    // Handle user join/leave events
    console.log("👥 Presence update:", data);
  }

  handleCursor(data) {
    // Handle cursor updates from other users
    console.log("🎯 Cursor update:", data);
  }

  handleDocUpdate(data) {
    // Apply document updates
    if (this.yjsDoc) {
      const update = new Uint8Array(data.data);
      Y.applyUpdate(this.yjsDoc, update);
    }
  }

  sendCursorUpdate(blockId, position, selection = null) {
    if (this.isAuthenticated && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "cursor",
          data: { blockId, position, selection },
        })
      );
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage
const collaboration = new CollaborationClient("room-123", "your-jwt-token");
collaboration.connect();
```

## Testing the Connection

You can test the WebSocket connection using the provided test page:

1. Open `d:\projects\Ottrpad\Backend\websocket-test.html` in your browser
2. Connect to `ws://localhost:4002/yjs`
3. Enter your JWT token and room ID
4. Click "Authenticate" to test the auth flow

## Error Handling

Common issues and solutions:

1. **Connection Refused**: Make sure the collaboration service is running (`pnpm run dev:collaboration`)
2. **Authentication Failed**: Verify your JWT token is valid and not expired
3. **Access Denied**: Ensure the user has access to the specified room
4. **Document Sync Issues**: Check browser console for Yjs-related errors

## Service Endpoints Summary

| Purpose                    | Method | URL                                                               |
| -------------------------- | ------ | ----------------------------------------------------------------- |
| WebSocket Connection       | WS     | `ws://localhost:4002/yjs`                                         |
| Health Check               | GET    | `http://localhost:5002/health`                                    |
| Service Stats              | GET    | `http://localhost:5002/stats`                                     |
| Room Participants          | GET    | `http://localhost:4000/api/rooms/{id}/participants`               |
| Active Collaboration Users | GET    | `http://localhost:4000/api/collaboration/rooms/{id}/participants` |
| Document State             | GET    | `http://localhost:4000/api/collaboration/rooms/{id}/document`     |
| User Cursors               | GET    | `http://localhost:4000/api/collaboration/rooms/{id}/cursors`      |

## Notes

- **Authentication**: Use the same JWT token for both WebSocket and REST API calls
- **Room Access**: Users must have room access (member or invited) to join collaboration
- **Auto-Reconnection**: Implement reconnection logic for production use
- **User Colors**: The service automatically assigns colors to users
- **Document Persistence**: Yjs documents are kept in memory for the current session

## Next Steps

1. Integrate this WebSocket client into your React/frontend application
2. Connect it to your existing editor component
3. Implement cursor visualization and user presence indicators
4. Add reconnection logic for production reliability

The collaboration service is now ready and waiting for frontend connections! 🚀
