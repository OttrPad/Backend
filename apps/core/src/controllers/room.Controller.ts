import { Request, Response } from "express";
import {
  createRoom,
  deleteRoom,
  findRoomByName,
  findRoomByCode,
  getAllRooms,
  getRoomsForUser,
  getRoomById,
} from "../services/roomService";
import {
  addUserToRoom,
  removeUserFromRoom,
  processUserJoinRoom,
} from "../services/roomUserService";
import { supabase } from "@packages/supabase";

export const createRoomHandler = async (req: Request, res: Response) => {
  try {
    const { name, description, workspace_id } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!name) return res.status(400).json({ error: "Room name is required" });
    if (workspace_id === undefined || workspace_id === null)
      return res.status(400).json({ error: "workspace_id is required" });
    if (!userId)
      return res.status(400).json({ error: "User authentication required" });

    // Check if room already exists
    const existingRoom = await findRoomByName(name);
    if (existingRoom) {
      if (existingRoom.created_by === userId) {
        return res
          .status(400)
          .json({ error: "You already created a room with this name" });
      }
      return res
        .status(400)
        .json({ error: "Room with this name already exists" });
    }

    // Validate workspace exists
    const { data: ws, error: wsError } = await supabase
      .from("Workspaces")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .single();

    if (wsError && wsError.code !== "PGRST116") {
      console.error("Error validating workspace:", wsError.message || wsError);
      return res.status(500).json({ error: "Failed to validate workspace" });
    }
    if (!ws) {
      return res.status(400).json({ error: "Invalid workspace_id" });
    }

    const room = await createRoom(
      name,
      userId,
      Number(workspace_id),
      description
    );

    // Add the creator as admin to Room_users
    await addUserToRoom(room.room_id.toString(), userId, "admin");

    console.log(
      `✅ Room "${name}" (${room.room_code}) created by user ${userEmail} (${userId})`
    );

    res.status(201).json({
      message: "Room created successfully",
      room: {
        id: room.room_id,
        name: room.name,
        description: room.description,
        room_code: room.room_code,
        workspace_id: room.workspace_id,
        created_at: room.created_at,
        created_by: room.created_by,
      },
      creator: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error creating room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to create room", details: err.message || err });
  }
};

export const getAllRoomsHandler = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!userId || !userEmail) {
      return res.status(400).json({ error: "User authentication required" });
    }

    const result = await getRoomsForUser(userId, userEmail, limit, offset);

    res.status(200).json({
      message: "User rooms retrieved successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("Error fetching user rooms:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch user rooms",
      details: err.message || err,
    });
  }
};

export const getRoomByIdHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;

    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    const room = await getRoomById(roomId);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.status(200).json({
      message: "Room details retrieved successfully",
      room,
    });
  } catch (err: any) {
    console.error("Error fetching room details:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch room details",
      details: err.message || err,
    });
  }
};

export const getRoomByCodeHandler = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ error: "Room code is required" });

    const room = await findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: "Room not found with this code" });
    }

    return res.status(200).json({
      message: "Room details retrieved successfully",
      room,
    });
  } catch (err: any) {
    console.error("Error fetching room by code:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch room by code",
      details: err.message || err,
    });
  }
};

export const joinRoomByCodeHandler = async (req: Request, res: Response) => {
  try {
    const { room_code } = req.body;

    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!room_code) {
      return res.status(400).json({ error: "Room code is required" });
    }
    if (!userId || !userEmail) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Find room by code
    const room = await findRoomByCode(room_code);
    if (!room) {
      return res.status(404).json({ error: "Room not found with this code" });
    }

    // Check if user is the room creator (admin) - they can always join
    const isCreator = room.created_by === userId;

    // Use the new process function to handle the join logic
    await processUserJoinRoom(
      room.room_id.toString(),
      userId,
      userEmail,
      isCreator
    );

    console.log(
      `✅ User ${userEmail} (${userId}) joined room ${room.name} via code ${room_code}`
    );

    res.status(200).json({
      message: "Successfully joined room",
      room: {
        id: room.room_id,
        name: room.name,
        description: room.description,
        room_code: room.room_code,
        workspace_id: room.workspace_id,
      },
      user: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error joining room by code:", err.message || err);

    // Handle specific errors
    if (err?.message && err.message.includes("already")) {
      return res.status(409).json({
        error: "Already in room",
        message: "You are already a member of this room",
      });
    }

    res
      .status(500)
      .json({ error: "Failed to join room", details: err.message || err });
  }
};

export const joinRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;

    // Get user info from API Gateway headers (authenticated user)
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !userId || !userEmail) {
      return res
        .status(400)
        .json({ error: "roomId and valid user authentication are required" });
    }

    // Check if room exists
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is the room creator (admin) - they can always join
    const isCreator = room.created_by === userId;

    // Use the new process function to handle the join logic
    await processUserJoinRoom(roomId, userId, userEmail, isCreator);

    console.log(`✅ User ${userEmail} (${userId}) joined room ${roomId}`);

    res.status(200).json({
      message: "Successfully joined room",
      room: {
        id: roomId,
        name: room.name,
        room_code: room.room_code,
        workspace_id: room.workspace_id,
      },
      user: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error joining room:", err.message || err);

    if (err?.message && err.message.includes("already")) {
      return res.status(409).json({
        error: "Already in room",
        message: "You are already a member of this room",
      });
    }

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

    if (!roomId || !userId) {
      return res
        .status(400)
        .json({ error: "roomId and valid user authentication are required" });
    }

    await removeUserFromRoom(roomId, userId);

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

    // Get room details to check ownership
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Only room creator can delete the room
    if (room.created_by !== userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the room creator can delete this room",
      });
    }

    await deleteRoom(roomId);

    console.log(`✅ Room ${roomId} deleted by user ${userEmail} (${userId})`);

    res.status(200).json({
      message: "Room deleted successfully",
      room: { id: roomId, name: room.name },
      deletedBy: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error deleting room:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to delete room", details: err.message || err });
  }
};
