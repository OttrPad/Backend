import express, { Express } from "express";
import cors from "cors";
import { versionControlRoutes } from "./src/routes/versionControl.routes";
import { requireGatewayAuth } from "./src/middleware/gatewayAuth.middleware";
import { log } from "@ottrpad/logger";

const app: Express = express();
const PORT = process.env.VERSION_CONTROL_PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check (accessible directly)
app.get("/status", (req, res) => {
  log.info("vcs.status", { path: req.path, ip: req.ip });
  res.json({
    service: "Version Control",
    status: "operational",
    timestamp: new Date().toISOString(),
    features: ["commit management", "milestone management", "access control"],
    note: "For API access, use the Gateway at http://localhost:4000/api/*",
  });
});

// Protect all other routes - must come from the API Gateway
app.use(requireGatewayAuth);

// Protected routes
app.use("/api/version-control", versionControlRoutes);

// Start the server only if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    log.info("vcs.start", { url: `http://localhost:${PORT}` });
    log.info("vcs.features", {
      features: ["Commit Management", "Milestone Management", "Access Control"],
    });
    log.info("vcs.gateway", { base: "http://localhost:4000/api/*" });
  });
}

export default app;
