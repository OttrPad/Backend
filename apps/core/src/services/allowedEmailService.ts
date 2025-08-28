import { supabase } from "@packages/supabase";
import { isUserInRoom } from "./roomUserService";

export interface AllowedEmail {
  id: number;
  room_id: number;
  email: string;
  access_level: "viewer" | "editor";
  invited_by: string;
  invited_at: string;
}

/**
 * Add an email to the allowed list for a room
 */
export const addAllowedEmail = async (
  roomId: string,
  email: string,
  accessLevel: "viewer" | "editor",
  invitedBy: string
): Promise<AllowedEmail> => {
  // Check if email is already allowed for this room
  const { data: existing } = await supabase
    .from("Allowed_emails")
    .select("*")
    .eq("room_id", parseInt(roomId))
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    throw new Error("Email is already invited to this room");
  }

  // Add email to allowed list
  const { data, error } = await supabase
    .from("Allowed_emails")
    .insert([
      {
        room_id: parseInt(roomId),
        email: email.toLowerCase().trim(),
        access_level: accessLevel,
        invited_by: invitedBy,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Remove an email from the allowed list for a room
 */
export const removeAllowedEmail = async (
  roomId: string,
  email: string
): Promise<void> => {
  const { error } = await supabase
    .from("Allowed_emails")
    .delete()
    .eq("room_id", parseInt(roomId))
    .eq("email", email.toLowerCase().trim());

  if (error) throw error;
};

/**
 * Update access level for an allowed email
 */
export const updateAllowedEmailAccess = async (
  roomId: string,
  email: string,
  accessLevel: "viewer" | "editor"
): Promise<AllowedEmail> => {
  const { data, error } = await supabase
    .from("Allowed_emails")
    .update({ access_level: accessLevel })
    .eq("room_id", parseInt(roomId))
    .eq("email", email.toLowerCase().trim())
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Email not found in allowed list");
  return data;
};

/**
 * Get all allowed emails for a room
 */
export const getAllowedEmails = async (
  roomId: string
): Promise<AllowedEmail[]> => {
  const { data, error } = await supabase
    .from("Allowed_emails")
    .select("*")
    .eq("room_id", parseInt(roomId))
    .order("invited_at", { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Check if an email is allowed to access a room and return access level
 */
export const checkEmailAccess = async (
  roomId: string,
  email: string
): Promise<{ allowed: boolean; accessLevel?: "viewer" | "editor" }> => {
  const { data, error } = await supabase
    .from("Allowed_emails")
    .select("access_level")
    .eq("room_id", parseInt(roomId))
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error && error.code !== "PGRST116") throw error;

  if (!data) {
    return { allowed: false };
  }

  return { allowed: true, accessLevel: data.access_level };
};

/**
 * Get all rooms that an email has access to
 */
export const getRoomsForEmail = async (
  email: string
): Promise<AllowedEmail[]> => {
  const { data, error } = await supabase
    .from("Allowed_emails")
    .select(
      `
      *,
      Rooms:room_id (
        room_id,
        name,
        description,
        room_code,
        created_at,
        created_by
      )
    `
    )
    .eq("email", email.toLowerCase().trim())
    .order("invited_at", { ascending: false });

  if (error) throw error;
  return data || [];
};
