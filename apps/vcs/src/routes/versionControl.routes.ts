// src/version-control-service/routes/versionControl.routes.ts
import { Router } from "express";
import { requireGatewayAuth } from "../middleware/gatewayAuth.middleware";  // Gateway Authentication middleware
import { requireEditorOrOwner } from "../middleware/roleCheck.middleware";  // Commit Role middleware (Editor or Owner)
import { requireOwner } from "../middleware/roleCheck.middleware";  // Milestone Role middleware (Owner only)
import { createCommitHandler } from "../controllers/commitController";  // Commit Controller
import { createMilestoneHandler, getMilestonesHandler, deleteMilestoneHandler } from "../controllers/milestoneController";  // Milestone Controller

const router: Router = Router();

// Apply requireGatewayAuth middleware to ensure requests are coming through the API Gateway
router.use(requireGatewayAuth);

// Commit routes - require Editor or Owner role
router.post("/commits", requireEditorOrOwner, createCommitHandler);

// Milestone routes - require Owner role
router.post("/milestones", requireOwner, createMilestoneHandler);  // Create milestone (only owner)
router.get("/milestones/:roomId", getMilestonesHandler);  // Get all milestones
router.delete("/milestones/:roomId/:milestoneId", requireOwner, deleteMilestoneHandler);  // Delete milestone (only owner)

export { router as versionControlRoutes };
