import express, { Router } from "express";
import {
  getRoomParticipantsHandler,
  kickUserFromRoomHandler,
  broadcastToRoomHandler,
  saveRoomContentHandler,
} from "../controllers/realtimeController";

const router: Router = express.Router();

// Get participants in a room
router.get("/rooms/:id/participants", getRoomParticipantsHandler);

// Kick a user from a room
router.post("/rooms/:id/kick", kickUserFromRoomHandler);

// Broadcast an event to a room
router.post("/rooms/:id/broadcast", broadcastToRoomHandler);

// Save room content
router.post("/rooms/:id/save", saveRoomContentHandler);

export default router;
