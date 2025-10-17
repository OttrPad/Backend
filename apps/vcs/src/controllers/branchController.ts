/**
 * Branch Controller
 * Handles HTTP requests for branch operations
 */

import { Request, Response } from 'express';
import {
  createBranch,
  getBranches,
  checkoutBranch,
  deleteBranch,
  getCurrentBranch,
  getMainBranch,
  initializeMainBranch,
  pullFromMain,
  pushToMain,
} from '../services/branchService';

/**
 * POST /branches
 * Create a new branch
 */
export async function createBranchHandler(req: Request, res: Response) {
  try {
    const { roomId, branchName, description, parentBranchId, initialSnapshot } = req.body;
    const userId = req.headers['x-gateway-user-id'] as string;

    if (!roomId || !branchName) {
      return res.status(400).json({
        error: 'roomId and branchName are required',
      });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[BranchController] Creating branch "${branchName}" in room ${roomId}`);

    const { branch, initialCommitId, error } = await createBranch(
      Number(roomId),
      branchName,
      userId,
      description,
      parentBranchId,
      initialSnapshot
    );

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to create branch',
      });
    }

    res.status(201).json({
      message: 'Branch created successfully',
      branch,
      initialCommitId,
    });
  } catch (error: any) {
    console.error('[BranchController] Error creating branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to create branch',
    });
  }
}

/**
 * GET /branches/:roomId
 * Get all branches for a room
 */
export async function getBranchesHandler(req: Request, res: Response) {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const { branches, error } = await getBranches(Number(roomId));

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to get branches',
      });
    }

    res.json({ branches });
  } catch (error: any) {
    console.error('[BranchController] Error getting branches:', error);
    res.status(500).json({
      error: error.message || 'Failed to get branches',
    });
  }
}

/**
 * GET /branches/:roomId/current
 * Get user's current branch
 */
export async function getCurrentBranchHandler(req: Request, res: Response) {
  try {
    const { roomId } = req.params;
    const userId = req.headers['x-gateway-user-id'] as string;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { branch, error } = await getCurrentBranch(Number(roomId), userId);

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to get current branch',
      });
    }

    res.json({ branch });
  } catch (error: any) {
    console.error('[BranchController] Error getting current branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to get current branch',
    });
  }
}

/**
 * GET /branches/:roomId/main
 * Get main branch for a room
 */
export async function getMainBranchHandler(req: Request, res: Response) {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const { branch, error } = await getMainBranch(Number(roomId));

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to get main branch',
      });
    }

    res.json({ branch });
  } catch (error: any) {
    console.error('[BranchController] Error getting main branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to get main branch',
    });
  }
}

/**
 * POST /branches/:branchId/checkout
 * Checkout (switch to) a branch
 * Accepts currentSnapshot in body to auto-commit before switching
 */
export async function checkoutBranchHandler(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const { roomId, currentSnapshot } = req.body;
    const userId = req.headers['x-gateway-user-id'] as string;

    if (!branchId || !roomId) {
      return res.status(400).json({
        error: 'branchId and roomId are required',
      });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[BranchController] User ${userId} checking out branch ${branchId}`, {
      hasSnapshot: !!currentSnapshot,
      blocks: currentSnapshot?.blocks?.length || 0,
    });

    const { success, branch, snapshot, autoCommitId, error } = await checkoutBranch(
      Number(roomId),
      branchId,
      userId,
      currentSnapshot
    );

    if (error || !success) {
      return res.status(500).json({
        error: error?.message || 'Failed to checkout branch',
      });
    }

    res.json({
      message: 'Branch checked out successfully',
      branch,
      snapshot,
      autoCommitId, // Return the auto-commit ID so frontend knows work was saved
    });
  } catch (error: any) {
    console.error('[BranchController] Error checking out branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to checkout branch',
    });
  }
}

/**
 * DELETE /branches/:branchId
 * Delete a branch
 */
export async function deleteBranchHandler(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const userId = req.headers['x-gateway-user-id'] as string;

    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[BranchController] Deleting branch ${branchId}`);

    const { success, error } = await deleteBranch(branchId, userId);

    if (error || !success) {
      return res.status(500).json({
        error: error?.message || 'Failed to delete branch',
      });
    }

    res.json({
      message: 'Branch deleted successfully',
    });
  } catch (error: any) {
    console.error('[BranchController] Error deleting branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to delete branch',
    });
  }
}

/**
 * POST /branches/initialize
 * Initialize main branch for a new room (internal use)
 */
export async function initializeMainBranchHandler(req: Request, res: Response) {
  try {
    const { roomId, userId } = req.body;

    if (!roomId || !userId) {
      return res.status(400).json({
        error: 'roomId and userId are required',
      });
    }

    console.log(`[BranchController] Initializing main branch for room ${roomId}`);

    const { branch, error } = await initializeMainBranch(Number(roomId), userId);

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to initialize main branch',
      });
    }

    res.status(201).json({
      message: 'Main branch initialized successfully',
      branch,
    });
  } catch (error: any) {
    console.error('[BranchController] Error initializing main branch:', error);
    res.status(500).json({
      error: error.message || 'Failed to initialize main branch',
    });
  }
}

/**
 * POST /branches/:branchId/pull
 * Pull changes from main branch into the specified branch
 */
export async function pullFromMainHandler(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const { roomId, commitMessage } = req.body;
    const userId = req.headers['x-gateway-user-id'] as string;

    if (!roomId || !branchId) {
      return res.status(400).json({
        error: 'roomId and branchId are required',
      });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[BranchController] Pulling from main into branch ${branchId}`);

    const { success, mergeCommitId, conflicts, error } = await pullFromMain(
      Number(roomId),
      branchId,
      userId,
      commitMessage
    );

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to pull from main',
      });
    }

    if (!success && conflicts) {
      return res.status(409).json({
        message: 'Pull has conflicts that must be resolved',
        conflicts,
      });
    }

    res.json({
      message: 'Successfully pulled from main',
      mergeCommitId,
    });
  } catch (error: any) {
    console.error('[BranchController] Error pulling from main:', error);
    res.status(500).json({
      error: error.message || 'Failed to pull from main',
    });
  }
}

/**
 * POST /branches/:branchId/push
 * Push changes from the specified branch to main branch
 */
export async function pushToMainHandler(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const { roomId, commitMessage } = req.body;
    const userId = req.headers['x-gateway-user-id'] as string;
    const userEmail = req.headers['x-gateway-user-email'] as string;

    if (!roomId || !branchId) {
      return res.status(400).json({
        error: 'roomId and branchId are required',
      });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[BranchController] Pushing branch ${branchId} to main`);

    const { success, mergeCommitId, conflicts, error } = await pushToMain(
      Number(roomId),
      branchId,
      userId,
      userEmail,
      commitMessage
    );

    if (error) {
      // Check if it's a permission error
      if (error.message.includes('Only owners and admins')) {
        return res.status(403).json({
          error: error.message,
        });
      }
      return res.status(500).json({
        error: error.message || 'Failed to push to main',
      });
    }

    if (!success && conflicts) {
      return res.status(409).json({
        message: 'Push has conflicts that must be resolved',
        conflicts,
      });
    }

    res.json({
      message: 'Successfully pushed to main',
      mergeCommitId,
    });
  } catch (error: any) {
    console.error('[BranchController] Error pushing to main:', error);
    res.status(500).json({
      error: error.message || 'Failed to push to main',
    });
  }
}
