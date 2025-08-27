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
