import request from "supertest";
import app from "../../src/app";
import Docker from "dockerode";

// Daemon availability check using docker.ping() (no container side-effects)
async function dockerAvailable(): Promise<boolean> {
  const docker = new Docker();
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

describe("execution flow (start -> exec -> stop -> restart)", () => {
  const roomId = "prt-mnt-nrm"; // Mock room id

  beforeAll(async () => {
    const available = await dockerAvailable();
    if (!available) {
      console.warn(
        "\n[SKIP] Docker not available; skipping execution flow test"
      );
      (global as any).__SKIP_EXEC__ = true;
    }
  });

  const shouldSkip = () => (global as any).__SKIP_EXEC__;

  it("starts a container", async () => {
    if (shouldSkip()) return; // skip gracefully
    const res = await request(app).post(`/execute/room/${roomId}/start`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "started" });
  });

  it("executes python code and returns output", async () => {
    if (shouldSkip()) return;
    const code = "print(3 * 7)";
    const res = await request(app)
      .post(`/execute/room/${roomId}/exec`)
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.output.replace(/\r?\n$/, "")).toBe("21");
  });

  it("executes another snippet reusing same container", async () => {
    if (shouldSkip()) return;
    const code = "print('second')";
    const res = await request(app)
      .post(`/execute/room/${roomId}/exec`)
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.output).toContain("second");
  });

  it("stops the container", async () => {
    if (shouldSkip()) return;
    const res = await request(app).post(`/execute/room/${roomId}/stop`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "stopped" });
  });

  it("restarts container implicitly on exec after stop", async () => {
    if (shouldSkip()) return;
    // After stop the room mapping is gone; exec should fail with 400 (room not running)
    // Then we start again and ensure exec works. This reflects explicit contract: start required before exec.
    let res = await request(app)
      .post(`/execute/room/${roomId}/exec`)
      .send({ code: "print('hello')" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");

    // Start again
    res = await request(app).post(`/execute/room/${roomId}/start`);
    expect(res.status).toBe(200);

    // Exec now should succeed
    res = await request(app)
      .post(`/execute/room/${roomId}/exec`)
      .send({ code: "print('world')" });
    expect(res.status).toBe(200);
    expect(res.body.output).toContain("world");
  });
});
