/**
 * @jest-environment node
 */
jest.mock("@packages/supabase", () => require("../__mocks__/supabase"));

import {
  createNotebookCommit,
  getCommitSnapshot,
  restoreCommit,
} from "../../src/services/commitService";

describe("VCS commit service (notebook-wide)", () => {
  const roomId = "room-1";
  const notebookId = "nb-1";
  const userId = "user-1";

  it("creates a commit and returns it", async () => {
    // Seed role
    const { supabase } = require("../__mocks__/supabase");
    supabase
      .from("Room_users")
      .insert([{ room_id: roomId, uid: userId, type: "editor" }]);

    const snapshot = {
      cells: [
        {
          cell_type: "markdown",
          metadata: { id: "a1", language: "markdown" },
          source: ["# Title"],
        },
      ],
      metadata: { roomId, notebookId },
    };

    const result = await createNotebookCommit({
      roomId,
      notebookId,
      message: "init",
      userId,
      snapshot,
    });
    expect(result.message).toBe("Commit created");
    expect(result.commit).toBeTruthy();
  });

  it("returns snapshot for a commit and supports restore", async () => {
    const { supabase } = require("../__mocks__/supabase");
    const commitId = "c1";
    // Insert commit manually into mock table
    supabase.from("Commits").insert([
      {
        commit_id: commitId,
        room_id: roomId,
        notebook_id: notebookId,
        commit_message: "test",
        author_id: userId,
        snapshot_json: { cells: [], metadata: { roomId, notebookId } },
      },
    ]);

    const snap = await getCommitSnapshot(commitId);
    expect(snap).toHaveProperty("cells");

    // Seed role for restore
    supabase
      .from("Room_users")
      .insert([{ room_id: roomId, uid: userId, type: "owner" }]);
    const restored = await restoreCommit({ roomId, commitId, userId });
    expect(restored.snapshot).toBeTruthy();
  });
});
