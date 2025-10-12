// services/versionControlService.ts
import { supabase } from "@packages/supabase"; // Assuming supabase instance is imported here

export const getCommitTimelineService = async (roomId: string) => {
  // Fetch all commits for the room in chronological order
  const { data, error } = await supabase
    .from("Commits")
    .select(
      "commit_id, block_id, file_id, commit_message, created_at, author_id, milestone, hidden, commit_type"
    )
    .eq("room_id", roomId)
    .neq("hidden", true)
    .order("created_at", { ascending: true }); // Order by timestamp (ascending = oldest first)

  if (error) {
    throw new Error(`Failed to fetch commit timeline: ${error.message}`);
  }

  // Enhance the timeline data to include author info, file names, etc. (Optional, for enriching data)
  const timeline = await Promise.all(
    data.map(async (commit: any) => {
      const { data: authorData } = await supabase
        .from("auth.users")
        .select("email, username") // Fetch user info from Supabase Auth
        .eq("id", commit.author_id)
        .single();

      // Enrich commit data
      commit.author = authorData
        ? authorData.username || authorData.email
        : "Unknown User";
      commit.isMilestone = commit.milestone ? true : false;

      // You could also enrich with file name, block name, etc., depending on your needs
      return commit;
    })
  );

  return timeline;
};
