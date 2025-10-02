import Docker from "dockerode";
import stream from "stream";

const docker = new Docker();
const roomContainers: Record<string, Docker.Container> = {};
const lastActivity: Record<string, number> = {}; // epoch ms of last activity per room
const IDLE_MS = 5 * 60 * 1000; // 5 minutes
let reaperStarted = false;

function markActivity(roomId: string) {
  lastActivity[roomId] = Date.now();
}

function startReaper() {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(async () => {
    const now = Date.now();
    for (const [roomId, ts] of Object.entries(lastActivity)) {
      if (now - ts >= IDLE_MS) {
        const c = roomContainers[roomId];
        if (c) {
          try {
            const inspect = await c.inspect();
            if (inspect.State.Running) {
              console.log(
                `[exe][docker] Idle timeout reached; stopping room ${roomId}`
              );
              await c.stop();
            }
          } catch (e) {
            console.warn(
              `[exe][docker] Idle stop failed for room ${roomId}:`,
              (e as any)?.message || e
            );
          }
        }
        delete roomContainers[roomId];
        delete lastActivity[roomId];
      }
    }
  }, 30_000).unref(); // check every 30s without holding event loop
}

export async function startContainer(roomId: string) {
  if (roomContainers[roomId]) {
    markActivity(roomId);
    return roomContainers[roomId];
  }
  const name = roomId;
  try {
    // If a container with the same name exists (leftover from crash), try to reattach
    const existing = await findContainerByName(name);
    if (existing) {
      const inspect = await existing.inspect();
      if (!inspect.State.Running) {
        try {
          await existing.start();
          console.log(`[exe][docker] Re-started existing container ${name}`);
        } catch (e) {
          console.warn(
            `[exe][docker] Failed to start existing container ${name}:`,
            e
          );
        }
      } else {
        console.log(`[exe][docker] Reusing running container ${name}`);
      }
      roomContainers[roomId] = existing;
      markActivity(roomId);
      startReaper();
      return existing;
    }

    console.log(
      `[exe][docker] Creating container name=${name} image=python:3.11-slim`
    );
    const container = await docker.createContainer({
      Image: "python:3.11-slim",
      name,
      // Keep container alive with a long-running Python sleep loop (no shell dependencies).
      Cmd: [
        "python3",
        "-c",
        "import time,sys;\nprint('container-ready', flush=True);\ntime.sleep(10**8)",
      ],
      Tty: false,
      OpenStdin: false,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: "none",
        Memory: 128 * 1024 * 1024,
        CpuShares: 512,
      },
    });
    await container.start();
    console.log(`[exe][docker] Started container ${name}`);
    roomContainers[roomId] = container;
    markActivity(roomId);
    startReaper();
    return container;
  } catch (err: any) {
    console.error(
      `[exe][docker] Failed to start container ${name}:`,
      err?.message || err
    );
    throw new Error(
      `Failed to start container for room ${roomId}: ${err?.message || err}`
    );
  }
}

async function findContainerByName(
  name: string
): Promise<Docker.Container | null> {
  try {
    const list = await docker.listContainers({ all: true });
    const info = list.find((c) => c.Names?.includes("/" + name));
    if (!info) return null;
    return docker.getContainer(info.Id);
  } catch (e) {
    console.warn(
      `[exe][docker] listContainers failed while searching for ${name}:`,
      e
    );
    return null;
  }
}

