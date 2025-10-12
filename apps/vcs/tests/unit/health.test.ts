jest.mock("@packages/supabase", () => require("../__mocks__/supabase"));
import request from "supertest";
import app from "../../app";

describe("vcs service health endpoint", () => {
  it("returns operational status and service name", async () => {
    const res = await request(app).get("/status");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("Version Control");
    expect(res.body.status).toBe("operational");
  });
});
