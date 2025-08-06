import express from "express";
import cors from "cors";
import roomRoutes from "./routes/room.routes";

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

// Import routes
app.use("/rooms", roomRoutes);

app.listen(PORT, () => {
  console.log(`Core service running on http://localhost:${PORT}`);
});
