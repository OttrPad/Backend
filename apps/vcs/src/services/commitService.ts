// src/version-control-service/services/commitService.ts
import { supabase } from "@packages/supabase";
import { getGitRepo, writeSnapshotToRepo } from "../lib/git";
import { log } from "@ottrpad/logger";

// Block separator for notebook storage
const BLOCK_SEPARATOR = "\n\n# ==== OTTRPAD_BLOCK_SEPARATOR ==== #\n\n";

/**
 * Convert blocks array to a single string with separators
 */
function serializeBlocks(blocks: any[]): string {
  return blocks
    .map((block) => {
      const meta = `# BLOCK_META: ${JSON.stringify({
        id: block.id,
        lang: block.lang,
        position: block.position,
      })}\n`;
      return meta + block.content;
    })
    .join(BLOCK_SEPARATOR);
}

/**
 * Convert serialized string back to blocks array
 */
function deserializeBlocks(content: string): any[] {
  if (!content || content.trim() === "") return [];

  const blockStrings = content.split(BLOCK_SEPARATOR);
  return blockStrings
    .map((blockStr, index) => {
      const lines = blockStr.split("\n");
      const metaLine = lines.find((line) => line.startsWith("# BLOCK_META:"));

      let meta = { id: `block-${index}`, lang: "python", position: index };
      let content = blockStr;

      if (metaLine) {
        try {
          meta = JSON.parse(metaLine.replace("# BLOCK_META:", "").trim());
          // Remove meta line from content
          content = lines
            .filter((line) => !line.startsWith("# BLOCK_META:"))
            .join("\n");
        } catch (e) {
          log.warn("vcs.deserialize.meta_parse_error", { error: e });
        }
      }

      return {
        ...meta,
        content: content.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    })
    .filter((block) => block.content.length > 0);
}

/**
 * Create a commit (generic, for branch system)
 */
export async function createCommit(
  roomId: number,
  userId: string,
  snapshot: any,
  message: string,
  branchId?: string,
  mergedFromBranchId?: string
): Promise<{ commitId: string; error: Error | null }> {
  try {
    // Get current branch if not specified
    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const { data: checkout } = await supabase
        .from("branch_checkouts")
        .select("branch_id")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .single();

      if (checkout) {
        effectiveBranchId = checkout.branch_id;
      } else {
        // Default to main branch
        const { data: mainBranch } = await supabase
          .from("branches")
          .select("branch_id")
          .eq("room_id", roomId)
          .eq("is_main", true)
          .single();

        effectiveBranchId = mainBranch?.branch_id;
      }
    }

    if (!effectiveBranchId) {
      throw new Error(
        "No branch specified and could not determine current branch"
      );
    }

    // Get parent commit (last commit on this branch)
    const { data: branch } = await supabase
      .from("branches")
      .select("last_commit_id")
      .eq("branch_id", effectiveBranchId)
      .single();

    const parentCommitId = branch?.last_commit_id || null;

    // Serialize blocks for Git storage
    const serializedContent = serializeBlocks(snapshot.blocks || []);

    // Write to Git repository
    const { git, repoDir } = await getGitRepo();
    const filePath = await writeSnapshotToRepo(
      repoDir,
      roomId.toString(),
      "notebook", // Generic notebook ID for branch system
      { ...snapshot, serialized: serializedContent }
    );

    // Stage and commit
    await git.add(filePath);
    const gitCommit = await git.commit(message);

    log.info("vcs.commit.git_committed", {
      roomId,
      branchId: effectiveBranchId,
      sha: gitCommit.commit,
    });

    // Store commit metadata in database
    const { data: commit, error } = await supabase
      .from("commits")
      .insert([
        {
          room_id: roomId,
          notebook_id: "notebook",
          author_id: userId,
          commit_message: message,
          snapshot_json: snapshot,
          commit_type: "normal",
          hidden: false,
          git_commit_hash: gitCommit.commit || null,
          branch_id: effectiveBranchId,
          parent_commit_id: parentCommitId,
          is_merge_commit: !!mergedFromBranchId,
          merged_from_branch_id: mergedFromBranchId || null,
        },
      ])
      .select()
      .single();

    if (error) {
      log.error("vcs.commit.db_insert_failed", { error: error.message });
      throw new Error(error.message || "Database insert failed");
    }

    // Update branch's last_commit_id
    await supabase
      .from("branches")
      .update({ last_commit_id: commit.commit_id })
      .eq("branch_id", effectiveBranchId);

    log.info("vcs.commit.created", {
      commitId: commit.commit_id,
      roomId,
      branchId: effectiveBranchId,
    });

    return { commitId: commit.commit_id, error: null };
  } catch (err: any) {
    log.error("vcs.commit.create_failed", { error: err.message });
    return { commitId: "", error: err };
  }
}

