/**
 * Branch Service
 * Handles branch creation, checkout, and management
 */

import { supabase } from '@packages/supabase';

export interface Branch {
  branch_id: string;
  room_id: number;
  branch_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  parent_branch_id: string | null;
  is_main: boolean;
  last_commit_id: string | null;
  description: string | null;
}

export interface BranchCheckout {
  checkout_id: string;
  room_id: number;
  user_id: string;
  branch_id: string;
  checked_out_at: string;
}

/**
 * Create a new branch from a parent branch
 * Optionally creates an initial commit with provided snapshot
 */
export async function createBranch(
  roomId: number,
  branchName: string,
  userId: string,
  description?: string,
  parentBranchId?: string,
  initialSnapshot?: any
): Promise<{ branch: Branch; initialCommitId?: string; error: Error | null }> {
  try {
    console.log(`[BranchService] Creating branch "${branchName}" in room ${roomId}`);

    // If no parent specified, use main branch
    let effectiveParentId = parentBranchId;
    if (!effectiveParentId) {
      const { data: mainBranch } = await supabase
        .from('branches')
        .select('branch_id')
        .eq('room_id', roomId)
        .eq('is_main', true)
        .single();

      if (!mainBranch) {
        throw new Error('Main branch not found. Please run migrations first.');
      }
      effectiveParentId = mainBranch.branch_id;
    }

    // Check if branch name already exists
    const { data: existing } = await supabase
      .from('branches')
      .select('branch_id')
      .eq('room_id', roomId)
      .eq('branch_name', branchName)
      .single();

    if (existing) {
      throw new Error(`Branch "${branchName}" already exists`);
    }

    // Get the last commit from parent branch to use as starting point
    const { data: parentBranch } = await supabase
      .from('branches')
      .select('last_commit_id')
      .eq('branch_id', effectiveParentId)
      .single();

    // Create the new branch
    const { data: newBranch, error: insertError } = await supabase
      .from('branches')
      .insert({
        room_id: roomId,
        branch_name: branchName,
        created_by: userId,
        parent_branch_id: effectiveParentId,
        is_main: false,
        last_commit_id: parentBranch?.last_commit_id || null,
        description: description || null,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log(`[BranchService] Branch created: ${newBranch.branch_id}`);

    // Create initial commit if snapshot provided
    let initialCommitId: string | undefined;
    if (initialSnapshot && initialSnapshot.blocks && initialSnapshot.blocks.length > 0) {
      console.log(`[BranchService] Creating initial commit with ${initialSnapshot.blocks.length} blocks...`);
      
      const { createCommit } = await import('./commitService');
      const { commitId, error: commitError } = await createCommit(
        roomId,
        userId,
        initialSnapshot,
        `Initial commit for branch: ${branchName}`,
        newBranch.branch_id
      );

      if (!commitError && commitId) {
        initialCommitId = commitId;
        
        // Update branch's last_commit_id
        await supabase
          .from('branches')
          .update({ last_commit_id: commitId })
          .eq('branch_id', newBranch.branch_id);

        console.log(`[BranchService] ✅ Created initial commit: ${commitId}`);
      } else if (commitError) {
        console.warn(`[BranchService] ⚠️ Failed to create initial commit: ${commitError.message}`);
      }
    }

    return { branch: newBranch, initialCommitId, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error creating branch:', error.message);
    return { branch: null as any, error };
  }
}

/**
 * Get all branches for a room
 */
export async function getBranches(
  roomId: number
): Promise<{ branches: Branch[]; error: Error | null }> {
  try {
    // Note: We don't join with auth.users or commits here to avoid relationship errors
    // The frontend doesn't need that extra data for the branch list
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return { branches: data || [], error: null };
  } catch (error: any) {
    console.error('[BranchService] Error getting branches:', error.message);
    return { branches: [], error };
  }
}

/**
 * Get current branch for a user
 */
export async function getCurrentBranch(
  roomId: number,
  userId: string
): Promise<{ branch: Branch | null; error: Error | null }> {
  try {
    // Get user's current checkout
    const { data: checkout } = await supabase
      .from('branch_checkouts')
      .select('branch_id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (!checkout) {
      // No checkout record, default to main branch
      const { data: mainBranch } = await supabase
        .from('branches')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_main', true)
        .single();

      return { branch: mainBranch, error: null };
    }

    // Get the branch details
    const { data: branch, error } = await supabase
      .from('branches')
      .select('*')
      .eq('branch_id', checkout.branch_id)
      .single();

    if (error) {
      throw error;
    }

    return { branch, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error getting current branch:', error.message);
    return { branch: null, error };
  }
}

/**
 * Checkout (switch to) a branch
 * AUTO-COMMITS current work before switching to preserve state
 */
export async function checkoutBranch(
  roomId: number,
  branchId: string,
  userId: string,
  currentSnapshot?: any
): Promise<{ success: boolean; branch: Branch | null; snapshot: any; autoCommitId?: string; error: Error | null }> {
  try {
    console.log(`[BranchService] User ${userId} checking out branch ${branchId}`);

    // STEP 1: Auto-commit current work on the current branch (if snapshot provided)
    let autoCommitId: string | undefined;
    if (currentSnapshot && currentSnapshot.blocks && currentSnapshot.blocks.length > 0) {
      console.log(`[BranchService] Auto-committing ${currentSnapshot.blocks.length} blocks before switch...`);
      
      // Get current branch
      const { data: currentCheckout } = await supabase
        .from('branch_checkouts')
        .select('branch_id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single();

      if (currentCheckout) {
        // Import commitService dynamically to avoid circular dependency
        const { createCommit } = await import('./commitService');
        
        const { commitId, error: commitError } = await createCommit(
          roomId,
          userId,
          currentSnapshot,
          `Auto-save before switching branches`,
          currentCheckout.branch_id
        );

        if (!commitError && commitId) {
          autoCommitId = commitId;
          
          // Update the branch's last_commit_id
          await supabase
            .from('branches')
            .update({ last_commit_id: commitId })
            .eq('branch_id', currentCheckout.branch_id);

          console.log(`[BranchService] ✅ Auto-committed current work: ${commitId}`);
        } else if (commitError) {
          console.warn(`[BranchService] ⚠️ Auto-commit failed: ${commitError.message}`);
          // Don't fail the checkout, just warn
        }
      }
    }

    // STEP 2: Verify target branch exists and belongs to this room
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('branch_id', branchId)
      .eq('room_id', roomId)
      .single();

    if (branchError || !branch) {
      throw new Error('Branch not found');
    }

    // STEP 3: Update or create checkout record
    const { error: upsertError } = await supabase
      .from('branch_checkouts')
      .upsert(
        {
          room_id: roomId,
          user_id: userId,
          branch_id: branchId,
          checked_out_at: new Date().toISOString(),
        },
        {
          onConflict: 'room_id,user_id',
        }
      );

    if (upsertError) {
      throw upsertError;
    }

    // STEP 4: Get the latest commit snapshot from target branch
    let snapshot = { blocks: [] };
    if (branch.last_commit_id) {
      const { data: commit } = await supabase
        .from('commits')
        .select('snapshot_json')
        .eq('commit_id', branch.last_commit_id)
        .single();

      if (commit?.snapshot_json) {
        snapshot = commit.snapshot_json;
      }
    }

    console.log(`[BranchService] ✅ Checkout successful, snapshot has ${snapshot.blocks?.length || 0} blocks`);

    return { success: true, branch, snapshot, autoCommitId, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error checking out branch:', error.message);
    return { success: false, branch: null, snapshot: null, error };
  }
}

/**
 * Delete a branch (only if not main and user has permission)
 */
export async function deleteBranch(
  branchId: string,
  userId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Get branch details
    const { data: branch } = await supabase
      .from('branches')
      .select('*, room:room_id(room_id)')
      .eq('branch_id', branchId)
      .single();

    if (!branch) {
      throw new Error('Branch not found');
    }

    if (branch.is_main) {
      throw new Error('Cannot delete main branch');
    }

    // Check if user is owner/admin of the room
    const { data: roomUser } = await supabase
      .from('Room_users')
      .select('type')
      .eq('room_id', branch.room_id)
      .eq('user_id', userId)
      .single();

    const { data: allowedEmail } = await supabase
      .from('Allowed_emails')
      .select('access_level')
      .eq('room_id', branch.room_id)
      .eq('user_id', userId)
      .single();

    const isOwnerOrAdmin =
      roomUser?.type === 'owner' ||
      roomUser?.type === 'admin' ||
      allowedEmail?.access_level === 'owner' ||
      allowedEmail?.access_level === 'admin';

    if (!isOwnerOrAdmin) {
      throw new Error('Only room owners/admins can delete branches');
    }

    // Check if anyone is currently on this branch
    const { data: checkouts } = await supabase
      .from('branch_checkouts')
      .select('user_id')
      .eq('branch_id', branchId);

    if (checkouts && checkouts.length > 0) {
      throw new Error('Cannot delete branch: users are currently checked out to it');
    }

    // Delete the branch
    const { error: deleteError } = await supabase
      .from('branches')
      .delete()
      .eq('branch_id', branchId);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`[BranchService] Branch ${branchId} deleted successfully`);

    return { success: true, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error deleting branch:', error.message);
    return { success: false, error };
  }
}

/**
 * Get branch by ID
 */
export async function getBranchById(
  branchId: string
): Promise<{ branch: Branch | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('branch_id', branchId)
      .single();

    if (error) {
      throw error;
    }

    return { branch: data, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error getting branch:', error.message);
    return { branch: null, error };
  }
}

/**
 * Get main branch for a room
 */
export async function getMainBranch(
  roomId: number
): Promise<{ branch: Branch | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_main', true)
      .single();

    if (error) {
      throw error;
    }

    return { branch: data, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error getting main branch:', error.message);
    return { branch: null, error };
  }
}

/**
 * Initialize main branch for a new room
 * This should be called when a room is created
 */
export async function initializeMainBranch(
  roomId: number,
  userId: string
): Promise<{ branch: Branch | null; error: Error | null }> {
  try {
    console.log(`[BranchService] Initializing main branch for room ${roomId}`);

    // Check if main branch already exists
    const { branch: existing } = await getMainBranch(roomId);
    if (existing) {
      console.log(`[BranchService] Main branch already exists for room ${roomId}`);
      return { branch: existing, error: null };
    }

    // Create main branch WITHOUT a commit (let the room's initial commit handle it)
    const { data: mainBranch, error: insertError } = await supabase
      .from('branches')
      .insert({
        room_id: roomId,
        branch_name: 'main',
        created_by: userId,
        parent_branch_id: null,
        is_main: true,
        last_commit_id: null, // Will be updated when first commit is made
        description: 'Main branch',
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Set the creator as checked out to main branch
    await supabase
      .from('branch_checkouts')
      .upsert(
        {
          room_id: roomId,
          user_id: userId,
          branch_id: mainBranch.branch_id,
          checked_out_at: new Date().toISOString(),
        },
        {
          onConflict: 'room_id,user_id',
        }
      );

    console.log(`[BranchService] Main branch created successfully: ${mainBranch.branch_id}`);
    console.log(`[BranchService] NOTE: First commit will be linked to this branch automatically`);

    return { branch: mainBranch, error: null };
  } catch (error: any) {
    console.error('[BranchService] Error initializing main branch:', error.message);
    return { branch: null, error };
  }
}

/**
 * Pull changes from main branch into current branch
 * This is a convenience wrapper around mergeBranches that:
 * 1. Gets the main branch for the room
 * 2. Merges main into the specified target branch
 */
export async function pullFromMain(
  roomId: number,
  targetBranchId: string,
  userId: string,
  commitMessage?: string
): Promise<{
  success: boolean;
  mergeCommitId?: string;
  conflicts?: any[];
  error: Error | null;
}> {
  try {
    console.log(`[BranchService] Pulling from main into branch ${targetBranchId}`);

    // Get the main branch
    const { branch: mainBranch, error: mainError } = await getMainBranch(roomId);
    if (mainError || !mainBranch) {
      throw new Error('Could not find main branch');
    }

    // Don't allow pulling into main from main
    if (mainBranch.branch_id === targetBranchId) {
      throw new Error('Cannot pull from main into main');
    }

    // Verify target branch exists and is in the same room
    const { branch: targetBranch, error: targetError } = await getBranchById(targetBranchId);
    if (targetError || !targetBranch) {
      throw new Error('Target branch not found');
    }

    if (targetBranch.room_id !== roomId) {
      throw new Error('Target branch is not in the specified room');
    }

    // Import mergeBranches to avoid issues
    const { mergeBranches } = await import('./mergeService');

    // Merge main into target
    const result = await mergeBranches(
      mainBranch.branch_id,
      targetBranchId,
      userId,
      commitMessage || `Pull changes from main into ${targetBranch.branch_name}`
    );

    if (result.success) {
      console.log(`[BranchService] ✅ Successfully pulled from main into ${targetBranch.branch_name}`);
    } else if (result.conflicts) {
      console.log(`[BranchService] ⚠️ Pull has ${result.conflicts.length} conflicts`);
    }

    return result;
  } catch (error: any) {
    console.error('[BranchService] Error pulling from main:', error.message);
    return { success: false, error };
  }
}

/**
 * Push changes from current branch to main branch
 * This is a convenience wrapper around mergeBranches that:
 * 1. Gets the main branch for the room
 * 2. Merges the source branch into main
 * 3. Includes permission checks (only owners/admins can merge to main)
 */
export async function pushToMain(
  roomId: number,
  sourceBranchId: string,
  userId: string,
  userEmail?: string,
  commitMessage?: string
): Promise<{
  success: boolean;
  mergeCommitId?: string;
  conflicts?: any[];
  error: Error | null;
}> {
  try {
    console.log(`[BranchService] Pushing branch ${sourceBranchId} to main`);

    // PERMISSION CHECK: Only owners/admins can push to main
    let hasPermission = false;

    // Check Allowed_emails
    if (userEmail) {
      const { data: accessData, error: accessErr } = await supabase
        .from('Allowed_emails')
        .select('access_level')
        .eq('room_id', roomId)
        .eq('email', userEmail)
        .single();

      if (accessData && (accessData.access_level === 'owner' || accessData.access_level === 'admin')) {
        hasPermission = true;
      }
    }

    // Check Room_users if not already permitted
    if (!hasPermission) {
      const { data: userRoles } = await supabase
        .from('Room_users')
        .select('type')
        .eq('room_id', roomId)
        .eq('uid', userId)
        .single();

      if (userRoles && (userRoles.type === 'owner' || userRoles.type === 'admin')) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new Error('Only owners and admins can push to the main branch');
    }

    // Get the main branch
    const { branch: mainBranch, error: mainError } = await getMainBranch(roomId);
    if (mainError || !mainBranch) {
      throw new Error('Could not find main branch');
    }

    // Don't allow pushing main to main
    if (mainBranch.branch_id === sourceBranchId) {
      throw new Error('Cannot push main to main');
    }

    // Verify source branch exists and is in the same room
    const { branch: sourceBranch, error: sourceError } = await getBranchById(sourceBranchId);
    if (sourceError || !sourceBranch) {
      throw new Error('Source branch not found');
    }

    if (sourceBranch.room_id !== roomId) {
      throw new Error('Source branch is not in the specified room');
    }

    // Import mergeBranches
    const { mergeBranches } = await import('./mergeService');

    // Merge source into main
    const result = await mergeBranches(
      sourceBranchId,
      mainBranch.branch_id,
      userId,
      commitMessage || `Merge ${sourceBranch.branch_name} into main`
    );

    if (result.success) {
      console.log(`[BranchService] ✅ Successfully pushed ${sourceBranch.branch_name} to main`);
    } else if (result.conflicts) {
      console.log(`[BranchService] ⚠️ Push has ${result.conflicts.length} conflicts`);
    }

    return result;
  } catch (error: any) {
    console.error('[BranchService] Error pushing to main:', error.message);
    return { success: false, error };
  }
}
