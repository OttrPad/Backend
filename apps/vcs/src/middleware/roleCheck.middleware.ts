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
  const { roomId } = req.body; // Assuming roomId is part of the request body
  const userId = req.headers["x-gateway-user-id"] as string; // Assuming userId is passed in headers

  try {
    // Query the Allowed_emails table to get the user's access level for the room
    const { data: userRoles, error } = await supabase
      .from("Allowed_emails")
      .select("access_level")
      .eq("room_id", roomId)
      .eq("email", req.headers["x-gateway-user-email"]) // Assuming email is passed in headers
      .single();

    if (error || !userRoles) {
      console.warn(`⚠️ User ${userId} not found or error occurred:`, error);
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
  const userId = req.headers["x-gateway-user-id"] as string; // Assuming userId is passed in headers

  try {
    // Query the Allowed_emails table to get the user's access level for the room
    const { data: userRoles, error } = await supabase
      .from("Allowed_emails")
      .select("access_level")
      .eq("room_id", roomId)
      .eq("email", req.headers["x-gateway-user-email"]) // Assuming email is passed in headers
      .single();

    if (error || !userRoles) {
      console.warn(`⚠️ User ${userId} not found or error occurred:`, error);
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
