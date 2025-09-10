import express, { Application } from "express";
import { createServer } from "http";
import cors from "cors";
import RealtimeCollaborationService from "./services/realtimeCollaborationService";
import collaborationRoutes from "./routes/collaboration.routes";

const app: Application = express();
const httpServer = createServer(app);

// Environment variables with defaults
const PORT = process.env.COLLABORATION_HTTP_PORT || 5002;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "collaboration",
    timestamp: new Date().toISOString(),
  });
});

// Initialize realtime collaboration service
const realtimeService = new RealtimeCollaborationService(httpServer);

// Attach service to routes for access (simplified approach)
app.locals.realtimeService = realtimeService;

// API routes
app.use("/api/collaboration", collaborationRoutes);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Collaboration Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for: ${FRONTEND_URL}`);
});

export { app, httpServer, realtimeService };
