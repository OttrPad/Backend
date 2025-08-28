import { Request, Response } from "express";
import RealtimeService from "../services/realtimeService";

export const getRoomParticipantsHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const userId = req.headers["x-gateway-user-id"] as string;

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Get realtime service from app locals
    const realtimeService: RealtimeService = req.app.locals.realtimeService;
    
    if (!realtimeService) {
      return res.status(500).json({ error: "Realtime service not available" });
    }

    const participants = realtimeService.getRoomParticipants(roomId);

    res.status(200).json({
      message: "Room participants retrieved successfully",
      roomId,
      participants,
      totalCount: participants.length,
    });
  } catch (err: any) {
    console.error("Error fetching room participants:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch room participants",
      details: err.message || err,
    });
  }
};

export const kickUserFromRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { userId: targetUserId } = req.body;
    const adminUserId = req.headers["x-gateway-user-id"] as string;
    const adminEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !targetUserId) {
      return res.status(400).json({ error: "Room ID and target user ID are required" });
    }

    if (!adminUserId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // TODO: Add room ownership/admin check here
    // For now, we'll skip access control as requested

    // Get realtime service from app locals
    const realtimeService: RealtimeService = req.app.locals.realtimeService;
    
    if (!realtimeService) {
      return res.status(500).json({ error: "Realtime service not available" });
    }

    realtimeService.kickUserFromRoom(roomId, targetUserId);

    console.log(`✅ User ${targetUserId} kicked from room ${roomId} by ${adminEmail} (${adminUserId})`);

    res.status(200).json({
      message: "User kicked from room successfully",
      roomId,
      kickedUserId: targetUserId,
      kickedBy: { id: adminUserId, email: adminEmail },
    });
  } catch (err: any) {
    console.error("Error kicking user from room:", err.message || err);
    res.status(500).json({
      error: "Failed to kick user from room",
      details: err.message || err,
    });
  }
};

export const broadcastToRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { event, data } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || !event) {
      return res.status(400).json({ error: "Room ID and event are required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Get realtime service from app locals
    const realtimeService: RealtimeService = req.app.locals.realtimeService;
    
    if (!realtimeService) {
      return res.status(500).json({ error: "Realtime service not available" });
    }

    // Add sender info to the data
    const eventData = {
      ...data,
      senderId: userId,
      senderEmail: userEmail,
      timestamp: Date.now(),
    };

    realtimeService.broadcastToRoom(roomId, event, eventData);

    console.log(`📡 Event '${event}' broadcast to room ${roomId} by ${userEmail} (${userId})`);

    res.status(200).json({
      message: "Event broadcast successfully",
      roomId,
      event,
      broadcastBy: { id: userId, email: userEmail },
    });
  } catch (err: any) {
    console.error("Error broadcasting to room:", err.message || err);
    res.status(500).json({
      error: "Failed to broadcast to room",
      details: err.message || err,
    });
  }
};

export const saveRoomContentHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { content, language } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!roomId || content === undefined) {
      return res.status(400).json({ error: "Room ID and content are required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // TODO: Here you would typically save to database
    // For now, we'll just broadcast the save event
    const realtimeService: RealtimeService = req.app.locals.realtimeService;
    
    if (realtimeService) {
      realtimeService.broadcastToRoom(roomId, "content-saved", {
        roomId,
        content,
        language,
        savedBy: userId,
        savedByEmail: userEmail,
        timestamp: Date.now(),
      });
    }

    console.log(`💾 Content saved for room ${roomId} by ${userEmail} (${userId})`);

    res.status(200).json({
      message: "Room content saved successfully",
      roomId,
      savedBy: { id: userId, email: userEmail },
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("Error saving room content:", err.message || err);
    res.status(500).json({
      error: "Failed to save room content",
      details: err.message || err,
    });
  }
};
