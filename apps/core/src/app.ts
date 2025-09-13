import express from "express";
import cors from "cors";
import roomRoutes from "./routes/room.routes";
import userRoutes from "./routes/user.routes";
import aiRoutes from "./routes/ai.routes";
import { requireGatewayAuth } from "./middleware/service-auth.middleware";

const app = express();
const PORT = process.env.CORE_PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check (accessible directly)
app.get("/status", (req, res) => {
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
app.use("/users", userRoutes);
app.use("/ai", aiRoutes); // POST /ai/chat

app.listen(PORT, () => {
  console.log(`🚀 Core Service running on http://localhost:${PORT}`);
  console.log(`📋 Features: Room Management, User Management, Access Control`);
  console.log(`🔗 API Gateway: http://localhost:4000/api/*`);
});
