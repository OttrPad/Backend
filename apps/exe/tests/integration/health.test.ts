import request from "supertest";
import app from "../../src/app";

describe("exe service health endpoint", () => {
  it("returns status ok and service exe", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "exe" });
  });
});
