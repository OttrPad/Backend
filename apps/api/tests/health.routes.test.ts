import request from "supertest";
import express from "express";
import healthRoutes from "../src/../src/routes/health.routes";

// Minimal server to mount the routes
const app = express();
app.use(express.json());
app.use("/", healthRoutes as any);

describe("API Gateway Health Routes", () => {
  test("GET /health returns gateway health object", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "healthy");
    expect(res.body).toHaveProperty("service", "API Gateway");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
  });

  test("GET /health/services returns services health (mocked)", async () => {
    // We will monkeypatch the serviceProxy.checkHealth to return a deterministic value
    const proxyModule = require("../src/../src/services/proxy.service");
    const original = proxyModule.serviceProxy.checkHealth;
    proxyModule.serviceProxy.checkHealth = async () => ({
      core: { status: "healthy" },
      collaboration: { status: "healthy" },
    });

    const res = await request(app).get("/health/services");
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("gateway");
    expect(res.body).toHaveProperty("services");
    expect(res.body.services).toHaveProperty("core");

    // restore
    proxyModule.serviceProxy.checkHealth = original;
  });
});
