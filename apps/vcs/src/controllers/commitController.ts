// src/version-control-service/controllers/commitController.ts
import { Request, Response } from "express";
import * as commitService from "../services/commitService"; // Importing commit service
import { log } from "@ottrpad/logger";

// Notebook-wide commit
export const createCommitHandler = async (req: Request, res: Response) => {
  try {
    const { roomId, notebookId, message, snapshot } = req.body as {
      roomId: string;
      notebookId: string;
      message?: string;
      snapshot?: any;
    };
    const userId = req.headers["x-gateway-user-id"] as string;
    const isTemp =
      (req.headers["x-commit-temp"] as string)?.toLowerCase?.() === "true";

    if (!roomId || !notebookId) {
      return res
        .status(400)
        .json({ error: "roomId and notebookId are required" });
    }

    const result = await commitService.createNotebookCommit({
      roomId,
      notebookId,
      message: message || "",
      userId,
      snapshot,
      isTemp,
    });

    res.status(201).json(result);
  } catch (err: any) {
    log.error("vcs.commit.create_error", { error: err });
    res
      .status(500)
      .json({ error: "Failed to create commit", details: err.message || err });
  }
};

export const deleteCommitHandler = async (req: Request, res: Response) => {
  try {
    const { commitId } = req.params; // Extract commitId from request parameters
    const userId = req.headers["x-gateway-user-id"] as string; // Extract userId from headers

    // Call the service to delete the commit
    await commitService.deleteCommit(commitId, userId);

    // Respond with success message
    res.status(200).json({ message: "Commit deleted successfully" });
  } catch (err: any) {
    // Handle errors and respond with appropriate error message
    log.error("vcs.commit.delete_error", { error: err });
    res
      .status(500)
      .json({ error: "Failed to delete commit", details: err.message || err });
  }
};

// Return a notebook snapshot for a commit
export const getCommitSnapshotHandler = async (req: Request, res: Response) => {
  try {
    const { commitId } = req.params as { commitId: string };
    if (!commitId)
      return res.status(400).json({ error: "commitId is required" });
    const snapshot = await commitService.getCommitSnapshot(commitId);
    res.setHeader("Content-Type", "application/vnd.ottrpad.notebook+json");
    res.json(snapshot);
  } catch (err: any) {
    log.error("vcs.commit.snapshot_error", { error: err });
    res
      .status(500)
      .json({ error: "Failed to fetch snapshot", details: err.message || err });
  }
};

// Restore a commit into the collab service
export const restoreCommitHandler = async (req: Request, res: Response) => {
  try {
    const { roomId, commitId } = req.body as {
      roomId: string;
      commitId: string;
    };
    const userId = req.headers["x-gateway-user-id"] as string;
    if (!roomId || !commitId) {
      return res
        .status(400)
        .json({ error: "roomId and commitId are required" });
    }

    const result = await commitService.restoreCommit({
      roomId,
      commitId,
      userId,
    });
    res.status(200).json(result);
  } catch (err: any) {
    log.error("vcs.commit.restore_error", { error: err });
    res
      .status(500)
      .json({ error: "Failed to restore commit", details: err.message || err });
  }
};
