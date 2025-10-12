import { Router } from "express";
import {
  getWorkspacesHandler,
  getWorkspaceByIdHandler,
} from "../controllers/workspaceController";

const router: Router = Router();

// GET /workspaces -> list available starter templates
router.get("/", getWorkspacesHandler);

// GET /workspaces/:id -> get a specific workspace
router.get("/:id", getWorkspaceByIdHandler);

export default router;
