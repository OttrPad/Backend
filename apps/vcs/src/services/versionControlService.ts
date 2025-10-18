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
    .order("created_at", { ascending: false }); // Newest first

  if (commitsError) {
    throw new Error(`Failed to fetch commits: ${commitsError.message}`);
  }

  // Fetch all milestones for the room
  const { data: milestones, error: milestonesError } = await supabase
    .from("milestones")
    .select(
      "milestone_id, name, notes, commit_id, created_at, created_by, room_id"
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: false }); // Newest first

  if (milestonesError) {
    throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
  }

  // Group commits by milestones
  const groupedTimeline: Array<{
    milestone: (typeof milestones)[0] | null;
    commits: Array<{
      id: string;
      type: "commit";
      message: string;
      created_at: string;
      author_id: string;
      snapshot_json: any;
    }>;
  }> = [];

  if (!milestones || milestones.length === 0) {
    // No milestones - all commits go in ungrouped section
    const commitList = (commits || []).map((commit) => ({
      id: commit.commit_id,
      type: "commit" as const,
      message: commit.commit_message,
      created_at: commit.created_at,
      author_id: commit.author_id,
      snapshot_json: commit.snapshot_json,
    }));

    groupedTimeline.push({
      milestone: null,
      commits: commitList,
    });
  } else {
    // Collect all commit IDs that have been assigned to milestone groups
    const groupedCommitIds = new Set<string>();

    // For each milestone, collect commits from that milestone's time until the next older milestone
    for (let i = 0; i < milestones.length; i++) {
      const currentMilestone = milestones[i];
      const nextMilestone = milestones[i + 1]; // Older milestone

      const milestoneTime = new Date(currentMilestone.created_at).getTime();
      const nextMilestoneTime = nextMilestone
        ? new Date(nextMilestone.created_at).getTime()
        : 0; // Beginning of time if no older milestone

      // Get commits between current milestone and next older milestone
      const milestoneCommits = (commits || [])
        .filter((commit) => {
          const commitTime = new Date(commit.created_at).getTime();
          // Include commits from milestone time going back to (but not including) next older milestone
          return commitTime <= milestoneTime && commitTime > nextMilestoneTime;
        })
        .map((commit) => {
          groupedCommitIds.add(commit.commit_id); // Track that this commit is grouped
          return {
            id: commit.commit_id,
            type: "commit" as const,
            message: commit.commit_message,
            created_at: commit.created_at,
            author_id: commit.author_id,
            snapshot_json: commit.snapshot_json,
          };
        });

      groupedTimeline.push({
        milestone: currentMilestone,
        commits: milestoneCommits,
      });
    }

    // Get commits that haven't been grouped under any milestone
    const ungroupedCommits = (commits || [])
      .filter((commit) => !groupedCommitIds.has(commit.commit_id))
      .map((commit) => ({
        id: commit.commit_id,
        type: "commit" as const,
        message: commit.commit_message,
        created_at: commit.created_at,
        author_id: commit.author_id,
        snapshot_json: commit.snapshot_json,
      }));

    // Only add the ungrouped section if there are actually ungrouped commits
    if (ungroupedCommits.length > 0) {
      groupedTimeline.push({
        milestone: null,
        commits: ungroupedCommits,
      });
    }
  }

  return groupedTimeline;
};
