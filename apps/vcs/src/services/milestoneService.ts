// src/version-control-service/services/milestoneService.ts
import { supabase } from "@packages/supabase";
import { getGitRepo } from "../lib/git";
import { log } from "@ottrpad/logger";

// Service function to create a milestone
export const createMilestone = async (
  roomId: string,
  milestoneName: string,
  milestoneNotes: string,
  userId: string,
  commitId?: string,
  userEmail?: string
) => {
  try {
    // Step 1: Check if the user is the owner
    // Prefer Allowed_emails (aligns with role middleware); fallback to Room_users
    if (userEmail) {
      const { data: access, error: accessErr } = await supabase
        .from("Allowed_emails")
        .select("access_level")
        .eq("room_id", roomId)
        .eq("email", userEmail)
        .single();
      if (accessErr) throw new Error(accessErr.message);
      if (access?.access_level !== "owner") {
        throw new Error("Only owners can create milestones.");
      }
    } else {
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
    }

    // Resolve the target commit: if provided use it; else use latest commit in room
    let targetCommitId = commitId;
    if (!targetCommitId) {
      const { data: latest, error: latestErr } = await supabase
        .from("Commits")
        .select("commit_id")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latestErr) throw new Error(latestErr.message);
      if (!latest) throw new Error("No commits found for this room");
      targetCommitId = latest.commit_id as string;
    }

    const { data, error } = await supabase
      .from("Milestones")
      .insert([
        {
          room_id: roomId,
          name: milestoneName,
          notes: milestoneNotes,
          created_by: userId,
          commit_id: targetCommitId,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Step 4: Create a Git tag for the milestone (representing a stable version)
    const safeName = milestoneName.replace(/\s+/g, "-");
    const baseTag = `milestone-${roomId}-${safeName}`;
    const { git } = await getGitRepo();
    // Generate a unique tag to avoid collisions across test runs
    const existing = await git.tags();
    let milestoneTag = baseTag;
    if (existing.all.includes(milestoneTag)) {
      milestoneTag = `${baseTag}-${targetCommitId}`;
    }
    let i = 2;
    while (existing.all.includes(milestoneTag)) {
      milestoneTag = `${baseTag}-${targetCommitId}-${i++}`;
    }
    await git.addAnnotatedTag(
      milestoneTag,
      `Milestone: ${milestoneName} - ${milestoneNotes}`
    );

    // Step 5: Return milestone and tag information
    const result = {
      message: "Milestone created successfully",
      milestone: data,
      tag: milestoneTag,
    };
    log.info("vcs.milestone.created", {
      roomId,
      milestoneName,
      commitId: targetCommitId,
      tag: milestoneTag,
    });
    return result;
  } catch (err: any) {
    log.error("vcs.milestone.create_failed", { error: err });
    throw new Error("Failed to create milestone: " + err.message);
  }
};
// Service function to get milestones for a room
export const getMilestones = async (roomId: string) => {
  try {
    // Fetch milestones for the given room
    const { data: milestones, error } = await supabase
      .from("Milestones")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const result = {
      message: "Milestones fetched successfully",
      milestones,
    };
    log.debug("vcs.milestone.list", { roomId, count: milestones?.length || 0 });
    return result;
  } catch (err: any) {
    log.error("vcs.milestone.list_failed", { error: err });
    throw new Error("Failed to fetch milestones: " + err.message);
  }
};

// Service function to delete a milestone
export const deleteMilestone = async (milestoneId: string, userId: string) => {
  try {
    // Fetch the milestone to ensure it exists and check ownership
    const { data: milestone, error: fetchError } = await supabase
      .from("Milestones")
      .select("created_by")
      .eq("milestone_id", milestoneId)
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
      .from("Milestones")
      .delete()
      .eq("milestone_id", milestoneId);

    if (deleteError) throw new Error(deleteError.message);

    const result = {
      message: "Milestone deleted successfully",
    };
    log.info("vcs.milestone.deleted", { milestoneId });
    return result;
  } catch (err: any) {
    log.error("vcs.milestone.delete_failed", { error: err });
    throw new Error("Failed to delete milestone: " + err.message);
  }
};
