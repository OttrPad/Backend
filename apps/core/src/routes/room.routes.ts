import { Router } from "express";
import { supabase } from "@packages/supabase";
import {
  createRoomHandler,
  joinRoomHandler,
  leaveRoomHandler,
  deleteRoomHandler,
} from "../controllers/room.Controller";

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
router.get("/", async (req, res) => {
  // GET /rooms -> list all rooms
  res.json({ message: "List all rooms - to be implemented", rooms: [] });
});
router.post("/:id/join", joinRoomHandler); // POST /rooms/:id/join
router.delete("/:id/leave", leaveRoomHandler); // DELETE /rooms/:id/leave
router.get("/:id", async (req, res) => {
  // GET /rooms/:id -> get room details
  res.json({
    message: "Get room details - to be implemented",
    roomId: req.params.id,
  });
});
router.delete("/:id", deleteRoomHandler); // DELETE /rooms/:id

export default router;
