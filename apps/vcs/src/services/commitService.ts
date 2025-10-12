// src/version-control-service/services/commitService.ts
import { supabase } from "@packages/supabase";  // Assuming supabase instance is imported here
import simpleGit, { SimpleGit } from 'simple-git';

const git: SimpleGit = simpleGit();

// Service function to create a commit for a block
export const createCommit = async (roomId: string, blockId: string, commitMessage: string, userId: string) => {
  try {
    // Step 1: Check if the user is authorized (editor or owner)
    const { data: userRoles, error: roleError } = await supabase
      .from('Room_users')
      .select('type')
      .eq('room_id', roomId)
      .eq('uid', userId)
      .single();

    if (roleError) throw new Error(roleError.message);

    if (userRoles?.type !== "editor" && userRoles?.type !== "owner") {
      throw new Error("Only editors or owners can commit to blocks.");
    }

    // Step 2: Insert the commit metadata into the database
    const { data, error } = await supabase
      .from("commits")
      .insert([
        { room_id: roomId, block_id: blockId, commit_message: commitMessage, author_id: userId }
      ]);

    if (error) throw new Error(error.message);

    // Step 3: Commit the block's changes to the Git repository
    const filePath = `/room_files/${roomId}/${blockId}.py`;  // Path to the block file in Git
    await git.add(filePath);  // Add the file to the staging area
    await git.commit(commitMessage);  // Commit the changes

    return {
      message: "Commit created successfully",
      commit: data,
    };
  } catch (err: any) {
    console.error("Error creating commit:", err.message || err);
    throw new Error("Failed to create commit: " + err.message);
  }
};

// src/version-control-service/services/commitService.ts
export const deleteCommit = async (commitId: string, userId: string): Promise<void> => {
  try {
    // Step 1: Verify if the commit exists and the user has permission to delete it
    const { data: commit, error: commitError } = await supabase
      .from("commits")
      .select("commit_id, author_id, block_id")
      .eq("commit_id", commitId)
      .single();

    if (commitError || !commit) {
      throw new Error("Commit not found");
    }

    // Step 2: Ensure that only the commit author or owner can delete the commit
    if (commit.author_id !== userId) {
      throw new Error("Unauthorized: You do not have permission to delete this commit");
    }

    // Step 3: Delete the commit from the database
    const { error: deleteError } = await supabase
      .from("commits")
      .delete()
      .eq("commit_id", commitId);

    if (deleteError) throw new Error(deleteError.message);

    // Step 4: Remove the commit from the Git repository (optional)
    // Deleting a commit in Git can be tricky, we may need to perform a reset or rebase
    await git.revert(commitId); // This creates a new commit that undoes the previous commit
    await git.push("origin", "master"); // Push the changes to GitHub or Git server

    console.log(`Commit ${commitId} deleted successfully`);
  } catch (err: any) {
    console.error("Error deleting commit:", err.message || err);
    throw new Error("Failed to delete commit: " + err.message);
  }
};
