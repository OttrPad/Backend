import { Router, Request, Response } from "express";
import {
  verifyToken,
  AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router: Router = Router();

// Health check
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "collaboration",
    features: ["real-time chat", "code collaboration", "cursor tracking"],
    timestamp: new Date().toISOString(),
  });
});

// Get collaboration room info
router.get(
  "/rooms/:roomId/info",
  verifyToken,
  (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;

    // TODO: Add room validation logic here
    // For now, return basic info
    res.json({
      roomId,
      status: "active",
      features: {
        chat: true,
        codeSync: true,
        cursorTracking: true,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// Broadcast custom event to room
router.post(
  "/rooms/:roomId/broadcast",
  verifyToken,
  (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;
    const { event, data } = req.body;

    if (!event || !data) {
      return res
        .status(400)
        .json({ error: "Event name and data are required" });
    }

    // Access the RealtimeCollaborationService instance
    const realtimeService = req.app.locals.realtimeService;
    if (realtimeService) {
      realtimeService.broadcastToRoom(roomId, event, data);
    }

    res.json({
      message: "Event broadcasted successfully",
      roomId,
      event,
      timestamp: new Date().toISOString(),
    });
  }
);

// Get room statistics
router.get(
  "/rooms/:roomId/stats",
  verifyToken,
  (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;

    // Get actual stats from RealtimeCollaborationService
    const realtimeService = req.app.locals.realtimeService;
    let activeUsers = 0;

    if (realtimeService) {
      const participants = realtimeService.getRoomParticipants(roomId);
      activeUsers = participants.length;
    }

    res.json({
      roomId,
      activeUsers,
      messagesCount: 0, // TODO: Add message count tracking
      codeChanges: 0, // TODO: Add code change tracking
      timestamp: new Date().toISOString(),
    });
  }
);

export default router;
