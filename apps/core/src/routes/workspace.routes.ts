import { Router } from "express";
import { getWorkspacesHandler } from "../controllers/workspaceController";

const router: Router = Router();

// GET /workspaces -> list available starter templates
router.get("/", getWorkspacesHandler);

export default router;
