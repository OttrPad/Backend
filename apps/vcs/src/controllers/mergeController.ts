import { Request, Response } from "express";
import {
  mergeBranches,
  getMergeConflicts,
  resolveConflict,
  applyMerge,
  getMergeDiff,
} from "../services/mergeService";

/**
 * POST /merge
 * Merge source branch into target branch
 */
export async function mergeBranchesHandler(req: Request, res: Response) {
  try {
    const { sourceBranchId, targetBranchId, commitMessage } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!sourceBranchId || !targetBranchId) {
      return res.status(400).json({
        error: "sourceBranchId and targetBranchId are required",
      });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(
      `[MergeController] Merging ${sourceBranchId} into ${targetBranchId}`
    );

    const result = await mergeBranches(
      sourceBranchId,
      targetBranchId,
      userId,
      commitMessage
    );

    if (result.error && !result.conflicts) {
      return res.status(500).json({
        error: result.error.message || "Failed to merge branches",
      });
    }

    if (result.conflicts && result.conflicts.length > 0) {
      return res.status(409).json({
        message: "Merge has conflicts",
        hasConflicts: true,
        conflicts: result.conflicts,
      });
    }

    res.json({
      message: "Branches merged successfully",
      success: true,
      mergeCommitId: result.mergeCommitId,
    });
  } catch (error: any) {
    console.error("[MergeController] Error merging branches:", error);
    res.status(500).json({
      error: error.message || "Failed to merge branches",
    });
  }
}

/**
 * GET /merge/conflicts/:roomId
 * Get all unresolved conflicts for a room
 */
export async function getConflictsHandler(req: Request, res: Response) {
  try {
    const { roomId } = req.params;
    const { sourceBranchId, targetBranchId } = req.query;

    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const { conflicts, error } = await getMergeConflicts(
      Number(roomId),
      sourceBranchId as string | undefined,
      targetBranchId as string | undefined
    );

    if (error) {
      return res.status(500).json({
        error: error.message || "Failed to get conflicts",
      });
    }

    res.json({ conflicts });
  } catch (error: any) {
    console.error("[MergeController] Error getting conflicts:", error);
    res.status(500).json({
      error: error.message || "Failed to get conflicts",
    });
  }
}

/**
 * POST /merge/conflicts/:conflictId/resolve
 * Resolve a specific conflict
 */
export async function resolveConflictHandler(req: Request, res: Response) {
  try {
    const { conflictId } = req.params;
    const { resolution } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!conflictId || !resolution) {
      return res.status(400).json({
        error: "conflictId and resolution are required",
      });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(`[MergeController] Resolving conflict ${conflictId}`);

    const { success, error } = await resolveConflict(
      conflictId,
      resolution,
      userId
    );

    if (error || !success) {
      return res.status(500).json({
        error: error?.message || "Failed to resolve conflict",
      });
    }

    res.json({
      message: "Conflict resolved successfully",
      success: true,
    });
  } catch (error: any) {
    console.error("[MergeController] Error resolving conflict:", error);
    res.status(500).json({
      error: error.message || "Failed to resolve conflict",
    });
  }
}

/**
 * POST /merge/apply
 * Apply merge after all conflicts are resolved
 */
export async function applyMergeHandler(req: Request, res: Response) {
  try {
    const { roomId, sourceBranchId, targetBranchId, commitMessage } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!roomId || !sourceBranchId || !targetBranchId) {
      return res.status(400).json({
        error: "roomId, sourceBranchId, and targetBranchId are required",
      });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(
      `[MergeController] Applying merge ${sourceBranchId} -> ${targetBranchId}`
    );

    const { success, mergeCommitId, error } = await applyMerge(
      Number(roomId),
      sourceBranchId,
      targetBranchId,
      userId,
      commitMessage
    );

    if (error || !success) {
      return res.status(500).json({
        error: error?.message || "Failed to apply merge",
      });
    }

    res.json({
      message: "Merge applied successfully",
      success: true,
      mergeCommitId,
    });
  } catch (error: any) {
    console.error("[MergeController] Error applying merge:", error);
    res.status(500).json({
      error: error.message || "Failed to apply merge",
    });
  }
}

/**
 * GET /merge/diff
 * Get merge preview (diff without actually merging)
 */
export async function getMergeDiffHandler(req: Request, res: Response) {
  try {
    const { sourceBranchId, targetBranchId } = req.query;

    if (!sourceBranchId || !targetBranchId) {
      return res.status(400).json({
        error: "sourceBranchId and targetBranchId are required",
      });
    }

    const { diff, error } = await getMergeDiff(
      sourceBranchId as string,
      targetBranchId as string
    );

    if (error) {
      return res.status(500).json({
        error: error.message || "Failed to get merge diff",
      });
    }

    res.json({ diff });
  } catch (error: any) {
    console.error("[MergeController] Error getting merge diff:", error);
    res.status(500).json({
      error: error.message || "Failed to get merge diff",
    });
  }
}
