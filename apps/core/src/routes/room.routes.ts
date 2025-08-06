import { Router } from "express";
import { supabase } from "@packages/supabase";

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

export default router;