export async function execCode(roomId: string, code: string): Promise<string> {
  let container = roomContainers[roomId];
  if (!container) throw new Error("No container running for this room");
  markActivity(roomId);
  // TEMP DEBUG LOG: remove after verifying multiple exec flow
  console.log(
    `[exe][docker][exec] room=${roomId} codeSnippet=${JSON.stringify(
      code.length > 40 ? code.slice(0, 37) + "..." : code
    )}`
  );

  // Ensure container is still running; if not, attempt restart.
  try {
    const inspect = await container.inspect();
    if (!inspect.State.Running) {
      console.warn(
        `[exe][docker] Container for room ${roomId} not running (status=${inspect.State.Status}); attempting restart`
      );
      try {
        await container.start();
        console.log(`[exe][docker] Restarted container for room ${roomId}`);
      } catch (e) {
        console.warn(
          `[exe][docker] Restart failed; recreating container for room ${roomId}`
        );
        // Remove stale reference and recreate fully
        delete roomContainers[roomId];
        container = await startContainer(roomId);
      }
    }
  } catch (e) {
    console.warn(
      `[exe][docker] inspect failed before exec for room ${roomId}:`,
      e
    );
  }

  async function runExec(cmd: string[]): Promise<string> {
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });
    return new Promise<string>((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, streamObj) => {
        if (err) return reject(err);
        if (!streamObj) return resolve("");
        let output = "";
        const stdout = new stream.PassThrough();
        const stderr = new stream.PassThrough();
        (container as any).modem.demuxStream(streamObj, stdout, stderr);
        stdout.on("data", (c) => (output += c.toString()));
        stderr.on("data", (c) => (output += c.toString()));
        streamObj.on("end", () => resolve(output));
        streamObj.on("error", (e) => reject(e));
      });
    });
  }

  // Try python3, fallback to python
  try {
    const out = await runExec(["python3", "-c", code]);
    // TEMP RESULT LOG
    console.log(
      `[exe][docker][exec][result] room=${roomId} preview=${JSON.stringify(
        out.length > 60 ? out.slice(0, 57) + "..." : out
      )} length=${out.length}`
    );
    return out;
  } catch (primaryErr: any) {
    console.warn(
      `[exe][docker] python3 exec failed for room ${roomId}, attempting python fallback:`,
      primaryErr?.message || primaryErr
    );
    try {
      const out = await runExec(["python", "-c", code]);
      console.log(
        `[exe][docker][exec][result][fallback] room=${roomId} preview=${JSON.stringify(
          out.length > 60 ? out.slice(0, 57) + "..." : out
        )} length=${out.length}`
      );
      return out;
    } catch (fallbackErr: any) {
      throw new Error(
        `Exec failed (python3 + python fallback). Primary: ${primaryErr?.message || primaryErr}; Fallback: ${fallbackErr?.message || fallbackErr}`
      );
    }
  }
}

export async function stopContainer(roomId: string) {
  const container = roomContainers[roomId];
  if (!container) return;
  try {
    const inspect = await container.inspect();
    if (inspect.State.Running) {
      // Attempt a fast stop (t=0 sends SIGKILL immediately for most images)
      const stopPromise = container.stop({ t: 0 }).catch((e) => {
        console.warn(
          `[exe][docker] stop (t=0) failed for room ${roomId}, will fallback to kill:`,
          (e as any)?.message || e
        );
        return Promise.reject(e);
      });
      // Fallback kill if stop hangs beyond 3s
      const timed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(async () => {
          try {
            await container.kill();
            console.log(
              `[exe][docker] kill fallback executed for room ${roomId}`
            );
            resolve();
          } catch (killErr) {
            reject(killErr);
          }
        }, 3000).unref();
        stopPromise
          .then(() => {
            clearTimeout(timer);
            resolve();
          })
          .catch(() => {
            // stop already logged; wait for kill fallback timer
          });
      });
      await timed;
      console.log(`[exe][docker] Stopped container for room ${roomId}`);
    } else {
      console.log(
        `[exe][docker] Stop requested but container already not running room=${roomId}`
      );
    }
  } catch (e) {
    console.error(`[exe][docker] Error stopping container room=${roomId}:`, e);
  }
  delete roomContainers[roomId];
  delete lastActivity[roomId];
}

export function hasContainer(roomId: string) {
  return Boolean(roomContainers[roomId]);
}
