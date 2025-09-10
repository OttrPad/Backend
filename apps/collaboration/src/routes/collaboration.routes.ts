import { Router, Request, Response } from "express";
import { RoomManager } from "../services/room.service";
import { AuthService } from "../services/auth.service";
import { verifySupabaseJWT } from "../middleware/auth.middleware";

export const createCollaborationRoutes = (roomManager: RoomManager): Router => {
  const router = Router();
  const authService = new AuthService();

  /**
   * GET /api/collaboration/rooms/:roomId/document
   * Get the current document state for a room
   * Requires authentication
   */
  router.get(
    "/rooms/:roomId/document",
    verifySupabaseJWT,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.headers["x-gateway-user-id"] as string;
        const userEmail = req.headers["x-gateway-user-email"] as string;

        if (!userId) {
          return res.status(401).json({
            error: "Authentication required",
            message: "User authentication is required",
          });
        }

        // Check room access
        const roomAccess = await authService.checkRoomAccess(
          userId,
          roomId,
          userEmail
        );
        if (!roomAccess.hasAccess) {
          return res.status(403).json({
            error: "Access denied",
            message: "You do not have access to this room",
          });
        }

        const room = roomManager.getRoom(roomId);
        if (!room) {
          return res.status(404).json({
            error: "Room not found",
            message: "No active collaboration session for this room",
          });
        }

        // Get the current document state
        const blocks = room.doc.getArray("blocks");
        const metadata = room.doc.getMap("metadata");

        // Convert Yjs data to plain objects for JSON response
        const blocksArray: any[] = [];
        blocks.forEach((block: any) => {
          const blockData: any = {};
          block.forEach((value: any, key: string) => {
            if (key === "content" && value.toString) {
              blockData[key] = value.toString();
            } else {
              blockData[key] = value;
            }
          });
          blocksArray.push(blockData);
        });

        const metadataObj: any = {};
        metadata.forEach((value: any, key: string) => {
          metadataObj[key] = value;
        });

        res.json({
          message: "Document state retrieved successfully",
          room: {
            id: roomId,
            activeUsers: room.participants.size,
            lastActivity: room.lastActivity,
          },
          document: {
            blocks: blocksArray,
            metadata: metadataObj,
            version: metadataObj.version || 1,
          },
        });
      } catch (error) {
        console.error("Error getting document state:", error);
        res.status(500).json({
          error: "Failed to get document state",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/collaboration/rooms/:roomId/cursors
   * Get all user cursor positions in a room
   * Requires authentication
   */
  router.get(
    "/rooms/:roomId/cursors",
    verifySupabaseJWT,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.headers["x-gateway-user-id"] as string;
        const userEmail = req.headers["x-gateway-user-email"] as string;

        if (!userId) {
          return res.status(401).json({
            error: "Authentication required",
            message: "User authentication is required",
          });
        }

        // Check room access
        const roomAccess = await authService.checkRoomAccess(
          userId,
          roomId,
          userEmail
        );
        if (!roomAccess.hasAccess) {
          return res.status(403).json({
            error: "Access denied",
            message: "You do not have access to this room",
          });
        }

        const cursors = roomManager.getRoomCursors(roomId);

        res.json({
          message: "Room cursors retrieved successfully",
          room: { id: roomId },
          cursors,
          total_count: cursors.length,
        });
      } catch (error) {
        console.error("Error getting cursors:", error);
        res.status(500).json({
          error: "Failed to get cursors",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/collaboration/rooms/:roomId/participants
   * Get all active participants in a room
   * Requires authentication
   */
  router.get(
    "/rooms/:roomId/participants",
    verifySupabaseJWT,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.headers["x-gateway-user-id"] as string;
        const userEmail = req.headers["x-gateway-user-email"] as string;

        if (!userId) {
          return res.status(401).json({
            error: "Authentication required",
            message: "User authentication is required",
          });
        }

        // Check room access
        const roomAccess = await authService.checkRoomAccess(
          userId,
          roomId,
          userEmail
        );
        if (!roomAccess.hasAccess) {
          return res.status(403).json({
            error: "Access denied",
            message: "You do not have access to this room",
          });
        }

        const room = roomManager.getRoom(roomId);
        if (!room) {
          return res.status(404).json({
            error: "Room not found",
            message: "No active collaboration session for this room",
          });
        }

        const participants: any[] = [];
        room.participants.forEach((user) => {
          participants.push({
            userId: user.userId,
            userName: user.userName,
            userEmail: user.userEmail,
            userColor: user.userColor,
            status: "active",
            joinedAt: user.joinedAt,
            lastActivity: user.lastActivity,
            cursor: user.cursor,
          });
        });

        res.json({
          message: "Room participants retrieved successfully",
          room: {
            id: roomId,
            name: `Room ${roomId}`, // In Phase 1, we don't have room names from DB
            activeUsers: room.participants.size,
          },
          participants,
          total_count: participants.length,
        });
      } catch (error) {
        console.error("Error getting participants:", error);
        res.status(500).json({
          error: "Failed to get participants",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  return router;
};
