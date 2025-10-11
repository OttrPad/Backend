import express from "express";
import cors from "cors";
import roomRoutes from "./routes/room.routes";
import workspaceRoutes from "./routes/workspace.routes";
import userRoutes from "./routes/user.routes";
import aiRoutes from "./routes/ai.routes";
import { requireGatewayAuth } from "./middleware/service-auth.middleware";
import { log } from "@ottrpad/logger";

const app = express();
const PORT = process.env.CORE_PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check (accessible directly)
app.get("/status", (req, res) => {
  log.info("core.status", { path: req.path, ip: req.ip });
  res.json({
    service: "Core",
    status: "operational",
    timestamp: new Date().toISOString(),
    features: ["room management", "user management", "access control"],
    note: "For API access, use the Gateway at http://localhost:4000/api/*",
  });
});

// Protect all other routes - must come from API Gateway
app.use(requireGatewayAuth);

// Protected routes
app.use("/rooms", roomRoutes);
app.use("/workspaces", workspaceRoutes);
app.use("/users", userRoutes);
app.use("/ai", aiRoutes); // POST /ai/chat

app.listen(PORT, () => {
  log.info(`Core Service running`, { url: `http://localhost:${PORT}` });
  log.info(`Core features`, {
    features: ["Room Management", "User Management", "Access Control"],
  });
  log.info(`Gateway info`, { base: "http://localhost:4000/api/*" });
});

// Basic error handler fallback
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error("core.unhandled_error", { error: err });
    res.status(500).json({ error: "Internal Server Error" });
  }
);
