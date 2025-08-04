import express from "express";
import cors from "cors";
import { supabase } from "./supabase/client";

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/status", (req, res) => {
  res.json({
    service: "Core",
    status: "operational",
    timestamp: new Date().toISOString(),
  });
});

// Test query to fetch one room
app.get("/rooms-test", async (req, res) => {
  const { data, error } = await supabase
    .from("Rooms")       // Your table name, case sensitive if using Postgres with quotes
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ message: "Supabase Rooms query failed", error });
  }

  res.json({ message: "Supabase connected successfully, Rooms data:", data });
});

// Test query to fetch one room user
app.get("/room-users-test", async (req, res) => {
  const { data, error } = await supabase
    .from("Room_users")  // Adjust table name exactly as defined in Supabase
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ message: "Supabase RoomUsers query failed", error });
  }

  res.json({ message: "Supabase connected successfully, RoomUsers data:", data });
});

app.listen(PORT, () => {
  console.log(`Core service running on http://localhost:${PORT}`);
});
