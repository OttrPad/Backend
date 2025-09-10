import { supabase } from "@packages/supabase";

// Room_users service
export const addUserToRoom = async (
  roomId: string,
  userId: string,
  userType: "admin" | "editor" | "viewer" = "viewer"
) => {
  // Check if user is already in the room
  const { data: existing } = await supabase
    .from("Room_users")
    .select("*")
    .eq("room_id", roomId)
    .eq("uid", userId)
    .single();

  if (existing) {
    throw new Error("User is already a member of this room");
  }

  // Add user to room
  const { data, error } = await supabase
    .from("Room_users")
    .insert([
      {
        room_id: parseInt(roomId),
        uid: userId,
        type: userType,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error adding user to room:", error);
    throw error;
  }

  return data;
};

export const removeUserFromRoom = async (roomId: string, userId: string) => {
  const { error } = await supabase
    .from("Room_users")
    .delete()
    .match({ room_id: parseInt(roomId), uid: userId });

  if (error) throw error;
};

/**
 * Get all users in a room
 */
export const getRoomUsers = async (roomId: string) => {
  const { data, error } = await supabase
    .from("Room_users")
    .select("uid, type, joined_at")
    .eq("room_id", parseInt(roomId));

  if (error) throw error;
  return data;
};

/**
 * Get all participants in a room including invited users and actual members
 * This combines Room_users (actual members) with Allowed_emails (invited users)
 * For members, it includes user email from auth.users
 * Ensures no duplicates and consistent data structure
 */
export const getRoomParticipants = async (roomId: string) => {
  // Get actual room members with user details
  const { data: roomUsers, error: roomUsersError } = await supabase
    .from("Room_users")
    .select(
      `
      uid, 
      type, 
      joined_at
    `
    )
    .eq("room_id", parseInt(roomId));

  if (roomUsersError) throw roomUsersError;

  // Get invited users (pending invitations)
  const { data: invitedUsers, error: invitedError } = await supabase
    .from("Allowed_emails")
    .select("email, access_level, invited_at, invited_by")
    .eq("room_id", parseInt(roomId));

  if (invitedError) throw invitedError;

  // Combine the results with proper deduplication
  const participants = [];
  const seenUserIds = new Set<string>();
  const seenEmails = new Set<string>();

  // Add actual members with user details
  if (roomUsers) {
    for (const user of roomUsers) {
      if (seenUserIds.has(user.uid)) {
        console.warn(`Duplicate user_id detected: ${user.uid}, skipping...`);
        continue;
      }
      seenUserIds.add(user.uid);

      // Get user email and profile information
      let userEmail = null;
      let userName = null;

      try {
        // Use RPC function to get user info (accessible to all authenticated users)
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "get_user_info",
          {
            user_id: user.uid,
          }
        );

        if (!rpcError && rpcData && !rpcData.error) {
          userEmail = rpcData.email;
          userName = rpcData.name;
          console.log(
            `✅ Successfully fetched user data for ${user.uid}: email=${userEmail}, name=${userName}`
          );
        } else {
          console.warn(
            `⚠️ RPC get_user_info failed for ${user.uid}:`,
            rpcError || rpcData?.error
          );
          // Use basic fallback - no email/name but still include the user
          userEmail = null;
          userName = null;
        }

        if (userEmail) {
          seenEmails.add(userEmail.toLowerCase());
        }
      } catch (error) {
        console.error(
          `❌ Complete failure fetching user data for ${user.uid}:`,
          error
        );
      }

      participants.push({
        user_id: user.uid,
        email: userEmail,
        name: userName,
        status: "member" as const,
        user_type: user.type,
        joined_at: user.joined_at,
      });
    }
  }

  // Add invited users - only if their email isn't already a member
  if (invitedUsers) {
    for (const invite of invitedUsers) {
      const emailLower = invite.email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        console.warn(
          `Email ${invite.email} is already a member, skipping invitation...`
        );
        continue;
      }
      seenEmails.add(emailLower);

      participants.push({
        user_id: null, // Invited users don't have user_id yet
        email: invite.email,
        status: "invited" as const,
        user_type: invite.access_level,
        invited_at: invite.invited_at,
        invited_by: invite.invited_by,
      });
    }
  }
  return participants;
};

/**
 * Check if user is in room
 */
export const isUserInRoom = async (roomId: string, userId: string) => {
  const { data, error } = await supabase
    .from("Room_users")
    .select("uid")
    .eq("room_id", parseInt(roomId))
    .eq("uid", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return !!data;
};

/**
 * Update user type in room
 */
export const updateUserType = async (
  roomId: string,
  userId: string,
  userType: "admin" | "editor" | "viewer"
) => {
  const { data, error } = await supabase
    .from("Room_users")
    .update({ type: userType })
    .eq("room_id", parseInt(roomId))
    .eq("uid", userId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("User not found in room");
  return data;
};

/**
 * Check if user is room admin
 */
export const isRoomAdmin = async (roomId: string, userId: string) => {
  const { data, error } = await supabase
    .from("Room_users")
    .select("type")
    .eq("room_id", parseInt(roomId))
    .eq("uid", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data?.type === "admin";
};

/**
 * Handle user joining room - checks allowed_emails first, then moves to room_users
 * This function handles the transition from email invitation to actual room membership
 */
export const processUserJoinRoom = async (
  roomId: string,
  userId: string,
  userEmail: string,
  isCreator: boolean = false
) => {
  // Check if user is already in room_users
  const userInRoom = await isUserInRoom(roomId, userId);

  // If user is creator and already in room, just return success
  if (isCreator && userInRoom) {
    return {
      room_id: parseInt(roomId),
      user_id: userId,
      user_type: "admin",
      message: "Room creator already has access",
      transition_type: "creator_existing",
    };
  }

  // If user is creator and not in room, add as admin
  if (isCreator && !userInRoom) {
    const result = await addUserToRoom(roomId, userId, "admin");
    return {
      room_id: parseInt(roomId),
      user_id: userId,
      user_type: "admin",
      message: "Room creator added as admin",
      transition_type: "creator_join",
    };
  }

  // For non-creators, check if already in room and throw error
  if (userInRoom) {
    throw new Error("User is already a member of this room");
  }

  // Check if user has email-based access in Allowed_emails
  const { data: emailAccess, error: emailError } = await supabase
    .from("Allowed_emails")
    .select("access_level")
    .eq("room_id", parseInt(roomId))
    .eq("email", userEmail.toLowerCase())
    .single();

  if (emailError && emailError.code !== "PGRST116") {
    throw emailError;
  }

  if (emailAccess) {
    // User has email access - add them to room_users and remove from allowed_emails
    try {
      // Add user to room_users
      await addUserToRoom(roomId, userId, emailAccess.access_level);

      // Remove from allowed_emails
      const { error: removeError } = await supabase
        .from("Allowed_emails")
        .delete()
        .eq("room_id", parseInt(roomId))
        .eq("email", userEmail.toLowerCase());

      if (removeError) {
        console.error("Error removing from allowed_emails:", removeError);
        // Don't throw here, user is already added to room
      }

      console.log(
        `✅ User successfully transitioned from email invitation to room member`
      );
      return {
        room_id: parseInt(roomId),
        user_id: userId,
        user_type: emailAccess.access_level,
        message: "Successfully joined room using email invitation",
        transition_type: "email_to_member",
      };
    } catch (error) {
      console.error("Error during transition:", error);
      throw error;
    }
  } else {
    // No email access found
    throw new Error("Access denied: Email not authorized for this room");
  }
};
