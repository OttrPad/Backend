import { Request, Response } from "express";
import {
  createRoom,
  deleteRoom,
  findRoomByName,
} from "../services/roomService";
import { addUserToRoom, removeUserFromRoom } from "../services/roomUserService";

export const createRoomHandler = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!name) return res.status(400).json({ error: "Room name is required" });
    if (!userId)
      return res.status(400).json({ error: "User authentication required" });

    // Check if room already exists
    const existingRoom = await findRoomByName(name);
    if (existingRoom) {
      return res
        .status(400)
        .json({ error: "Room with this name already exists" });
    }

    const room = await createRoom(name, userId); // Pass creator's user ID

    console.log(`✅ Room "${name}" created by user ${userEmail} (${userId})`);

    res.status(201).json({
      message: "Room created successfully",
      room,
      creator: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error creating room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to create room", details: err.message || err });
  }
};

export const joinRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers (authenticated user)
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    // Option 1: Use authenticated user automatically
    const userToAdd = userId;

    // Option 2: Allow admin/moderator to add other users (uncomment if needed)
    // const { user_id } = req.body;
    // const userToAdd = user_id || userId; // Use provided user_id or default to authenticated user

    if (!roomId || !userToAdd) {
      return res
        .status(400)
        .json({ error: "roomId and valid user authentication are required" });
    }

    await addUserToRoom(roomId, userToAdd);

    console.log(`✅ User ${userEmail} (${userId}) joined room ${roomId}`);

    res.status(200).json({
      message: "Successfully joined room",
      room: { id: roomId },
      user: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error joining room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to join room", details: err.message || err });
  }
};

export const leaveRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers (authenticated user)
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    // Use authenticated user automatically
    const userToRemove = userId;

    if (!roomId || !userToRemove) {
      return res
        .status(400)
        .json({ error: "roomId and valid user authentication are required" });
    }

    await removeUserFromRoom(roomId, userToRemove);

    console.log(`✅ User ${userEmail} (${userId}) left room ${roomId}`);

    res.status(200).json({
      message: "Successfully left room",
      room: { id: roomId },
      user: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error leaving room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to leave room", details: err.message || err });
  }
};

export const deleteRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId) return res.status(400).json({ error: "roomId is required" });
    if (!userId)
      return res.status(400).json({ error: "User authentication required" });

    // TODO: Add authorization check - only room creator or admin should be able to delete
    // For now, any authenticated user can delete any room

    await deleteRoom(roomId);

    console.log(`✅ Room ${roomId} deleted by user ${userEmail} (${userId})`);

    res.status(200).json({
      message: "Room deleted successfully",
      room: { id: roomId },
      deletedBy: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error deleting room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to delete room", details: err.message || err });
  }
};
