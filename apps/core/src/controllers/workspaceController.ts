import { Request, Response } from "express";
import { getWorkspaces } from "../services/workspaceService";

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
