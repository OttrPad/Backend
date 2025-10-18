/// <reference types="jest" />
import request from "supertest";
import jwt from "jsonwebtoken";

let app: import("express").Application;
let httpServer: import("http").Server;
let realtimeService: any;

describe("Collaboration HTTP integration", () => {
  beforeAll(async () => {
    process.env.COLLABORATION_HTTP_PORT = "0";
    process.env.SUPABASE_JWT_SECRET =
      process.env.SUPABASE_JWT_SECRET || "test-jwt-secret";

    const module = await import("../../app");
    app = module.app;
    httpServer = module.httpServer;
    realtimeService = module.realtimeService;
  });

  afterAll(async () => {
    if (realtimeService?.close) {
      await realtimeService.close();
    }

    await new Promise((resolve) => {
      httpServer.close(() => resolve(undefined));
    });
  });

  it("exposes the collaboration health endpoint", async () => {
    const res = await request(app).get("/api/collaboration/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("collaboration");
  });

  it("requires authentication for notebook creation", async () => {
    const res = await request(app)
      .post("/api/collaboration/rooms/test-room/notebooks")
      .send({ title: "Sample Notebook" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/access token/i);
  });

  it("creates a notebook when a valid token is provided", async () => {
    const token = jwt.sign(
      { sub: "user-123", email: "user@example.com" },
      process.env.SUPABASE_JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/api/collaboration/rooms/room-123/notebooks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Integration Notebook" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("title", "Integration Notebook");
  });
});
