import { Request, Response } from "express";
import { getWorkspaces, getWorkspaceById } from "../services/workspaceService";

export const getWorkspacesHandler = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getWorkspaces(limit, offset);

    res.status(200).json({
      message: "Workspaces retrieved successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("Error fetching workspaces:", err?.message || err);
    res.status(500).json({
      error: "Failed to fetch workspaces",
      details: err?.message || err,
    });
  }
};

export const getWorkspaceByIdHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const workspaceId = Number(id);
    if (!id || Number.isNaN(workspaceId)) {
      return res.status(400).json({ error: "Valid workspace id is required" });
    }

    const ws = await getWorkspaceById(workspaceId);
    if (!ws) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    res.status(200).json({
      message: "Workspace retrieved successfully",
      workspace: ws,
    });
  } catch (err: any) {
    console.error("Error fetching workspace:", err?.message || err);
    res.status(500).json({
      error: "Failed to fetch workspace",
      details: err?.message || err,
    });
  }
};
