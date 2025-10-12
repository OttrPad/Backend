import fs from "fs";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";

let cached: { git: SimpleGit; repoDir: string } | null = null;

export async function getGitRepo(): Promise<{
  git: SimpleGit;
  repoDir: string;
}> {
  if (cached) return cached;
  const baseDir = process.env.VERSION_CONTROL_GIT_DIR
    ? path.resolve(process.env.VERSION_CONTROL_GIT_DIR)
    : path.resolve(process.cwd(), "data/git-mirror");

  // Ensure directory exists
  fs.mkdirSync(baseDir, { recursive: true });

  const git = simpleGit({ baseDir });

  // Initialize repo if needed
  const gitDir = path.join(baseDir, ".git");
  if (!fs.existsSync(gitDir)) {
    await git.init();
    // Set default user config for commits
    await git.addConfig(
      "user.name",
      process.env.VERSION_CONTROL_GIT_USER_NAME || "VCS Bot"
    );
    await git.addConfig(
      "user.email",
      process.env.VERSION_CONTROL_GIT_USER_EMAIL || "vcs@ottrpad.local"
    );
  }

  cached = { git, repoDir: baseDir };
  return cached;
}

export function snapshotFilePath(
  repoDir: string,
  roomId: string,
  notebookId: string
): string {
  const roomDir = path.join(repoDir, `room_${roomId}`);
  fs.mkdirSync(roomDir, { recursive: true });
  return path.join(roomDir, `notebook_${notebookId}.json`);
}

export async function writeSnapshotToRepo(
  repoDir: string,
  roomId: string,
  notebookId: string,
  snapshot: any
): Promise<string> {
  const file = snapshotFilePath(repoDir, roomId, notebookId);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
  return file;
}
