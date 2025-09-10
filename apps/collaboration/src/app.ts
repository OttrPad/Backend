import express from "express";
import cors from "cors";
import { YjsWebSocketServer } from "./services/websocket.service";
import { RoomManager } from "./services/room.service";
import { createCollaborationRoutes } from "./routes/collaboration.routes";
import { CollaborationConfig } from "./types";

// Load environment variables
const config: CollaborationConfig = {
  port: parseInt(process.env.YJS_WEBSOCKET_PORT || "4002"),
  maxRoomsInMemory: parseInt(process.env.YJS_MAX_ROOMS_IN_MEMORY || "100"),
  roomInactiveTimeout: parseInt(
    process.env.YJS_ROOM_INACTIVE_TIMEOUT || "3600000"
  ), // 1 hour
  userInactiveTimeout: parseInt(
    process.env.YJS_USER_INACTIVE_TIMEOUT || "300000"
  ), // 5 minutes
  maxUsersPerRoom: parseInt(process.env.YJS_MAX_USERS_PER_ROOM || "50"),
  enableLogging: process.env.YJS_ENABLE_LOGGING === "true",
};

console.log("🔧 Collaboration service configuration:", {
  ...config,
  port: config.port,
  maxRoomsInMemory: config.maxRoomsInMemory,
});

// Create Express app for health checks and stats
const app = express();
app.use(cors());
app.use(express.json());

// Create Yjs WebSocket server
let yjsServer: YjsWebSocketServer;
let roomManager: RoomManager;

try {
  roomManager = new RoomManager();
  yjsServer = new YjsWebSocketServer(config, roomManager);
} catch (error) {
  console.error("❌ Failed to start Yjs WebSocket server:", error);
  process.exit(1);
}

// Setup API routes
app.use("/api/collaboration", createCollaborationRoutes(roomManager));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "collaboration",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Stats endpoint
app.get("/stats", (req, res) => {
  try {
    const stats = yjsServer.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Start HTTP server for health checks (different port)
const httpPort = config.port + 1000; // e.g., if WebSocket is 4002, HTTP is 5002
app.listen(httpPort, () => {
  console.log(`🏥 Health check server listening on port ${httpPort}`);
  console.log(`📊 Stats available at http://localhost:${httpPort}/stats`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  yjsServer.shutdown();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  yjsServer.shutdown();
  process.exit(0);
});

console.log("✅ Collaboration service started successfully");
console.log(`🔗 WebSocket server: ws://localhost:${config.port}/yjs`);
console.log(`🏥 Health check: http://localhost:${httpPort}/health`);
console.log(`📊 Stats endpoint: http://localhost:${httpPort}/stats`);
