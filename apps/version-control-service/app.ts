import express from "express";
import cors from "cors";
import { versionControlRoutes } from "./src/routes/versionControl.routes";  // Importing version control routes
import { requireGatewayAuth } from "./src/middleware/gatewayAuth.middleware";  // Importing gateway authentication middleware

const app = express();
const PORT = process.env.VERSION_CONTROL_PORT || 5000;  // Default port for version control service

// Middleware
app.use(cors());  // Enable CORS for cross-origin requests
app.use(express.json());  // Parse incoming JSON requests

// Health check (accessible directly without gateway authentication)
app.get("/status", (req, res) => {
  res.json({
    service: "Version Control",
    status: "operational",
    timestamp: new Date().toISOString(),
    features: ["commit management", "milestone management", "access control"],
    note: "For API access, use the Gateway at http://localhost:4000/api/*",
  });
});

// Protect all other routes - must come from the API Gateway
app.use(requireGatewayAuth);  // Ensure requests come from the API Gateway

// Protected routes
app.use("/api/version-control", versionControlRoutes);  // Version control routes

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Version Control Service running on http://localhost:${PORT}`);
  console.log(`📋 Features: Commit Management, Milestone Management, Access Control`);
  console.log(`🔗 API Gateway: http://localhost:4000/api/*`);
});
