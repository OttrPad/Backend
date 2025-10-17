/**
 * Merge Service
 * Handles branch merging with conflict detection and resolution
 */

import { supabase } from '@packages/supabase';
import { threeWayMerge, type Block, type MergeResult } from './diffService';
import { getBranchById } from './branchService';
import { createCommit } from './commitService';

export interface MergeConflict {
  conflict_id: string;
  room_id: number;
  source_branch_id: string;
  target_branch_id: string;
  block_id: string;
  source_content: any;
  target_content: any;
  base_content: any;
  conflict_type: 'modify-modify' | 'modify-delete' | 'add-add';
  resolved: boolean;
  resolution_content: any;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

/**
 * Find common ancestor of two branches
 */
async function findCommonAncestor(
  branch1Id: string,
  branch2Id: string
): Promise<{ commitId: string | null; error: Error | null }> {
  try {
    // Use the PostgreSQL function we created in migration
    const { data, error } = await supabase.rpc('find_common_ancestor', {
      p_branch1_id: branch1Id,
      p_branch2_id: branch2Id,
    });

    if (error) {
      // Fallback: If function doesn't exist, find manually
      return await findCommonAncestorFallback(branch1Id, branch2Id);
    }

    // Get the last commit from the common ancestor branch
    if (data) {
      const { data: ancestorBranch } = await supabase
        .from('branches')
        .select('last_commit_id')
        .eq('branch_id', data)
        .single();

      return { commitId: ancestorBranch?.last_commit_id || null, error: null };
    }

    return { commitId: null, error: null };
  } catch (error: any) {
    console.error('[MergeService] Error finding common ancestor:', error.message);
    return { commitId: null, error };
  }
}

/**
 * Fallback method to find common ancestor
 */
async function findCommonAncestorFallback(
  branch1Id: string,
  branch2Id: string
): Promise<{ commitId: string | null; error: Error | null }> {
  try {
    // Get both branch hierarchies
    const hierarchy1 = await getBranchHierarchy(branch1Id);
    const hierarchy2 = await getBranchHierarchy(branch2Id);

    // Find first common branch
    for (const b1 of hierarchy1) {
      for (const b2 of hierarchy2) {
        if (b1.branch_id === b2.branch_id) {
          return { commitId: b1.last_commit_id, error: null };
        }
      }
    }

    return { commitId: null, error: null };
  } catch (error: any) {
    return { commitId: null, error };
  }
}

/**
 * Get branch hierarchy (branch and all parents)
 */
async function getBranchHierarchy(branchId: string): Promise<any[]> {
  const hierarchy: any[] = [];
  let currentId: string | null = branchId;

  while (currentId) {
    const { data: branch } = await supabase
      .from('branches')
      .select('*')
      .eq('branch_id', currentId)
      .single();

    if (!branch) break;

    hierarchy.push(branch);
    currentId = branch.parent_branch_id;
  }

  return hierarchy;
}

/**
 * Merge source branch into target branch
 */
export async function mergeBranches(
  sourceBranchId: string,
  targetBranchId: string,
  userId: string,
  commitMessage?: string
): Promise<{
  success: boolean;
  mergeCommitId?: string;
  conflicts?: MergeConflict[];
  error: Error | null;
}> {
  try {
    console.log(`[MergeService] Merging ${sourceBranchId} into ${targetBranchId}`);

    // Get both branches
    const { branch: sourceBranch } = await getBranchById(sourceBranchId);
    const { branch: targetBranch } = await getBranchById(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      throw new Error('Source or target branch not found');
    }

    if (sourceBranch.room_id !== targetBranch.room_id) {
      throw new Error('Branches must be in the same room');
    }

    // Get latest commits from both branches
    const { data: sourceCommit } = await supabase
      .from('commits')
      .select('snapshot_json')
      .eq('commit_id', sourceBranch.last_commit_id)
      .single();

    const { data: targetCommit } = await supabase
      .from('commits')
      .select('snapshot_json')
      .eq('commit_id', targetBranch.last_commit_id)
      .single();

    if (!sourceCommit?.snapshot_json) {
      throw new Error('Source branch has no commits');
    }

    // If target has no commits, just copy source snapshot
    if (!targetCommit?.snapshot_json) {
      const { commitId } = await createCommit(
        sourceBranch.room_id,
        userId,
        sourceCommit.snapshot_json,
        commitMessage || `Merge ${sourceBranch.branch_name} into ${targetBranch.branch_name}`,
        targetBranchId,
        sourceBranchId
      );

      return { success: true, mergeCommitId: commitId, error: null };
    }

    // Find common ancestor
    const { commitId: baseCommitId } = await findCommonAncestor(sourceBranchId, targetBranchId);

    let baseBlocks: Block[] = [];
    if (baseCommitId) {
      const { data: baseCommit } = await supabase
        .from('commits')
        .select('snapshot_json')
        .eq('commit_id', baseCommitId)
        .single();

      baseBlocks = baseCommit?.snapshot_json?.blocks || [];
    }

    const sourceBlocks: Block[] = sourceCommit.snapshot_json.blocks || [];
    const targetBlocks: Block[] = targetCommit.snapshot_json.blocks || [];

    // Perform three-way merge
    const mergeResult: MergeResult = threeWayMerge(baseBlocks, sourceBlocks, targetBlocks);

    // If there are conflicts, store them in database
    if (mergeResult.hasConflicts) {
      console.log(`[MergeService] Merge has ${mergeResult.conflicts.length} conflicts`);

      const conflictRecords = mergeResult.conflicts.map(c => ({
        room_id: sourceBranch.room_id,
        source_branch_id: sourceBranchId,
        target_branch_id: targetBranchId,
        block_id: c.blockId,
        source_content: c.sourceContent,
        target_content: c.targetContent,
        base_content: c.baseContent,
        conflict_type: c.type,
        resolved: false,
      }));

      const { data: conflicts, error: conflictError } = await supabase
        .from('merge_conflicts')
        .insert(conflictRecords)
        .select();

      if (conflictError) {
        throw conflictError;
      }

      return {
        success: false,
        conflicts: conflicts || [],
        error: new Error('Merge has conflicts that must be resolved'),
      };
    }

    // No conflicts - auto-merge
    console.log('[MergeService] No conflicts, auto-merging');

    const mergedSnapshot = {
      blocks: mergeResult.merged,
      timestamp: new Date().toISOString(),
    };

    const { commitId } = await createCommit(
      sourceBranch.room_id,
      userId,
      mergedSnapshot,
      commitMessage || `Merge ${sourceBranch.branch_name} into ${targetBranch.branch_name}`,
      targetBranchId,
      sourceBranchId // Mark as merge commit
    );

    console.log(`[MergeService] Merge commit created: ${commitId}`);

    return { success: true, mergeCommitId: commitId, error: null };
  } catch (error: any) {
    console.error('[MergeService] Error merging branches:', error.message);
    return { success: false, error };
  }
}

/**
 * Get unresolved conflicts for a merge
 */
export async function getMergeConflicts(
  roomId: number,
  sourceBranchId?: string,
  targetBranchId?: string
): Promise<{ conflicts: MergeConflict[]; error: Error | null }> {
  try {
    let query = supabase
      .from('merge_conflicts')
      .select('*')
      .eq('room_id', roomId)
      .eq('resolved', false);

    if (sourceBranchId) {
      query = query.eq('source_branch_id', sourceBranchId);
    }

    if (targetBranchId) {
      query = query.eq('target_branch_id', targetBranchId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return { conflicts: data || [], error: null };
  } catch (error: any) {
    console.error('[MergeService] Error getting conflicts:', error.message);
    return { conflicts: [], error };
  }
}

/**
 * Resolve a merge conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolution: Block,
  userId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    console.log(`[MergeService] Resolving conflict ${conflictId}`);

    const { error } = await supabase
      .from('merge_conflicts')
      .update({
        resolved: true,
        resolution_content: resolution,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('conflict_id', conflictId);

    if (error) {
      throw error;
    }

    console.log(`[MergeService] Conflict resolved`);

    return { success: true, error: null };
  } catch (error: any) {
    console.error('[MergeService] Error resolving conflict:', error.message);
    return { success: false, error };
  }
}

/**
 * Apply all conflict resolutions and complete merge
 */
export async function applyMerge(
  roomId: number,
  sourceBranchId: string,
  targetBranchId: string,
  userId: string,
  commitMessage?: string
): Promise<{ success: boolean; mergeCommitId?: string; error: Error | null }> {
  try {
    // Get all conflicts for this merge
    const { conflicts } = await getMergeConflicts(roomId, sourceBranchId, targetBranchId);

    // Check if all conflicts are resolved
    const unresolvedConflicts = conflicts.filter(c => !c.resolved);
    if (unresolvedConflicts.length > 0) {
      throw new Error(`${unresolvedConflicts.length} conflicts still unresolved`);
    }

    // Get target branch's latest commit
    const { branch: targetBranch } = await getBranchById(targetBranchId);
    if (!targetBranch?.last_commit_id) {
      throw new Error('Target branch has no commits');
    }

    const { data: targetCommit } = await supabase
      .from('commits')
      .select('snapshot_json')
      .eq('commit_id', targetBranch.last_commit_id)
      .single();

    if (!targetCommit) {
      throw new Error('Could not load target commit');
    }

    let mergedBlocks = [...(targetCommit.snapshot_json.blocks || [])];

    // Apply all resolutions
    for (const conflict of conflicts) {
      const blockIndex = mergedBlocks.findIndex(b => b.id === conflict.block_id);
      if (blockIndex !== -1) {
        mergedBlocks[blockIndex] = conflict.resolution_content;
      } else {
        mergedBlocks.push(conflict.resolution_content);
      }
    }

    // Create merge commit
    const mergedSnapshot = {
      blocks: mergedBlocks,
      timestamp: new Date().toISOString(),
    };

    const { branch: sourceBranch } = await getBranchById(sourceBranchId);
    const { commitId } = await createCommit(
      roomId,
      userId,
      mergedSnapshot,
      commitMessage || `Merge ${sourceBranch?.branch_name} into ${targetBranch.branch_name}`,
      targetBranchId,
      sourceBranchId
    );

    // Delete resolved conflicts
    await supabase
      .from('merge_conflicts')
      .delete()
      .eq('room_id', roomId)
      .eq('source_branch_id', sourceBranchId)
      .eq('target_branch_id', targetBranchId);

    console.log(`[MergeService] Merge completed: ${commitId}`);

    return { success: true, mergeCommitId: commitId, error: null };
  } catch (error: any) {
    console.error('[MergeService] Error applying merge:', error.message);
    return { success: false, error };
  }
}

/**
 * Get merge preview (diff without actually merging)
 */
export async function getMergeDiff(
  sourceBranchId: string,
  targetBranchId: string
): Promise<{ diff: MergeResult | null; error: Error | null }> {
  try {
    const { branch: sourceBranch } = await getBranchById(sourceBranchId);
    const { branch: targetBranch } = await getBranchById(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      throw new Error('Branch not found');
    }

    const { data: sourceCommit } = await supabase
      .from('commits')
      .select('snapshot_json')
      .eq('commit_id', sourceBranch.last_commit_id)
      .single();

    const { data: targetCommit } = await supabase
      .from('commits')
      .select('snapshot_json')
      .eq('commit_id', targetBranch.last_commit_id)
      .single();

    if (!sourceCommit || !targetCommit) {
      throw new Error('Could not load commits');
    }

    const { commitId: baseCommitId } = await findCommonAncestor(sourceBranchId, targetBranchId);

    let baseBlocks: Block[] = [];
    if (baseCommitId) {
      const { data: baseCommit } = await supabase
        .from('commits')
        .select('snapshot_json')
        .eq('commit_id', baseCommitId)
        .single();

      baseBlocks = baseCommit?.snapshot_json?.blocks || [];
    }

    const sourceBlocks: Block[] = sourceCommit.snapshot_json.blocks || [];
    const targetBlocks: Block[] = targetCommit.snapshot_json.blocks || [];

    const diff = threeWayMerge(baseBlocks, sourceBlocks, targetBlocks);

    return { diff, error: null };
  } catch (error: any) {
    console.error('[MergeService] Error getting merge diff:', error.message);
    return { diff: null, error };
  }
}
