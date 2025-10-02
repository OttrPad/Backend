import Docker from "dockerode";
import stream from "stream";
import { log } from "@ottrpad/logger";

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
              log.info(`Idle timeout reached; stopping room ${roomId}`);
              await c.stop();
            }
          } catch (e) {
            log.warn(`Idle stop failed for room ${roomId}`, {
              error: (e as any)?.message || e,
            });
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
          log.info(`Re-started existing container ${name}`);
        } catch (e) {
          log.warn(`Failed to start existing container ${name}`, { error: e });
        }
      } else {
        log.info(`Reusing running container ${name}`);
      }
      roomContainers[roomId] = existing;
      markActivity(roomId);
      startReaper();
      return existing;
    }

    log.info(`Creating container name=${name} image=python:3.11-slim`);
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
    log.info(`Started container ${name}`);
    roomContainers[roomId] = container;
    markActivity(roomId);
    startReaper();
    return container;
  } catch (err: any) {
    log.error(`Failed to start container ${name}`, {
      error: err?.message || err,
    });
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
    log.warn(`listContainers failed while searching for ${name}`, { error: e });
    return null;
  }
}

export async function execCode(roomId: string, code: string): Promise<string> {
  let container = roomContainers[roomId];
  if (!container) throw new Error("No container running for this room");
  markActivity(roomId);
  const startTs = Date.now();
  const codeSnippet = code.length > 60 ? code.slice(0, 57) + "..." : code;
  log.debug(`exec.start room=${roomId}`, { codeSnippet });

  // Ensure container is still running; if not, attempt restart.
  try {
    const inspect = await container.inspect();
    if (!inspect.State.Running) {
      log.warn(
        `Container not running; attempting restart room=${roomId} status=${inspect.State.Status}`
      );
      try {
        await container.start();
        log.info(`Restarted container for room ${roomId}`);
      } catch (e) {
        log.warn(`Restart failed; recreating container room=${roomId}`);
        // Remove stale reference and recreate fully
        delete roomContainers[roomId];
        container = await startContainer(roomId);
      }
    }
  } catch (e) {
    log.warn(`inspect failed before exec room=${roomId}`, { error: e });
  }

  async function runExec(
    cmd: string[]
  ): Promise<{ output: string; exitCode: number | null }> {
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });
    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, streamObj) => {
        if (err) return reject(err);
        if (!streamObj) return resolve({ output: "", exitCode: null });
        let output = "";
        const stdout = new stream.PassThrough();
        const stderr = new stream.PassThrough();
        (container as any).modem.demuxStream(streamObj, stdout, stderr);
        stdout.on("data", (c) => (output += c.toString()));
        stderr.on("data", (c) => (output += c.toString()));
        streamObj.on("end", async () => {
          try {
            const inspect = await exec.inspect();
            resolve({ output, exitCode: inspect.ExitCode });
          } catch {
            resolve({ output, exitCode: null });
          }
        });
        streamObj.on("error", (e) => reject(e));
      });
    });
  }

  // Try python3, fallback to python
  try {
    const { output, exitCode } = await runExec(["python3", "-c", code]);
    const durationMs = Date.now() - startTs;
    log.info(`exec.success room=${roomId}`, {
      lang: "python3",
      durationMs,
      exitCode,
      outPreview: output.length > 120 ? output.slice(0, 117) + "..." : output,
      outLength: output.length,
    });
    return output;
  } catch (primaryErr: any) {
    log.warn(`exec.fallback room=${roomId}`, {
      primaryError: primaryErr?.message || primaryErr,
    });
    try {
      const { output, exitCode } = await runExec(["python", "-c", code]);
      const durationMs = Date.now() - startTs;
      log.info(`exec.success room=${roomId}`, {
        lang: "python",
        durationMs,
        exitCode,
        outPreview: output.length > 120 ? output.slice(0, 117) + "..." : output,
        outLength: output.length,
        fallback: true,
      });
      return output;
    } catch (fallbackErr: any) {
      const durationMs = Date.now() - startTs;
      log.error(`exec.failure room=${roomId}`, {
        durationMs,
        primaryError: primaryErr?.message || primaryErr,
        fallbackError: fallbackErr?.message || fallbackErr,
      });
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
        log.warn(`stop (t=0) failed, will fallback to kill room=${roomId}`, {
          error: (e as any)?.message || e,
        });
        return Promise.reject(e);
      });
      // Fallback kill if stop hangs beyond 3s
      const timed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(async () => {
          try {
            await container.kill();
            log.info(`kill fallback executed room=${roomId}`);
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
      log.info(`Stopped container room=${roomId}`);
    } else {
      log.info(`Stop requested but container not running room=${roomId}`);
    }
  } catch (e) {
    log.error(`Error stopping container room=${roomId}`, { error: e });
  }
  delete roomContainers[roomId];
  delete lastActivity[roomId];
}

export function hasContainer(roomId: string) {
  return Boolean(roomContainers[roomId]);
}
