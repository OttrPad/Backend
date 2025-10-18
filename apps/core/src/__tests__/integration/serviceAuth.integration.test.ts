import express, { Request, Response } from "express";
import request from "supertest";
import { requireGatewayAuth } from "../../middleware/service-auth.middleware";

describe("Core service gateway authentication integration", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(requireGatewayAuth);

    app.get("/protected", (req: Request, res: Response) => {
      res.json({ gatewayUser: (req as any).gatewayUser });
    });

    return app;
  };

  it("blocks direct access when gateway headers are missing", async () => {
    const app = buildApp();
    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
    expect(res.body.hint).toMatch(/api gateway/i);
  });

  it("allows requests that include gateway headers and exposes user context", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("x-gateway-user-id", "user-42")
      .set("x-gateway-user-email", "user@example.com")
      .set("x-original-url", "/api/rooms");

    expect(res.status).toBe(200);
    expect(res.body.gatewayUser).toEqual({
      id: "user-42",
      email: "user@example.com",
      originalUrl: "/api/rooms",
    });
  });
});
