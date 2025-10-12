import { supabase } from "@packages/supabase"; // Supabase client
import { getGitRepo, writeSnapshotToRepo } from "../lib/git";
import { log } from "@ottrpad/logger";

// Notebook-wide commit payload type
interface NotebookSnapshot {
  cells: Array<{
    cell_type: string;
    metadata: { id?: string; language?: string; [k: string]: any };
    source: string[];
    outputs?: any[];
  }>;
  metadata?: Record<string, any>;
}

// Create a notebook-wide commit: fetch current snapshot from Collaboration service (assumed to be provided by client for now)
export const createNotebookCommit = async (args: {
  roomId: string;
  notebookId: string;
  message: string;
  userId: string;
  snapshot?: NotebookSnapshot; // optional if collab integration pulls it server-side later
  isTemp?: boolean; // hidden auto-stash commit
}) => {
  const { roomId, notebookId, message, userId, snapshot, isTemp } = args;
  try {
    // Authorize
    const { data: role, error: roleError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", roomId)
      .eq("uid", userId)
      .single();
    if (roleError) throw new Error(roleError.message);
    if (role?.type !== "editor" && role?.type !== "owner") {
      throw new Error("Only editors or owners can create commits");
    }

    // Store commit metadata and snapshot (JSON)
    const { data, error } = await supabase
      .from("Commits")
      .insert([
        {
          room_id: roomId,
          notebook_id: notebookId,
          commit_message: message,
          author_id: userId,
          snapshot_json: snapshot || null, // columns must exist in DB
          commit_type: isTemp ? "temp" : null,
          hidden: isTemp ? true : false,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Optional Git mirror inside VCS microservice
    try {
      if (snapshot) {
        const { git, repoDir } = await getGitRepo();
        const file = await writeSnapshotToRepo(
          repoDir,
          roomId,
          notebookId,
          snapshot
        );
        await git.add([file]);
        await git.commit(message || `commit ${data.commit_id}`);
      }
    } catch (e) {
      log.warn("vcs.git.mirror_skipped", { error: (e as any)?.message || e });
    }

    return { message: "Commit created", commit: data };
  } catch (err: any) {
    log.error("vcs.commit.create_failed", { error: err });
    throw new Error("Failed to create commit: " + err.message);
  }
};

export const getCommitSnapshot = async (
  commitId: string
): Promise<NotebookSnapshot> => {
  const { data, error } = await supabase
    .from("Commits")
    .select("snapshot_json")
    .eq("commit_id", commitId)
    .single();
  if (error) throw new Error(error.message);
  if (!data || !data.snapshot_json) throw new Error("Snapshot not found");
  return data.snapshot_json as NotebookSnapshot;
};

export const restoreCommit = async (args: {
  roomId: string;
  commitId: string;
  userId: string;
}) => {
  const { roomId, commitId, userId } = args;
  // Authorization: owner/editor
  const { data: role, error: roleError } = await supabase
    .from("Room_users")
    .select("type")
    .eq("room_id", roomId)
    .eq("uid", userId)
    .single();
  if (roleError) throw new Error(roleError.message);
  if (role?.type !== "editor" && role?.type !== "owner") {
    throw new Error("Only editors or owners can restore commits");
  }

  // For now, just return snapshot; actual write to collab can be performed by client
  const snapshot = await getCommitSnapshot(commitId);
  return { message: "Restore snapshot fetched", snapshot };
};

export const deleteCommit = async (
  commitId: string,
  userId: string
): Promise<void> => {
  try {
    // Step 1: Verify if the commit exists and the user has permission to delete it
    const { data: commit, error: commitError } = await supabase
      .from("commits")
      .select("commit_id, author_id")
      .eq("commit_id", commitId)
      .single();

    if (commitError || !commit) {
      throw new Error("Commit not found");
    }

    // Step 2: Ensure that only the commit author or owner can delete the commit
    if (commit.author_id !== userId) {
      throw new Error(
        "Unauthorized: You do not have permission to delete this commit"
      );
    }

    // Step 3: Delete the commit from the database
    const { error: deleteError } = await supabase
      .from("Commits")
      .delete()
      .eq("commit_id", commitId);

    if (deleteError) throw new Error(deleteError.message);

    // Step 4: Optionally revert in Git mirror (best-effort)
    try {
      const { git } = await getGitRepo();
      await git.revert(commitId as any);
    } catch (e) {
      console.warn("git revert skipped:", (e as any)?.message || e);
    }

    console.log(`Commit ${commitId} deleted successfully`);
  } catch (err: any) {
    log.error("vcs.commit.delete_failed", { error: err });
    throw new Error("Failed to delete commit: " + err.message);
  }
};
