import request from "supertest";
import app from "../../src/app";

describe("execution start/stop idempotency", () => {
  const roomId = "idem-room-1";

  it("returns started on first start", async () => {
    const res = await request(app).post(`/execute/room/${roomId}/start`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "started" });
  });

  it("returns started again on second start (overwrite same room mapping)", async () => {
    const res = await request(app).post(`/execute/room/${roomId}/start`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "started" });
  });

  it("returns stopped on stop", async () => {
    const res = await request(app).post(`/execute/room/${roomId}/stop`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "stopped" });
  });

  it("returns stopped again on second stop (already removed)", async () => {
    const res = await request(app).post(`/execute/room/${roomId}/stop`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "stopped" });
  });
});
