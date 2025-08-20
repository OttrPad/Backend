import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Hello from API Gateway!" });
});
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

app.get("/api", (req, res) => {
  res.json({ message: "API route is active" });
});

// test core service
// Import axios for making HTTP requests

// Core service status endpoint
app.get("/core/status", async (req, res) => {
  try {
    const coreServiceUrl =
      process.env.CORE_SERVICE_URL || "http://localhost:4001";
    const response = await axios.get(`${coreServiceUrl}/status`);
    res.json(response.data);
  } catch (error: unknown) {
    console.error("Error connecting to core service:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res
      .status(503)
      .json({ message: "Core service unavailable", error: errorMessage });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
