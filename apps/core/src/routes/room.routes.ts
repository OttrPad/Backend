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

// Room routes
router.post("/rooms", createRoomHandler);
router.post("/rooms/:id/join", joinRoomHandler);
router.delete("/rooms/:id/leave", leaveRoomHandler);
router.delete("/rooms/:id", deleteRoomHandler);

export default router;
