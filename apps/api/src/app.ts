import express from "express";
import cors from "cors";
import { setupSwagger } from "./config/swagger.config";
import gatewayRoutes from "./routes/gateway.routes";
import healthRoutes from "./routes/health.routes";

const app = express();
const PORT = process.env.API_PORT || 4000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

// Setup Swagger documentation
setupSwagger(app);

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Realtime Code Editor API Gateway",
    version: "1.0.0",
    docs: "/api-docs",
    health: "/health",
  });
});

// Health routes
app.use("/", healthRoutes);

// API routes (protected)
app.use("/api", gatewayRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      "GET /",
      "GET /health",
      "GET /health/services",
      "GET /api-docs",
      "POST /api/rooms",
      "GET /api/rooms",
      "PUT /api/rooms/:id",
      "DELETE /api/rooms/:id",
    ],
  });
});

// Error handler
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("❌ Unhandled error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Something went wrong on the server",
    });
  }
);

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log(`⚠️  WebSocket Collaboration: ws://localhost:4002/yjs (Direct)`);
  console.log(`📋 Frontend should connect to: ws://localhost:4002/yjs`);
  console.log(`📝 Note: WebSocket connection bypasses API Gateway for now`);
});