/**
 * Create a commit for a notebook (legacy, for backward compatibility)
 */
export const createNotebookCommit = async (params: {
  roomId: string;
  notebookId: string;
  message: string;
  userId: string;
  snapshot?: any;
  isTemp?: boolean;
}) => {
  const {
    roomId,
    notebookId,
    message,
    userId,
    snapshot,
    isTemp = false,
  } = params;

  try {
    // Resolve room_code to room_id if needed
    let actualRoomId: string | number = roomId;

    if (
      isNaN(Number(roomId)) &&
      typeof roomId === "string" &&
      roomId.includes("-")
    ) {
      log.info("vcs.commit.resolving_room_code", { roomCode: roomId });
      const { data: roomData, error: roomError } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomId)
        .single();

      if (roomError || !roomData) {
        throw new Error(`Room not found for code: ${roomId}`);
      }

      actualRoomId = roomData.room_id;
      log.info("vcs.commit.resolved_room_id", {
        roomCode: roomId,
        roomId: actualRoomId,
      });
    }

    // If no snapshot provided, fetch current state from collab service
    let finalSnapshot = snapshot;
    if (!finalSnapshot) {
      const collabUrl =
        process.env.COLLABORATION_SERVICE_URL || "http://localhost:5002";
      const response = await fetch(
        `${collabUrl}/api/collaboration/notebook/${notebookId}/snapshot`,
        {
          headers: {
            "x-gateway-user-id": userId,
          },
        }
      );
      if (response.ok) {
        finalSnapshot = await response.json();
      } else {
        throw new Error("Failed to fetch current notebook state");
      }
    }

    // Serialize blocks for Git storage
    const serializedContent = serializeBlocks(finalSnapshot.blocks || []);

    // Write to Git repository
    const { git, repoDir } = await getGitRepo();
    const filePath = await writeSnapshotToRepo(repoDir, roomId, notebookId, {
      ...finalSnapshot,
      serialized: serializedContent,
    });

    // Stage and commit
    await git.add(filePath);
    const commitMsg = isTemp
      ? `[temp] ${message}`
      : message || `Commit for notebook ${notebookId}`;
    const gitCommit = await git.commit(commitMsg);

    log.info("vcs.commit.git_committed", {
      roomId,
      notebookId,
      sha: gitCommit.commit,
    });

    // Store commit metadata in database
    const { data: commit, error } = await supabase
      .from("commits")
      .insert([
        {
          room_id: actualRoomId,
          notebook_id: notebookId,
          author_id: userId,
          commit_message: commitMsg,
          snapshot_json: finalSnapshot,
          commit_type: isTemp ? "temp" : "normal",
          hidden: isTemp,
          git_commit_hash: gitCommit.commit || null, // Add git SHA from simple-git commit
        },
      ])
      .select()
      .single();

    if (error) {
      log.error("vcs.commit.db_insert_failed", {
        error: error.message || String(error),
        code: error.code,
        details: error.details,
        hint: error.hint,
        actualRoomId,
        userId,
        fullError: JSON.stringify(error),
      });
      throw new Error(
        error.message || `Database insert failed: ${JSON.stringify(error)}`
      );
    }

    log.info("vcs.commit.created", {
      commitId: commit.commit_id,
      roomId,
      notebookId,
      isTemp,
    });

    return {
      message: "Commit created successfully",
      commit,
      gitSha: gitCommit.commit,
    };
  } catch (err: any) {
    log.error("vcs.commit.create_failed", { error: err });
    throw new Error("Failed to create commit: " + err.message);
  }
};

/**
 * Delete a commit
 */
export const deleteCommit = async (commitId: string, userId: string) => {
  try {
    // Fetch the commit to verify ownership
    const { data: commit, error: fetchError } = await supabase
      .from("commits")
      .select("author_id, room_id, hidden")
      .eq("commit_id", commitId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!commit) throw new Error("Commit not found");

    // Check if user is authorized (author or internal service for temp commits)
    const isInternal =
      process.env.VERSION_CONTROL_INTERNAL_SECRET &&
      userId === "internal-service";
    if (commit.author_id !== userId && !isInternal && !commit.hidden) {
      // For non-hidden commits, check if user is room owner
      const { data: roomUser, error: roomError } = await supabase
        .from("Room_users")
        .select("type")
        .eq("room_id", commit.room_id)
        .eq("uid", userId)
        .single();

      if (roomError || roomUser?.type !== "owner") {
        throw new Error("Not authorized to delete this commit");
      }
    }

    // Delete the commit
    const { error: deleteError } = await supabase
      .from("commits")
      .delete()
      .eq("commit_id", commitId);

    if (deleteError) throw new Error(deleteError.message);

    log.info("vcs.commit.deleted", { commitId, userId });
  } catch (err: any) {
    log.error("vcs.commit.delete_failed", { error: err });
    throw new Error("Failed to delete commit: " + err.message);
  }
};

