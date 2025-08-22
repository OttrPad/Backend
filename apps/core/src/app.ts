import express from "express";
import cors from "cors";
import roomRoutes from "./routes/room.routes";
import { requireGatewayAuth } from "./middleware/service-auth.middleware";

const app = express();
const PORT = process.env.CORE_PORT || 4001;

app.use(cors());
app.use(express.json());

// Health check (accessible directly)
app.get("/status", (req, res) => {
  res.json({
    service: "Core",
    status: "operational",
    timestamp: new Date().toISOString(),
    note: "For API access, use the Gateway at http://localhost:4000/api/*",
  });
});

// Protect all other routes - must come from API Gateway
app.use(requireGatewayAuth);

// Protected routes
app.use("/rooms", roomRoutes);

app.listen(PORT, () => {
  console.log(`Core service running on http://localhost:${PORT}`);
});
