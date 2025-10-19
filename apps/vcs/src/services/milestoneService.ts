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
    console.log(`🎯 [createMilestone] Starting milestone creation:`, {
      roomId,
      milestoneName,
      milestoneNotes,
      userId,
      commitId,
      userEmail,
    });

    // Step 1: Check if the user is the owner/admin
    let access: any = null;
    if (userEmail) {
      const { data: accessData, error: accessErr } = await supabase
        .from("Allowed_emails")
        .select("access_level")
        .eq("room_id", roomId)
        .eq("email", userEmail)
        .single();

      console.log(`🔍 [createMilestone] Allowed_emails check:`, {
        accessData,
        accessErr: accessErr?.message,
      });

      if (accessErr && accessErr.code !== "PGRST116") {
        // PGRST116 = no rows
        throw new Error(accessErr.message);
      }
      access = accessData;
      if (
        access &&
        access.access_level !== "owner" &&
        access.access_level !== "admin"
      ) {
        throw new Error("Only owners and admins can create milestones.");
      }
    }

    // Also check Room_users
    const { data: userRoles, error: roleError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", roomId)
      .eq("uid", userId)
      .single();

    console.log(`🔍 [createMilestone] Room_users check:`, {
      userRoles,
      roleError: roleError?.message,
    });

    if (roleError && roleError.code !== "PGRST116") {
      throw new Error(roleError.message);
    }
    if (userRoles && userRoles.type !== "owner" && userRoles.type !== "admin") {
      throw new Error("Only owners and admins can create milestones.");
    }

    // At least one check must pass
    if (
      (!userRoles ||
        (userRoles.type !== "owner" && userRoles.type !== "admin")) &&
      userEmail &&
      (!access ||
        (access.access_level !== "owner" && access.access_level !== "admin"))
    ) {
      throw new Error("Only owners and admins can create milestones.");
    }

    // Normalize roomId: allow numeric ID or human room_code like abc-def-ghi
    let resolvedRoomId: string | number = roomId;
    if (
      isNaN(Number(roomId)) &&
      typeof roomId === "string" &&
      roomId.includes("-")
    ) {
      const { data: roomRec, error: roomErr } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomId)
        .single();
      if (roomErr || !roomRec) {
        throw new Error(`Room not found for code: ${roomId}`);
      }
      resolvedRoomId = roomRec.room_id;
    }

    // Step 2: Get the latest commit to link the milestone to
    // If commitId is provided, use it; otherwise use the latest commit in the room
    let targetCommitId = commitId;
    if (!targetCommitId) {
      console.log(
        `🔍 [createMilestone] No commitId provided, fetching latest commit for room:`,
        roomId
      );
      const { data: latest, error: latestErr } = await supabase
        .from("commits")
        .select("commit_id")
        .eq("room_id", resolvedRoomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      console.log(`🔍 [createMilestone] Latest commit query result:`, {
        latest,
        latestErr: latestErr?.message,
      });

      if (latestErr && latestErr.code !== "PGRST116") {
        throw new Error(`Failed to find latest commit: ${latestErr.message}`);
      }
      if (!latest) {
        throw new Error(
          "No commits found for this room. Please create a commit before creating a milestone."
        );
      }
      targetCommitId = latest.commit_id as string;
    }

    // Step 3: Verify we're on the main branch (milestones only allowed on main)
    console.log(`📋 [createMilestone] Verifying main branch...`);
    let { data: mainBranch, error: branchError } = await supabase
      .from("branches")
      .select("branch_id")
      .eq("room_id", resolvedRoomId)
      .eq("is_main", true)
      .single();

    if (branchError || !mainBranch) {
      // Try to initialize main branch on the fly (internal call)
      try {
        const vcsUrl =
          process.env.VERSION_CONTROL_PUBLIC_URL ||
          process.env.VERSION_CONTROL_SERVICE_URL ||
          "http://localhost:5000";
        const internalSecret =
          process.env.VERSION_CONTROL_INTERNAL_SECRET || "";
        const resp = await fetch(
          `${vcsUrl}/api/version-control/branches/initialize`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
              "x-gateway-user-id": userId,
            },
            body: JSON.stringify({ roomId: resolvedRoomId, userId }),
          }
        );
        if (resp.ok) {
          const { branch } = await resp.json();
          mainBranch = { branch_id: branch.branch_id } as any;
        }
      } catch (e) {
        // ignore and fall through
      }
    }
    if (!mainBranch) {
      throw new Error("Could not find main branch for this room");
    }

    // Step 4: Insert the milestone into the database
    // The milestone simply marks a point in time and groups all commits since the last milestone
    console.log(
      `📝 [createMilestone] Inserting milestone marker into database...`
    );
    const { data, error } = await supabase
      .from("milestones")
      .insert([
        {
          room_id: resolvedRoomId,
          name: milestoneName,
          notes: milestoneNotes,
          created_by: userId,
          commit_id: targetCommitId, // Link to the latest commit
          branch_id: mainBranch.branch_id,
        },
      ])
      .select()
      .single();

    console.log(`🔍 [createMilestone] Database insert result:`, {
      data,
      error: error?.message,
    });

    if (error) throw new Error(`Database insert failed: ${error.message}`);

    // Step 5: Optionally create a Git tag for tracking (non-critical)
    let milestoneTag = "";
    try {
      const safeName = milestoneName.replace(/\s+/g, "-");
      const baseTag = `milestone-${roomId}-${safeName}`;
      const { git } = await getGitRepo();

      const hasCommits = await git.log().catch(() => null);
      if (!hasCommits || !hasCommits.all || hasCommits.all.length === 0) {
        console.warn(`⚠️ No commits in Git repository, skipping tag creation`);
        milestoneTag = `${baseTag}-pending`;
      } else {
        const existing = await git.tags();
        milestoneTag = baseTag;
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
      }
    } catch (gitErr: any) {
      console.error("Failed to create Git tag for milestone:", gitErr);
      log.warn("vcs.milestone.git_tag_failed", {
        error: gitErr,
        milestoneName,
      });
      // Don't fail the entire milestone creation if just the Git tag fails
      milestoneTag = `milestone-${roomId}-${milestoneName.replace(/\s+/g, "-")}-notag`;
    }

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
      .from("milestones")
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
      .from("milestones")
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
      .from("milestones")
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
