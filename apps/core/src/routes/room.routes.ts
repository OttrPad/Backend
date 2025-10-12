import { Router } from "express";
import { supabase } from "@packages/supabase";
import {
  createRoomHandler,
  joinRoomHandler,
  leaveRoomHandler,
  deleteRoomHandler,
  getAllRoomsHandler,
  getRoomByIdHandler,
  joinRoomByCodeHandler,
  getRoomByCodeHandler,
} from "../controllers/room.Controller";
import {
  addEmailToRoomHandler,
  removeEmailFromRoomHandler,
  updateEmailAccessHandler,
  getRoomAllowedEmailsHandler,
  getRoomParticipantsHandler,
} from "../controllers/roomAccessController";

const router: Router = Router();

// Test query to fetch one room
router.get("/test", async (req, res) => {
  const { data, error } = await supabase.from("Rooms").select("*").limit(1);

  if (error) {
    return res
      .status(500)
      .json({ message: "Supabase Rooms query failed", error });
  }

  res.json({ message: "Supabase connected successfully, Rooms data:", data });
});

// Test query to fetch one room user
router.get("/users/test", async (req, res) => {
  const { data, error } = await supabase
    .from("Room_users")
    .select("*")
    .limit(1);

  if (error) {
    return res
      .status(500)
      .json({ message: "Supabase RoomUsers query failed", error });
  }

  res.json({
    message: "Supabase connected successfully, RoomUsers data:",
    data,
  });
});

// Room management routes (no /rooms prefix here as it's handled by API Gateway)
router.post("/", createRoomHandler); // POST /rooms -> creates a room
router.get("/", getAllRoomsHandler); // GET /rooms -> list all rooms
router.post("/join", joinRoomByCodeHandler); // POST /rooms/join -> join room by code
router.get("/code/:code", getRoomByCodeHandler); // GET /rooms/code/:code -> get room by code
router.post("/:id/join", joinRoomHandler); // POST /rooms/:id/join -> join room by ID
router.delete("/:id/leave", leaveRoomHandler); // DELETE /rooms/:id/leave
router.get("/:id", getRoomByIdHandler); // GET /rooms/:id -> get room details
router.delete("/:id", deleteRoomHandler); // DELETE /rooms/:id

// Room access management routes
router.post("/:id/access/add", addEmailToRoomHandler); // POST /rooms/:id/access/add -> add email to room
router.delete("/:id/access/remove", removeEmailFromRoomHandler); // DELETE /rooms/:id/access/remove -> remove email from room
router.put("/:id/access/update", updateEmailAccessHandler); // PUT /rooms/:id/access/update -> update email access level
router.get("/:id/access", getRoomAllowedEmailsHandler); // GET /rooms/:id/access -> get room allowed emails

// Room participants route
router.get("/:id/participants", getRoomParticipantsHandler); // GET /rooms/:id/participants -> get room participants

export default router;
