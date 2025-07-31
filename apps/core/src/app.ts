import express from "express";
import cors from "cors";

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

app.listen(PORT, () => {
  console.log(`Core service running on http://localhost:${PORT}`);
});
