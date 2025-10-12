/**
 * @jest-environment node
 */
jest.mock("@packages/supabase", () => require("../__mocks__/supabase"));

import request from "supertest";
import app from "../../app";
import { getCommitTimelineService } from "../../src/services/versionControlService";

describe("VCS milestones and timeline", () => {
  const roomId = "room-2";
  const userId = "owner-2";
  const commitId = "commit-xyz";
  const internalSecret = "test-secret";

  beforeAll(() => {
    process.env.VERSION_CONTROL_INTERNAL_SECRET = internalSecret;
  });

  it("creates, lists, and deletes milestones", async () => {
    const { supabase } = require("../__mocks__/supabase");
    // Seed owner role for roleCheck.middleware (uses Allowed_emails)
    supabase
      .from("Allowed_emails")
      .insert([
        { room_id: roomId, email: "owner@example.com", access_level: "owner" },
      ]);
    // Seed Room_users for milestoneService internal check
    supabase
      .from("Room_users")
      .insert([{ room_id: roomId, uid: userId, type: "owner" }]);
    // Seed a commit to point to
    supabase.from("Commits").insert([
      {
        commit_id: commitId,
        room_id: roomId,
        notebook_id: "nb-2",
        author_id: userId,
        snapshot_json: { cells: [], metadata: {} },
        commit_message: "seed",
      },
    ]);

    // Create milestone via controller (simulate gateway headers)
    const res = await request(app)
      .post("/api/version-control/milestones")
      .set("x-gateway-user-id", userId)
      .set("x-gateway-user-email", "owner@example.com")
      .set("x-original-url", "/api/version-control/milestones")
      .send({
        roomId,
        milestoneName: "M1",
        milestoneNotes: "Notes MD",
        commitId,
      });
    expect(res.status).toBe(201);
    expect(res.body?.milestone).toBeTruthy();

    // Get list
    const list = await request(app)
      .get(`/api/version-control/milestones/${roomId}`)
      .set("x-gateway-user-id", userId)
      .set("x-gateway-user-email", "owner@example.com")
      .set("x-original-url", `/api/version-control/milestones/${roomId}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body?.milestones)).toBe(true);
    const mid =
      list.body.milestones[0]?.milestone_id || list.body.milestones[0]?.id;

    // Delete
    const del = await request(app)
      .delete(`/api/version-control/milestones/${roomId}/${mid}`)
      .set("x-gateway-user-id", userId)
      .set("x-gateway-user-email", "owner@example.com")
      .set(
        "x-original-url",
        `/api/version-control/milestones/${roomId}/${mid}`
      );
    expect(del.status).toBe(200);
  });

  it("internal endpoint returns latest temp commit", async () => {
    const { supabase } = require("../__mocks__/supabase");
    const nb = "nb-temp";
    // Seed commits: one hidden temp, one normal
    supabase.from("Commits").insert([
      {
        commit_id: "c-temp",
        room_id: roomId,
        notebook_id: nb,
        author_id: userId,
        snapshot_json: {},
        commit_type: "temp",
        hidden: true,
        commit_message: "temp",
      },
      {
        commit_id: "c-norm",
        room_id: roomId,
        notebook_id: nb,
        author_id: userId,
        snapshot_json: {},
        commit_type: "normal",
        hidden: false,
        commit_message: "norm",
      },
    ]);

    const r = await request(app)
      .get(
        `/api/version-control/commits?notebookId=${encodeURIComponent(nb)}&type=temp&limit=1`
      )
      .set("x-internal-secret", internalSecret);
    expect(r.status).toBe(200);
    expect(r.body?.commits?.[0]?.commit_id).toBe("c-temp");
  });

  it("timeline excludes hidden commits", async () => {
    const { supabase } = require("../__mocks__/supabase");
    supabase.from("Commits").insert([
      {
        commit_id: "c1",
        room_id: roomId,
        notebook_id: "nb-3",
        author_id: userId,
        snapshot_json: {},
        hidden: false,
        commit_message: "visible",
      },
      {
        commit_id: "c2",
        room_id: roomId,
        notebook_id: "nb-3",
        author_id: userId,
        snapshot_json: {},
        hidden: true,
        commit_message: "hidden",
      },
    ]);
    const timeline = await getCommitTimelineService(roomId);
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.find((c: any) => c.commit_id === "c2")).toBeUndefined();
  });
});
