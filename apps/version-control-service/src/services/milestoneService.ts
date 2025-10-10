// src/version-control-service/services/milestoneService.ts
import { supabase } from "@packages/supabase";
import simpleGit, { SimpleGit } from "simple-git";

const git: SimpleGit = simpleGit();

// Service function to create a milestone
export const createMilestone = async (roomId: string, milestoneName: string, milestoneNotes: string, userId: string) => {
  try {
    // Step 1: Check if the user is the owner (Room validation)
    const { data: userRoles, error: roleError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", roomId)
      .eq("uid", userId)
      .single();

    if (roleError) throw new Error(roleError.message);

    if (userRoles?.type !== "owner") {
      throw new Error("Only owners can create milestones.");
    }

    // Step 2: Get the latest commit for each block in the room (milestone commits)
    const { data: commits, error: commitError } = await supabase
      .from("commits")
      .select("commit_id, block_id, commit_message, file_id")
      .eq("room_id", roomId)
      .eq("milestone", true)  // Only fetch commits where the milestone flag is true
      .order("created_at", { ascending: false });

    if (commitError) throw new Error(commitError.message);

    // Ensure that we have at least one commit with the milestone flag set to true
    if (!commits || commits.length === 0) {
      throw new Error("No commits marked as milestone found for this room.");
    }

    // Step 3: Create the milestone entry in Supabase (with commit snapshot)
    const commitSnapshot = commits.map(commit => ({
      block_id: commit.block_id,
      commit_id: commit.commit_id,
      commit_message: commit.commit_message,
      file_id: commit.file_id,
    }));

    const { data, error } = await supabase
      .from("milestones")
      .insert([
        {
          room_id: roomId,
          milestone_name: milestoneName,
          milestone_notes: milestoneNotes,
          created_by: userId,
          commit_snapshot: commitSnapshot,  // Store commit snapshot as JSON
        },
      ]);

    if (error) throw new Error(error.message);

    // Step 4: Create a Git tag for the milestone (representing a stable version)
    const milestoneTag = `v1.0-${milestoneName}`;
    await git.addAnnotatedTag(milestoneTag, `Milestone: ${milestoneName} - ${milestoneNotes}`);

    // Step 5: Return milestone and tag information
    return {
      message: "Milestone created successfully",
      milestone: data,
      tag: milestoneTag,
    };
  } catch (err: any) {
    console.error("Error creating milestone:", err.message || err);
    throw new Error("Failed to create milestone: " + err.message);
  }
};
// Service function to get milestones for a room
export const getMilestones = async (roomId: string) => {
  try {
    // Fetch milestones for the given room
    const { data: milestones, error } = await supabase
      .from("milestones")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return {
      message: "Milestones fetched successfully",
      milestones,
    };
  } catch (err: any) {
    console.error("Error fetching milestones:", err.message || err);
    throw new Error("Failed to fetch milestones: " + err.message);
  }
};

// Service function to delete a milestone
export const deleteMilestone = async (milestoneId: string, userId: string) => {
  try {
    // Fetch the milestone to ensure it exists and check ownership
    const { data: milestone, error: fetchError } = await supabase
      .from("milestones")
      .select("created_by")
      .eq("id", milestoneId)
      .single();

    if (fetchError) throw new Error(fetchError.message);

    if (!milestone) {
      throw new Error("Milestone not found.");
    }

    if (milestone.created_by !== userId) {
      throw new Error("Only the creator can delete this milestone.");
    }

    // Delete the milestone
    const { error: deleteError } = await supabase
      .from("milestones")
      .delete()
      .eq("id", milestoneId);

    if (deleteError) throw new Error(deleteError.message);

    return {
      message: "Milestone deleted successfully",
    };
  } catch (err: any) {
    console.error("Error deleting milestone:", err.message || err);
    throw new Error("Failed to delete milestone: " + err.message);
  }
};