/**
 * Get commit snapshot
 */
export const getCommitSnapshot = async (commitId: string) => {
  try {
    const { data: commit, error } = await supabase
      .from("commits")
      .select("snapshot_json")
      .eq("commit_id", commitId)
      .single();

    if (error) throw new Error(error.message);
    if (!commit) throw new Error("Commit not found");

    return commit.snapshot_json;
  } catch (err: any) {
    log.error("vcs.commit.snapshot_fetch_failed", { error: err });
    throw new Error("Failed to fetch commit snapshot: " + err.message);
  }
};

/**
 * Restore a commit (apply it to the current notebook state)
 */
export const restoreCommit = async (params: {
  roomId: string;
  commitId: string;
  userId: string;
}) => {
  const { roomId, commitId, userId } = params;

  try {
    // Fetch the commit snapshot
    const snapshot = await getCommitSnapshot(commitId);

    if (!snapshot || !snapshot.blocks) {
      throw new Error("Invalid commit snapshot");
    }

    log.info("vcs.commit.restored", {
      roomId,
      commitId,
      userId,
      blockCount: snapshot.blocks.length,
    });

    // Return the snapshot directly - frontend will handle updating blocks
    return {
      message: "Commit restored successfully",
      snapshot,
    };
  } catch (err: any) {
    log.error("vcs.commit.restore_failed", { error: err, roomId, commitId });
    throw new Error("Failed to restore commit: " + err.message);
  }
};

/**
 * Revert the latest commit in a room
 * Only the most recent commit can be reverted
 * Marks the commit as hidden so it won't appear in the timeline
 */
export const revertLatestCommit = async (roomId: string, userId: string) => {
  try {
    // Step 1: Resolve room_code to room_id if needed
    let actualRoomId: string | number = roomId;

    if (
      isNaN(Number(roomId)) &&
      typeof roomId === "string" &&
      roomId.includes("-")
    ) {
      log.info("vcs.commit.revert.resolving_room_code", { roomCode: roomId });
      const { data: roomData, error: roomError } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomId)
        .single();

      if (roomError || !roomData) {
        throw new Error("Room not found");
      }

      actualRoomId = roomData.room_id;
      log.info("vcs.commit.revert.resolved_room", {
        roomCode: roomId,
        roomId: actualRoomId,
      });
    }

    // Step 2: Get the latest commit for the room (excluding hidden commits)
    const { data: latestCommit, error: fetchError } = await supabase
      .from("commits")
      .select("commit_id, author_id, commit_message, created_at")
      .eq("room_id", actualRoomId)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!latestCommit) throw new Error("No commits to revert");

    // Step 3: Check if user is authorized (author or room owner/admin)
    const { data: roomUser, error: roomError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", actualRoomId)
      .eq("uid", userId)
      .single();

    if (roomError) throw new Error("User not found in room");

    // Only room admin (creator) can revert commits
    const isAdmin = roomUser?.type === "admin";

    if (!isAdmin) {
      throw new Error("Only the room creator (admin) can revert commits.");
    }

    // Step 4: Mark the commit as hidden (soft delete)
    const { error: updateError } = await supabase
      .from("commits")
      .update({ hidden: true })
      .eq("commit_id", latestCommit.commit_id);

    if (updateError) throw new Error(updateError.message);

    log.info("vcs.commit.reverted", {
      commitId: latestCommit.commit_id,
      roomId: actualRoomId,
      userId,
      message: latestCommit.commit_message,
    });

    return {
      message: "Commit reverted successfully",
      revertedCommit: {
        id: latestCommit.commit_id,
        message: latestCommit.commit_message,
        created_at: latestCommit.created_at,
      },
    };
  } catch (err: any) {
    log.error("vcs.commit.revert_failed", { error: err, roomId, userId });
    throw new Error("Failed to revert commit: " + err.message);
  }
};

/**
 * Get commits for a room (with pagination)
 */
export const getCommitsForRoom = async (
  roomId: string,
  options?: {
    limit?: number;
    offset?: number;
    includeHidden?: boolean;
  }
) => {
  try {
    const { limit = 50, offset = 0, includeHidden = false } = options || {};

    let query = supabase
      .from("commits")
      .select("*, author:author_id(email)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeHidden) {
      query = query.eq("hidden", false);
    }

    const { data: commits, error } = await query;

    if (error) throw new Error(error.message);

    return {
      commits: commits || [],
      total: commits?.length || 0,
    };
  } catch (err: any) {
    log.error("vcs.commits.fetch_failed", { error: err });
    throw new Error("Failed to fetch commits: " + err.message);
  }
};
