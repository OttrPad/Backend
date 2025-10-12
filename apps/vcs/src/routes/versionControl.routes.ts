// src/version-control-service/routes/versionControl.routes.ts
import { Router } from "express";
import { requireGatewayAuth } from "../middleware/gatewayAuth.middleware"; // Gateway Authentication middleware
import { requireInternalAuth } from "../middleware/internalAuth.middleware";
import {
  requireEditorOrOwner,
  requireOwner,
} from "../middleware/roleCheck.middleware"; // Role middleware
import {
  createCommitHandler,
  deleteCommitHandler,
  getCommitSnapshotHandler,
  restoreCommitHandler,
} from "../controllers/commitController"; // Commit Controllers
import {
  createMilestoneHandler,
  getMilestonesHandler,
  deleteMilestoneHandler,
} from "../controllers/milestoneController"; // Milestone Controller

const router: Router = Router();

// Apply requireGatewayAuth middleware to ensure requests are coming through the API Gateway
router.use(requireGatewayAuth);

// Commit routes - notebook-wide commits
router.post("/commits", requireEditorOrOwner, createCommitHandler);
// Internal query for latest commits (used by collab reaper auto-restore)
router.get("/commits", requireInternalAuth, async (req, res) => {
  try {
    const { notebookId, type, limit } = req.query as any;
    const { supabase } = await import("@packages/supabase");
    let q = supabase
      .from("Commits")
      .select("commit_id, notebook_id, created_at, commit_type, hidden")
      .order("created_at", { ascending: false });
    if (notebookId) q = q.eq("notebook_id", notebookId);
    if (type === "temp") q = q.eq("commit_type", "temp");
    if (limit) q = q.limit(parseInt(String(limit)) || 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ commits: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});
router.get(
  "/commits/:commitId/snapshot",
  requireGatewayAuth,
  getCommitSnapshotHandler
);
router.post("/restore", requireEditorOrOwner, restoreCommitHandler);
// Allow internal delete for temp cleanup via secret (bypassed in gateway middleware) and owner via gateway
router.delete("/commits/:commitId", requireGatewayAuth, deleteCommitHandler);

// Milestone routes
router.post("/milestones", requireOwner, createMilestoneHandler); // Create milestone (only owner)
router.get("/milestones/:roomId", getMilestonesHandler); // Get all milestones
router.delete(
  "/milestones/:roomId/:milestoneId",
  requireOwner,
  deleteMilestoneHandler
); // Delete milestone (only owner)

// Timeline route (room-wide)
import { getCommitTimelineController } from "../controllers/commitTimelineController";
router.get(
  "/timeline/:roomId",
  requireGatewayAuth,
  getCommitTimelineController
);

export { router as versionControlRoutes };
