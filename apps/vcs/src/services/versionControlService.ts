// services/versionControlService.ts
import { supabase } from "@packages/supabase"; // Assuming supabase instance is imported here

export const getCommitTimelineService = async (roomId: string) => {
  // Fetch all commits for the room
  const { data: commits, error: commitsError } = await supabase
    .from("commits")
    .select(
      "commit_id, block_id, file_id, commit_message, created_at, author_id, milestone, hidden, commit_type, snapshot_json"
    )
    .eq("room_id", roomId)
    .neq("hidden", true)
    .order("created_at", { ascending: true });

  if (commitsError) {
    throw new Error(`Failed to fetch commits: ${commitsError.message}`);
  }

  // Fetch all milestones for the room
  const { data: milestones, error: milestonesError } = await supabase
    .from("milestones")
    .select("milestone_id, name, notes, commit_id, created_at, created_by, room_id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (milestonesError) {
    throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
  }

  // Combine commits and milestones into a unified timeline
  const timeline: any[] = [];

  // Add commits to timeline
  for (const commit of commits || []) {
    const { data: authorData } = await supabase
      .from("auth.users")
      .select("email, username")
      .eq("id", commit.author_id)
      .single();

    timeline.push({
      id: commit.commit_id,
      type: 'commit',
      message: commit.commit_message,
      created_at: commit.created_at,
      author_id: commit.author_id,
      author: authorData ? authorData.username || authorData.email : "Unknown User",
      snapshot_json: commit.snapshot_json,
      isMilestone: false,
    });
  }

  // Add milestones to timeline (with snapshot from their referenced commit)
  for (const milestone of milestones || []) {
    // Fetch the snapshot from the commit this milestone references
    const { data: commitData } = await supabase
      .from("commits")
      .select("snapshot_json, commit_message, author_id")
      .eq("commit_id", milestone.commit_id)
      .single();

    const { data: authorData } = await supabase
      .from("auth.users")
      .select("email, username")
      .eq("id", milestone.created_by)
      .single();

    timeline.push({
      id: milestone.milestone_id,
      type: 'milestone',
      message: milestone.name,
      notes: milestone.notes,
      commit_id: milestone.commit_id,
      created_at: milestone.created_at,
      author_id: milestone.created_by,
      author: authorData ? authorData.username || authorData.email : "Unknown User",
      snapshot_json: commitData?.snapshot_json || null, // Get snapshot from the commit
      isMilestone: true,
    });
  }

  // Sort combined timeline by created_at
  timeline.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return timeline;
};
