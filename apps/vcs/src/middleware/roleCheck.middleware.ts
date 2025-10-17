import { Request, Response, NextFunction } from "express";
import { supabase } from "@packages/supabase"; // Assuming supabase instance is imported here

/**
 * Middleware to ensure the user is either an Editor or Owner to commit to a block
 */
export const requireEditorOrOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { roomId } = req.body;
  const userId = req.headers["x-gateway-user-id"] as string;
  const userEmail = req.headers["x-gateway-user-email"] as string;

  console.log(`🔍 [requireEditorOrOwner] Checking auth for:`, {
    roomId,
    userId,
    userEmail,
  });

  try {
    // If roomId is a room_code (string like 'abc-def-ghi'), resolve it to room_id (bigint)
    let actualRoomId: string | number = roomId;
    
    // Check if roomId is a string with hyphens (room_code) or numeric (room_id)
    if (isNaN(Number(roomId)) && typeof roomId === 'string' && roomId.includes('-')) {
      console.log(`🔍 [requireEditorOrOwner] Resolving room_code to room_id:`, roomId);
      const { data: roomData, error: roomError } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomId)
        .single();
      
      if (roomError || !roomData) {
        console.warn(`⚠️ Room not found for code: ${roomId}`);
        return res.status(404).json({ error: "Room not found" });
      }
      
      actualRoomId = roomData.room_id;
      console.log(`✅ [requireEditorOrOwner] Resolved room_code ${roomId} to room_id ${actualRoomId}`);
    }

    // First, check if user is in Room_users table (room creator or member)
    const { data: roomUser, error: roomUserError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", actualRoomId)
      .eq("uid", userId)
      .single();

    console.log(`🔍 [requireEditorOrOwner] Room_users query result:`, {
      roomUser,
      roomUserError: roomUserError?.message,
    });

    // If user is owner or admin in Room_users table, allow access
    if (!roomUserError && roomUser && (roomUser.type === "owner" || roomUser.type === "admin")) {
      console.log(`✅ [requireEditorOrOwner] User authorized via Room_users (type: ${roomUser.type})`);
      return next();
    }

    // Otherwise, check Allowed_emails table (for invited users)
    const { data: userRoles, error } = await supabase
      .from("Allowed_emails")
      .select("access_level")
      .eq("room_id", actualRoomId)
      .eq("email", userEmail)
      .single();

    console.log(`🔍 [requireEditorOrOwner] Allowed_emails query result:`, {
      userRoles,
      error: error?.message,
    });

    if (error || !userRoles) {
      console.warn(`⚠️ User ${userId} (${userEmail}) not authorized for room ${roomId}`);
      return res
        .status(403)
        .json({ error: "Forbidden", message: "User not authorized" });
    }

    // Check if the access_level is either "editor" or "owner"
    if (
      userRoles.access_level !== "editor" &&
      userRoles.access_level !== "owner"
    ) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only editors or owners can commit to blocks",
      });
    }

    // If the user has the required role, proceed to the next middleware or route handler
    next();
  } catch (err: any) {
    console.error(
      "Error in requireEditorOrOwner middleware:",
      err.message || err
    );
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
};

/**
 * Middleware to ensure the user is an Owner to create or delete milestones
 */
export const requireOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // roomId may come from body (create) or params (delete/list)
  const roomId = (req.body?.roomId || req.params?.roomId) as string | undefined;
  const userId = req.headers["x-gateway-user-id"] as string;
  const userEmail = req.headers["x-gateway-user-email"] as string;

  console.log(`🔍 [requireOwner] Checking auth for:`, {
    roomId,
    userId,
    userEmail,
  });

  try {
    // If roomId is a room_code (string like 'abc-def-ghi'), resolve it to room_id (bigint)
    let actualRoomId: string | number | undefined = roomId;
    
    if (roomId && isNaN(Number(roomId)) && typeof roomId === 'string' && roomId.includes('-')) {
      console.log(`🔍 [requireOwner] Resolving room_code to room_id:`, roomId);
      const { data: roomData, error: roomError } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomId)
        .single();
      
      if (roomError || !roomData) {
        console.warn(`⚠️ Room not found for code: ${roomId}`);
        return res.status(404).json({ error: "Room not found" });
      }
      
      actualRoomId = roomData.room_id;
      console.log(`✅ [requireOwner] Resolved room_code ${roomId} to room_id ${actualRoomId}`);
    }

    // First, check if user is the room creator (in Room_users with type 'owner')
    const { data: roomUser, error: roomUserError } = await supabase
      .from("Room_users")
      .select("type")
      .eq("room_id", actualRoomId)
      .eq("uid", userId)
      .single();

    console.log(`🔍 [requireOwner] Room_users query result:`, {
      roomUser,
      roomUserError: roomUserError?.message,
    });

    // If user is owner or admin in Room_users table, allow access
    // Admin is equivalent to owner for milestone creation
    if (!roomUserError && roomUser && (roomUser.type === "owner" || roomUser.type === "admin")) {
      console.log(`✅ [requireOwner] User authorized via Room_users (type: ${roomUser.type})`);
      return next();
    }

    // Otherwise, check Allowed_emails table (for invited users)
    const { data: userRoles, error } = await supabase
      .from("Allowed_emails")
      .select("access_level")
      .eq("room_id", actualRoomId)
      .eq("email", userEmail)
      .limit(1)
      .maybeSingle(); // Use maybeSingle() to handle 0 or 1 row without error

    console.log(`🔍 [requireOwner] Allowed_emails query result:`, {
      userRoles,
      error: error?.message,
    });

    if (error || !userRoles) {
      console.warn(`⚠️ User ${userId} (${userEmail}) not authorized for room ${roomId}`);
      return res
        .status(403)
        .json({ error: "Forbidden", message: "User not authorized" });
    }

    // Check if the access_level is "owner"
    if (userRoles.access_level !== "owner") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only owners can create or delete milestones",
      });
    }

    // If the user is an owner, proceed to the next middleware or route handler
    next();
  } catch (err: any) {
    console.error("Error in requireOwner middleware:", err.message || err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
};

