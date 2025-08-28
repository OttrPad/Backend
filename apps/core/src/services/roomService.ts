import { supabase } from "@packages/supabase";

/**
 * Generate a unique 9-digit room code in format: xxx-xxx-xxx
 * Uses lowercase letters and numbers for better readability
 */
const generateRoomCode = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [];

  // Generate 3 segments of 3 characters each
  for (let i = 0; i < 3; i++) {
    let segment = "";
    for (let j = 0; j < 3; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }

  return segments.join("-");
};

/**
 * Generate a unique room code that doesn't exist in the database
 */
const generateUniqueRoomCode = async (): Promise<string> => {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const code = generateRoomCode();

    // Check if code already exists
    const { data, error } = await supabase
      .from("Rooms")
      .select("room_code")
      .eq("room_code", code)
      .single();

    // If no data found (PGRST116), the code is unique
    if (error && error.code === "PGRST116") {
      return code;
    }

    // If other error, throw it
    if (error && error.code !== "PGRST116") {
      throw error;
    }

    attempts++;
  }

  throw new Error("Failed to generate unique room code after maximum attempts");
};

// Rooms service
export const createRoom = async (
  name: string,
  createdBy: string,
  description?: string
) => {
  // Generate unique room code
  const roomCode = await generateUniqueRoomCode();

  const roomData: any = {
    name,
    created_by: createdBy,
    room_code: roomCode,
    description: description || null,
  };

  const { data, error } = await supabase
    .from("Rooms")
    .insert([roomData])
    .select()
    .single();

  console.log("createRoom data:", data);
  console.log("createRoom error:", error);

  if (error) throw error;
  return data;
};

export const deleteRoom = async (roomId: string) => {
  const { error } = await supabase.from("Rooms").delete().eq("room_id", roomId);

  if (error) throw error;
};

export const findRoomByName = async (name: string) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select("*")
    .eq("name", name)
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error; // ignore "no rows found" error
  return data;
};

/**
 * Find room by room code
 */
export const findRoomByCode = async (roomCode: string) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select("*")
    .eq("room_code", roomCode)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
};

/**
 * Get all rooms (with pagination support)
 */
export const getAllRooms = async (limit: number = 50, offset: number = 0) => {
  const { data, error, count } = await supabase
    .from("Rooms")
    .select("*, Room_users(uid)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    rooms: data,
    total: count,
    hasMore: count ? offset + limit < count : false,
  };
};

/**
 * Get rooms that a specific user has access to
 * This includes rooms where the user is:
 * 1. A member (in Room_users table)
 * 2. Is the room creator
 * Note: allowed_emails are no longer checked as users are transitioned to room_users on first join
 */
export const getRoomsForUser = async (
  userId: string,
  userEmail: string,
  limit: number = 50,
  offset: number = 0
) => {
  // Get rooms where user is creator or member - using separate queries and combining
  // This avoids the complex .or() syntax with joined tables

  // Query 1: Rooms where user is creator
  const { data: creatorRooms, error: creatorError } = await supabase
    .from("Rooms")
    .select(
      `
      *,
      Room_users(uid, type)
    `
    )
    .eq("created_by", userId);

  if (creatorError) throw creatorError;

  // Query 2: Rooms where user is a member
  const { data: memberRooms, error: memberError } = await supabase
    .from("Rooms")
    .select(
      `
      *,
      Room_users!inner(uid, type)
    `
    )
    .eq("Room_users.uid", userId);

  if (memberError) throw memberError;

  // Combine and deduplicate results
  const allRooms = [...(creatorRooms || []), ...(memberRooms || [])];
  const uniqueRooms = allRooms.reduce((acc: any[], room: any) => {
    const existingRoom = acc.find((r: any) => r.room_id === room.room_id);
    if (!existingRoom) {
      const userMembership = room.Room_users?.find(
        (u: any) => u.uid === userId
      );
      acc.push({
        ...room,
        user_access: {
          is_member: !!userMembership,
          is_creator: room.created_by === userId,
          user_type:
            userMembership?.type ||
            (room.created_by === userId ? "admin" : null),
        },
      });
    }
    return acc;
  }, []);

  // Sort by created_at (newest first)
  uniqueRooms.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Apply pagination
  const paginatedRooms = uniqueRooms.slice(offset, offset + limit);

  return {
    rooms: paginatedRooms,
    total: uniqueRooms.length,
    hasMore: offset + limit < uniqueRooms.length,
  };
};

/**
 * Get room details by ID including user list
 */
export const getRoomById = async (roomId: string) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select(
      `
      *,
      Room_users (
        uid,
        type,
        joined_at
      )
    `
    )
    .eq("room_id", roomId)
    .single();

  if (error) throw error;
  return data;
};
