import express, { Request, Response } from "express";
import cors from "cors";
import request from "supertest";
import jwt from "jsonwebtoken";
import gatewayRoutes from "../../routes/gateway.routes";
import healthRoutes from "../../routes/health.routes";
import { serviceProxy } from "../../services/proxy.service";

describe("API service integration", () => {
  const FRONTEND_ORIGIN = "http://localhost:3000";
  const createApp = () => {
    const app = express();

    app.use(
      cors({
        origin: process.env.FRONTEND_URL || FRONTEND_ORIGIN,
        credentials: true,
      })
    );
    app.use(express.json());

    app.use((req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
      );
      next();
    });

    app.get("/", (_req, res) => {
      res.json({
        message: "🚀 Realtime Code Editor API Gateway",
        version: "1.0.0",
        docs: "/api-docs",
        health: "/health",
      });
    });

    app.use("/", healthRoutes);
    app.use("/api", gatewayRoutes);

    app.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: `Route ${req.originalUrl} not found`,
        availableRoutes: [
          "GET /",
          "GET /health",
          "GET /health/services",
          "GET /api-docs",
          "POST /api/rooms",
          "GET /api/rooms",
          "PUT /api/rooms/:id",
          "DELETE /api/rooms/:id",
        ],
      });
    });

    return app;
  };

  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET =
      process.env.SUPABASE_JWT_SECRET || "test-jwt-secret";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("responds from the root route with gateway info", async () => {
    const app = createApp();
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("default-src");
    expect(res.body.message).toBe("🚀 Realtime Code Editor API Gateway");
  });

  it("requires a valid Supabase JWT for protected gateway routes", async () => {
    const app = createApp();
    const res = await request(app).post("/api/rooms").send({ name: "Test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authorization/i);
  });

  it("proxies authenticated room creation requests to the core service", async () => {
    const app = createApp();
    const token = jwt.sign(
      { sub: "user-123", email: "test@example.com", aud: "authenticated" },
      process.env.SUPABASE_JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    const proxySpy = jest
      .spyOn(serviceProxy, "proxyRequest")
      .mockImplementationOnce(
        (async (
          service: string,
          path: string,
          _req: Request,
          res: Response
        ) => {
          res.status(201).json({ ok: true, service, path });
        }) as any
      );

    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My Room", workspace_id: 1 });

    expect(proxySpy).toHaveBeenCalledWith(
      "core",
      "/rooms",
      expect.anything(),
      expect.anything()
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, service: "core", path: "/rooms" });
  });

  it("reports downstream service health via /health/services", async () => {
    const app = createApp();

    jest.spyOn(serviceProxy, "checkHealth").mockResolvedValueOnce({
      core: { status: "healthy" },
      collaboration: { status: "healthy" },
    } as any);

    const res = await request(app).get("/health/services");

    expect(res.status).toBe(200);
    expect(res.body.overall_status).toBe("healthy");
    expect(res.body.services.core.status).toBe("healthy");
  });
});
