import { Request, Response } from "express";
import {
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailAccess,
  getAllowedEmails,
  checkEmailAccess,
} from "../services/allowedEmailService";
import { getRoomById } from "../services/roomService";
import { getRoomParticipants, isRoomAdmin } from "../services/roomUserService";

export const getRoomParticipantsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Check if room exists
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user has access to view participants
    // Only room creator/admin or existing room members can view participants
    const isCreator = room.created_by === userId;
    const isAdmin = await isRoomAdmin(roomId, userId);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only room admin or members can view participants",
      });
    }

    const participants = await getRoomParticipants(roomId);

    res.status(200).json({
      message: "Room participants retrieved successfully",
      room: { id: roomId, name: room.name },
      participants,
      total_count: participants.length,
    });
  } catch (err: any) {
    console.error("Error fetching room participants:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch room participants",
      details: err.message || err,
    });
  }
};

export const addEmailToRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { email, access_level } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !email || !access_level) {
      return res.status(400).json({
        error: "Room ID, email, and access level are required",
      });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Validate access level
    if (!["viewer", "editor"].includes(access_level)) {
      return res.status(400).json({
        error: "Access level must be 'viewer' or 'editor'",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Check if room exists and user is the creator (admin) or room admin
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const isCreator = room.created_by === userId;
    const isAdmin = await isRoomAdmin(roomId, userId);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only room admin can manage access",
      });
    }

    // Don't allow adding the creator's own email
    if (email.toLowerCase().trim() === userEmail?.toLowerCase()) {
      return res.status(400).json({
        error: "Cannot add your own email to the access list",
      });
    }

    const allowedEmail = await addAllowedEmail(
      roomId,
      email,
      access_level,
      userId
    );

    console.log(
      `✅ Email ${email} added to room ${roomId} with ${access_level} access by ${userEmail} (${userId})`
    );

    res.status(201).json({
      message: "Email added to room access list successfully",
      allowed_email: allowedEmail,
      room: { id: roomId, name: room.name },
      added_by: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error adding email to room:", err.message || err);

    if (err.message && err.message.includes("already invited")) {
      return res.status(409).json({
        error: "Email already invited",
        message: "This email is already in the room's access list",
      });
    }

    if (err.message && err.message.includes("must be a member")) {
      return res.status(400).json({
        error: "User not in room",
        message: "User must be a member of the room to be granted access",
      });
    }

    res.status(500).json({
      error: "Failed to add email to room",
      details: err.message || err,
    });
  }
};

export const removeEmailFromRoomHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: roomId } = req.params;
    const { email } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !email) {
      return res.status(400).json({ error: "Room ID and email are required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Check if room exists and user is the creator (admin) or room admin
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const isCreator = room.created_by === userId;
    const isAdmin = await isRoomAdmin(roomId, userId);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only room admin can manage access",
      });
    }

    await removeAllowedEmail(roomId, email);

    console.log(
      `✅ Email ${email} removed from room ${roomId} by ${userEmail} (${userId})`
    );

    res.status(200).json({
      message: "Email removed from room access list successfully",
      room: { id: roomId, name: room.name },
      removed_by: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error removing email from room:", err.message || err);
    res.status(500).json({
      error: "Failed to remove email from room",
      details: err.message || err,
    });
  }
};

export const updateEmailAccessHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { email, access_level } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !email || !access_level) {
      return res.status(400).json({
        error: "Room ID, email, and access level are required",
      });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Validate access level
    if (!["viewer", "editor"].includes(access_level)) {
      return res.status(400).json({
        error: "Access level must be 'viewer' or 'editor'",
      });
    }

    // Check if room exists and user is the creator (admin) or room admin
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const isCreator = room.created_by === userId;
    const isAdmin = await isRoomAdmin(roomId, userId);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only room admin can manage access",
      });
    }

    const updatedEmail = await updateAllowedEmailAccess(
      roomId,
      email,
      access_level
    );

    console.log(
      `✅ Email ${email} access updated to ${access_level} in room ${roomId} by ${userEmail} (${userId})`
    );

    res.status(200).json({
      message: "Email access level updated successfully",
      allowed_email: updatedEmail,
      room: { id: roomId, name: room.name },
      updated_by: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error updating email access:", err.message || err);

    if (err.message && err.message.includes("not found")) {
      return res.status(404).json({
        error: "Email not found",
        message: "This email is not in the room's access list for this user",
      });
    }

    if (err.message && err.message.includes("must be a member")) {
      return res.status(400).json({
        error: "User not in room",
        message: "User must be a member of the room to update access",
      });
    }

    res.status(500).json({
      error: "Failed to update email access",
      details: err.message || err,
    });
  }
};

export const getRoomAllowedEmailsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Check if room exists
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user has access to view participants
    // Room creator/admin can view all, others can only see the list if they're members
    const isCreator = room.created_by === userId;
    const isAdmin = await isRoomAdmin(roomId, userId);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only room admin can view the full access list",
      });
    }

    const allowedEmails = await getAllowedEmails(roomId);

    res.status(200).json({
      message: "Room access list retrieved successfully",
      room: { id: roomId, name: room.name },
      allowed_emails: allowedEmails,
      total_count: allowedEmails.length,
    });
  } catch (err: any) {
    console.error("Error fetching room allowed emails:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch room access list",
      details: err.message || err,
    });
  }
};
