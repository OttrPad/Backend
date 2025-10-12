import Docker from "dockerode";
import stream from "stream";
import { log } from "@ottrpad/logger";
import axios from "axios";
import crypto from "crypto";

// Feature flag: enable stateful Python sessions (single interpreter per room)
const EXE_STATEFUL = /^(1|true)$/i.test(process.env.EXE_STATEFUL || "");

// Python agent script that keeps a single interpreter alive and executes snippets
// in the same globals. Communicates over a Unix domain socket.
const PY_AGENT_SCRIPT = [
  "import socket, os, json, sys, traceback, contextlib, io",
  "sock_path='/tmp/ottrpad-agent.sock'",
  "try:\n    os.unlink(sock_path)\nexcept FileNotFoundError:\n    pass",
  "srv=socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)",
  "srv.bind(sock_path); srv.listen(5)",
  "globals_dict={}",
  // Main loop: accept -> read code -> exec -> send JSON response
  "print('agent-ready', flush=True)",
  "\nwhile True:\n    conn,_=srv.accept()\n    try:\n        data=b''\n        while True:\n            chunk=conn.recv(65536)\n            if not chunk: break\n            data+=chunk\n        code=data.decode('utf-8')\n        out=io.StringIO(); err=io.StringIO(); ok=True; em=None; tb=None\n        try:\n            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):\n                exec(code, globals_dict, globals_dict)\n        except Exception as e:\n            ok=False; em=str(e); tb=traceback.format_exc()\n        resp={'ok': ok, 'stdout': out.getvalue(), 'stderr': err.getvalue()}\n        if not ok:\n            resp['error']=em; resp['traceback']=tb\n        conn.sendall(json.dumps(resp).encode('utf-8'))\n    finally:\n        conn.close()",
].join("\n");

const docker = new Docker();
const roomContainers: Record<string, Docker.Container> = {};
const roomMeta: Record<
  string,
  { workspaceId: number; reqHash: string; allowedPackages: string[] }
> = {};
const lastActivity: Record<string, number> = {}; // epoch ms of last activity per room
const IDLE_MS = 5 * 60 * 1000; // 5 minutes
let reaperStarted = false;
// Serialize concurrent starts per room to avoid duplicate container create (409 name conflict)
const startLocks: Record<string, Promise<Docker.Container>> = {};

// Core service URL for internal lookups
const CORE_URL = process.env.CORE_SERVICE_URL || "http://localhost:3001";

// Build-time image used for both builder and runtime containers
const BASE_IMAGE = process.env.EXE_VENV_BASE_IMAGE || "python:3.11-slim";
const NETWORK_MODE = process.env.EXE_NETWORK_MODE || "none"; // set to 'bridge' if needed
// Optional: enable a shared pip cache volume to speed up builds across workspaces
const ENABLE_PIP_CACHE = !/^(0|false)$/i.test(
  process.env.EXE_VENV_PIP_CACHE || "1"
);
const PIP_CACHE_VOLUME =
  process.env.EXE_VENV_PIP_CACHE_VOLUME || "ottrpad-pip-cache";
// Optional: allow a mirror/extra index or extra args for pip
const PIP_INDEX_URL = process.env.EXE_VENV_PIP_INDEX_URL;
const PIP_EXTRA_INDEX_URL = process.env.EXE_VENV_PIP_EXTRA_INDEX_URL;
const EXTRA_PIP_ARGS = process.env.EXE_VENV_EXTRA_PIP_ARGS || "";
const STREAM_BUILD_LOGS = /^(1|true)$/i.test(
  process.env.EXE_VENV_STREAM_BUILD_LOGS || ""
);

// Compute a stable hash for requirements content
function normalizeRequirements(reqText: string): string {
  if (!reqText) return "";
  const seen = new Set<string>();
  const lines = reqText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    // strip inline comments: package==x  # comment
    .map((l) => l.replace(/\s+#.*$/, "").trim())
    // normalize whitespace around specifiers
    .map((l) => l.replace(/\s+/g, " "))
    // drop duplicates (exact line equality) to keep hash stable across minor formatting changes
    .filter((l) => {
      const key = l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort();
  return lines.join("\n");
}

function requirementsHash(reqText: string): string {
  const norm = normalizeRequirements(reqText);
  return crypto
    .createHash("sha256")
    .update(norm, "utf8")
    .digest("hex")
    .slice(0, 16);
}

async function ensureBaseImage() {
  try {
    const images = await docker.listImages();
    const found = images.some((img) =>
      (img.RepoTags || []).includes(BASE_IMAGE)
    );
    if (!found) {
      log.info("docker.pull_base_image.start", { image: BASE_IMAGE });
      await new Promise<void>((resolve, reject) => {
        docker.pull(BASE_IMAGE, (err: any, stream: any) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (e: any) => {
            if (e) reject(e);
            else resolve();
          });
        });
      });
      log.info("docker.pull_base_image.done", { image: BASE_IMAGE });
    }
  } catch (e: any) {
    log.warn("docker.pull_base_image.failed", { error: e?.message || e });
  }
}

async function fetchWorkspaceForRoom(
  roomId: string
): Promise<{ workspaceId: number; requirements: string }> {
  try {
    const byIdUrl = `${CORE_URL}/rooms/${encodeURIComponent(roomId)}`;
    const resp = await axios.get(byIdUrl, {
      timeout: 10000,
      headers: {
        "x-gateway-user-id": "system-exe",
        "x-gateway-user-email": "system-exe@internal",
        "x-original-url": `/internal/exe/rooms/${roomId}`,
      },
    });
    if (resp.status !== 200) throw new Error(`core responded ${resp.status}`);
    const room = resp.data?.room;
    const workspaceId = room?.workspace_id;
    if (!workspaceId && workspaceId !== 0)
      throw new Error("room has no workspace_id");
    const wsResp = await axios.get(`${CORE_URL}/workspaces/${workspaceId}`, {
      timeout: 10000,
      headers: {
        "x-gateway-user-id": "system-exe",
        "x-gateway-user-email": "system-exe@internal",
        "x-original-url": `/internal/exe/workspaces/${workspaceId}`,
      },
    });
    if (wsResp.status !== 200)
      throw new Error(`core ws responded ${wsResp.status}`);
    const requirements = wsResp.data?.workspace?.requirements || "";
    return {
      workspaceId: Number(workspaceId),
      requirements: String(requirements || ""),
    };
  } catch (e: any) {
    // Fall back: some callers may pass room code. Try lookup by code.
    try {
      const byCodeUrl = `${CORE_URL}/rooms/code/${encodeURIComponent(roomId)}`;
      const codeResp = await axios.get(byCodeUrl, {
        timeout: 10000,
        headers: {
          "x-gateway-user-id": "system-exe",
          "x-gateway-user-email": "system-exe@internal",
          "x-original-url": `/internal/exe/rooms/code/${roomId}`,
        },
      });
      if (codeResp.status !== 200)
        throw new Error(`core responded ${codeResp.status}`);
      const room = codeResp.data?.room;
      const workspaceId = room?.workspace_id;
      if (!workspaceId && workspaceId !== 0)
        throw new Error("room has no workspace_id");
      const wsResp = await axios.get(`${CORE_URL}/workspaces/${workspaceId}`, {
        timeout: 10000,
        headers: {
          "x-gateway-user-id": "system-exe",
          "x-gateway-user-email": "system-exe@internal",
          "x-original-url": `/internal/exe/workspaces/${workspaceId}`,
        },
      });
      if (wsResp.status !== 200)
        throw new Error(`core ws responded ${wsResp.status}`);
      const requirements = wsResp.data?.workspace?.requirements || "";
      return {
        workspaceId: Number(workspaceId),
        requirements: String(requirements || ""),
      };
    } catch (inner: any) {
      log.error("workspace.lookup.failed", {
        roomId,
        error: inner?.message || e?.message || e,
      });
      throw inner || e;
    }
  }
}

async function ensureVenvVolume(
  workspaceId: number,
  reqText: string
): Promise<{ volumeName: string; hash: string }> {
  const hash = requirementsHash(reqText);
  const volumeName = `ottrpad-venv-${hash}`;
  // Try to create volume (idempotent: will throw if exists)
  try {
    await docker.createVolume({
      Name: volumeName,
      Labels: {
        "ottrpad.kind": "venv",
        "ottrpad.requirements.hash": hash,
        "ottrpad.workspace_id": String(workspaceId),
      },
    });
    // Newly created volume: build venv contents
    log.info("venv.volume.created", { volumeName, hash, workspaceId });
    await buildVenvInVolume(volumeName, reqText);
  } catch (e: any) {
    // If volume exists, proceed; else rethrow
    const msg = e?.message || String(e);
    if (!/already exists|409/.test(msg)) {
      log.error("venv.volume.create_failed", { volumeName, error: msg });
      throw e;
    }
    log.info("venv.volume.exists", { volumeName });
  }
  return { volumeName, hash };
}

async function ensureNamedVolume(name: string) {
  try {
    await docker.createVolume({ Name: name });
    log.info("volume.created", { name });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (!/already exists|409/.test(msg)) {
      log.warn("volume.ensure_failed", { name, error: msg });
      throw e;
    }
  }
}

async function buildVenvInVolume(volumeName: string, reqText: string) {
  await ensureBaseImage();
  // Encode requirements to base64 to write file inside container
  const b64 = Buffer.from(String(reqText || "")).toString("base64");
  const pipIndexArgs = [
    PIP_INDEX_URL ? `--index-url ${PIP_INDEX_URL}` : "",
    PIP_EXTRA_INDEX_URL ? `--extra-index-url ${PIP_EXTRA_INDEX_URL}` : "",
    EXTRA_PIP_ARGS?.trim() ? `${EXTRA_PIP_ARGS}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const buildCmd = [
    "bash",
    "-lc",
    [
      `echo '${b64}' | base64 -d > /tmp/requirements.txt`,
      "python3 -m venv /opt/venv",
      // Keep pip cache enabled to leverage shared cache volume
      "/opt/venv/bin/pip install --upgrade pip",
      // Install requirements with optional index/mirror config
      `/opt/venv/bin/pip install ${pipIndexArgs} -r /tmp/requirements.txt`,
      // Harden: remove pip entrypoints so users cannot invoke pip easily in runtime
      "rm -f /opt/venv/bin/pip /opt/venv/bin/pip3 /opt/venv/bin/pip3.* || true",
    ].join(" && "),
  ];

  // Name builder containers deterministically so they are recognizable in Docker UI
  const builderName = `ottrpad-venv-build-${volumeName}`.replace(
    /[^a-zA-Z0-9_.-]/g,
    "-"
  );
  // Ensure a shared pip cache volume if enabled
  let mounts: any[] = [
    {
      Target: "/opt/venv",
      Source: volumeName,
      Type: "volume",
      ReadOnly: false,
    },
  ];
  if (ENABLE_PIP_CACHE) {
    try {
      await ensureNamedVolume(PIP_CACHE_VOLUME);
      mounts.push({
        Target: "/root/.cache/pip",
        Source: PIP_CACHE_VOLUME,
        Type: "volume",
        ReadOnly: false,
      });
    } catch (e) {
      // non-fatal
    }
  }

  // Remove any stale builder with the same name
  try {
    const stale = await findContainerByName(builderName);
    if (stale) {
      try {
        await stale.remove({ force: true });
      } catch {}
    }
  } catch {}

  const env: string[] = [];
  if (PIP_INDEX_URL) env.push(`PIP_INDEX_URL=${PIP_INDEX_URL}`);
  if (PIP_EXTRA_INDEX_URL)
    env.push(`PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL}`);

  const container = await docker.createContainer({
    Image: BASE_IMAGE,
    name: builderName,
    Cmd: buildCmd,
    Tty: false,
    OpenStdin: false,
    HostConfig: {
      AutoRemove: true,
      // Use default network for builds to access PyPI
      Mounts: mounts as any,
    } as any,
    Labels: {
      "ottrpad.kind": "venv-builder",
      "ottrpad.venv": volumeName,
    },
    Env: env,
  });
  let logsStream: any | undefined;
  try {
    await container.start();
    // Optionally stream pip logs during build
    if (STREAM_BUILD_LOGS) {
      try {
        const streamObj = await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
        } as any);
        const stdout = new stream.PassThrough();
        const stderr = new stream.PassThrough();
        (docker as any).modem.demuxStream(streamObj, stdout, stderr);
        stdout.on("data", (c) =>
          log.info("venv.build.stdout", {
            volumeName,
            chunk: c.toString().slice(0, 400),
          })
        );
        stderr.on("data", (c) =>
          log.warn("venv.build.stderr", {
            volumeName,
            chunk: c.toString().slice(0, 400),
          })
        );
        logsStream = streamObj;
      } catch (e: any) {
        log.warn("venv.build.log_attach_failed", {
          volumeName,
          error: e?.message || e,
        });
      }
    }
    // Wait for container to finish
    await container.wait();
    log.info("venv.built", { volumeName, builderName });
  } catch (e: any) {
    log.error("venv.build_failed", {
      volumeName,
      builderName,
      error: e?.message || e,
    });
    throw e;
  } finally {
    try {
      if (logsStream && typeof logsStream.destroy === "function") {
        logsStream.destroy();
      }
    } catch {}
    try {
      await container.remove({ force: true });
    } catch {}
  }
}

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
    log.info(`Already running container for room ${roomId}`);
    return roomContainers[roomId];
  }
  if (Object.prototype.hasOwnProperty.call(startLocks, roomId)) {
    // Another start is in progress; wait for it and return the same container
    return startLocks[roomId];
  }
  const name = roomId.replace(/[^a-zA-Z0-9_.-]/g, "-");
  startLocks[roomId] = (async () => {
    try {
      await ensureBaseImage();
      // Determine workspace and ensure venv
      const { workspaceId, requirements } = await fetchWorkspaceForRoom(roomId);
      const { volumeName, hash } = await ensureVenvVolume(
        workspaceId,
        requirements
      );
      // Prepare allowed packages list from normalized requirements
      const norm = normalizeRequirements(requirements);
      const allowedPackages = norm
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((p) => p.split(/[<>=!~ ]+/)[0].toLowerCase());
      roomMeta[roomId] = { workspaceId, reqHash: hash, allowedPackages };

      // If a container with the same name exists (leftover from crash), try to reattach
      const existing = await findContainerByName(name);
      if (existing) {
        const inspect = await existing.inspect();
        // Verify it has the expected venv mount; otherwise recreate
        const hasVenvMount = Array.isArray((inspect as any).Mounts)
          ? (inspect as any).Mounts.some(
              (m: any) =>
                m.Type === "volume" &&
                m.Name === volumeName &&
                m.Destination === "/opt/venv"
            )
          : false;
        if (!inspect.State.Running) {
          try {
            await existing.start();
            log.info(`Re-started existing container ${name}`);
          } catch (e) {
            log.warn(`Failed to start existing container ${name}`, {
              error: e,
            });
          }
        } else {
          log.info(`Reusing running container ${name}`);
        }
        if (hasVenvMount) {
          roomContainers[roomId] = existing;
          markActivity(roomId);
          startReaper();
          return existing;
        } else {
          log.warn("existing.container.missing_venv_mount - recreating", {
            roomId,
            expected: volumeName,
          });
          try {
            await existing.stop({ t: 0 });
          } catch {}
          try {
            await existing.remove({ force: true });
          } catch {}
        }
      }

      log.info(
        `Creating container name=${name} image=${BASE_IMAGE} mode=${EXE_STATEFUL ? "stateful" : "stateless"}`,
        { workspaceId, reqHash: hash }
      );
      let container: Docker.Container;
      try {
        container = await docker.createContainer({
          Image: BASE_IMAGE,
          name,
          // When stateful mode is enabled, start a Python agent that executes incoming
          // code snippets over a Unix socket in a shared globals namespace. Otherwise,
          // start an inert long-running process to keep the container alive.
          Cmd: EXE_STATEFUL
            ? ["python3", "-c", PY_AGENT_SCRIPT]
            : [
                "python3",
                "-c",
                "import time,sys;\nprint('container-ready', flush=True);\ntime.sleep(10**8)",
              ],
          Tty: false,
          OpenStdin: false,
          HostConfig: {
            AutoRemove: false,
            NetworkMode: NETWORK_MODE,
            Memory: 128 * 1024 * 1024,
            CpuShares: 512,
            Mounts: [
              {
                Target: "/opt/venv",
                Source: volumeName,
                Type: "volume",
                ReadOnly: true,
              } as any,
            ],
          },
          Labels: {
            "ottrpad.mode": EXE_STATEFUL ? "stateful" : "stateless",
            "ottrpad.workspace_id": String(workspaceId),
            "ottrpad.requirements.hash": hash,
          },
          Env: [
            "VIRTUAL_ENV=/opt/venv",
            "PYTHONNOUSERSITE=1",
            "PATH=/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          ],
        });
      } catch (createErr: any) {
        const msg = createErr?.message || String(createErr);
        if (/already in use|StatusCode: 409|code 409/i.test(msg)) {
          // Race: another start created the container first. Reattach to that one.
          const existing = await findContainerByName(name);
          if (existing) {
            const inspect = await existing.inspect();
            if (!inspect.State.Running) {
              try {
                await existing.start();
              } catch {}
            }
            roomContainers[roomId] = existing;
            markActivity(roomId);
            startReaper();
            return existing;
          }
          // If we didn't find it, rethrow original error
        }
        throw createErr;
      }
      await container.start();
      log.info(
        `Started container ${name} (${EXE_STATEFUL ? "stateful" : "stateless"})`
      );
      roomContainers[roomId] = container;
      // Ensure meta is present even if recreated
      if (!roomMeta[roomId]) {
        const norm2 = normalizeRequirements(requirements);
        roomMeta[roomId] = {
          workspaceId,
          reqHash: hash,
          allowedPackages: norm2
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((p) => p.split(/[<>=!~ ]+/)[0].toLowerCase()),
        };
      }
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
  })();
  try {
    const c = await startLocks[roomId];
    return c;
  } finally {
    delete startLocks[roomId];
  }
}

// Prewarm: Build venv volumes for all known workspaces without blocking startup
async function fetchAllWorkspaces(
  limit = 1000,
  offset = 0
): Promise<Array<{ workspace_id: number; requirements: string }>> {
  try {
    const resp = await axios.get(`${CORE_URL}/workspaces`, {
      params: { limit, offset },
      timeout: 15000,
      headers: {
        "x-gateway-user-id": "system-exe",
        "x-gateway-user-email": "system-exe@internal",
        "x-original-url": "/internal/exe/workspaces",
      },
    });
    const list = resp.data?.workspaces || [];
    return list.map((w: any) => ({
      workspace_id: Number(w.workspace_id),
      requirements: String(w.requirements || ""),
    }));
  } catch (e: any) {
    log.warn("prewarm.fetch_workspaces_failed", { error: e?.message || e });
    return [];
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        const r = await fn(items[i]);
        results[i] = r as any;
      } catch (e) {
        // keep going
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function prewarmAllVenvs(concurrency = 2) {
  try {
    const ws = await fetchAllWorkspaces();
    if (!ws.length) {
      log.info("prewarm.no_workspaces");
      return;
    }
    log.info("prewarm.start", { count: ws.length, concurrency });
    await mapWithConcurrency(ws, concurrency, async (w) => {
      const norm = normalizeRequirements(w.requirements);
      const { volumeName } = await ensureVenvVolume(w.workspace_id, norm);
      log.info("prewarm.venv_ready", {
        workspaceId: w.workspace_id,
        volumeName,
      });
    });
    log.info("prewarm.done");
  } catch (e: any) {
    log.warn("prewarm.failed", { error: e?.message || e });
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
  // Intercept attempts to install packages and return friendly guidance
  const installAttempt =
    /(^|\n|;)\s*(!\s*)?pip\s+install\b|python\s+-m\s+pip\b|pip\._internal|subprocess\..*pip\s+install|os\.system\(.*pip\s+install/i.test(
      code
    );
  if (installAttempt) {
    const allowed = roomMeta[roomId]?.allowedPackages || [];
    const list = allowed
      .slice(0, 50)
      .map((p) => `- ${p}`)
      .join("\n");
    const msg = [
      "Package installation is disabled in this environment.",
      "",
      "You can only use the preinstalled workspace packages:",
      list || "(no extra third‑party packages configured)",
      "",
      "To add more packages, update the workspace requirements and restart.",
    ].join("\n");
    log.info("exec.block_install", { roomId });
    return msg + "\n";
  }
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

  async function runAgent(pyCode: string): Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    error?: string;
    traceback?: string;
  } | null> {
    // Send code to the Unix socket using a small Python client. Encode payload as base64
    // to avoid quoting issues.
    const b64 = Buffer.from(pyCode, "utf8").toString("base64");
    const client = [
      "import socket, sys, base64",
      "sock_path='/tmp/ottrpad-agent.sock'",
      "code=base64.b64decode(sys.argv[1]).decode('utf-8')",
      "s=socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)",
      "s.connect(sock_path)",
      "s.sendall(code.encode('utf-8'))",
      "s.shutdown(socket.SHUT_WR)",
      "chunks=[]\nwhile True:\n    data=s.recv(65536)\n    if not data: break\n    chunks.append(data)",
      "s.close()",
      "sys.stdout.write(b''.join(chunks).decode('utf-8'))",
    ].join("\n");

    const { output } = await runExec(["python3", "-c", client, b64]);
    if (!output) return null;
    try {
      return JSON.parse(output);
    } catch (e) {
      // Agent may not be running or returned malformed data
      log.warn(`stateful.agent.parse_failed room=${roomId}`, {
        output: output?.slice(0, 200),
      });
      return null;
    }
  }

  if (EXE_STATEFUL) {
    try {
      const resp = await runAgent(code);
      if (resp && resp.ok) {
        const combined = `${resp.stdout}${resp.stderr}`;
        const durationMs = Date.now() - startTs;
        log.info(`exec.success room=${roomId}`, {
          mode: "stateful",
          durationMs,
          outPreview:
            combined.length > 120 ? combined.slice(0, 117) + "..." : combined,
          outLength: combined.length,
        });
        return combined;
      } else if (resp && !resp.ok) {
        const durationMs = Date.now() - startTs;
        log.warn(`exec.stateful.error room=${roomId}`, {
          error: resp.error,
          traceback: (resp.traceback || "").split("\n").slice(0, 3).join(" "),
          durationMs,
        });
        throw new Error(resp.error || "Execution error in stateful agent");
      }
      // If resp is null, fall through to stateless fallback
      log.warn(
        `stateful.agent.unavailable room=${roomId} -> falling back to stateless`
      );
    } catch (e) {
      log.warn(`stateful.exec.failed room=${roomId} -> falling back`, {
        error: (e as any)?.message || e,
      });
    }
  }

  // Stateless path: Try python3, fallback to python
  try {
    const { output, exitCode } = await runExec(["python3", "-c", code]);
    const durationMs = Date.now() - startTs;
    log.info(`exec.success room=${roomId}`, {
      mode: EXE_STATEFUL ? "fallback-stateless" : "stateless",
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
        mode: EXE_STATEFUL ? "fallback-stateless" : "stateless",
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
        mode: EXE_STATEFUL ? "fallback-stateless" : "stateless",
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

export async function getRoomStatus(roomId: string): Promise<{
  venv: "missing" | "building" | "ready" | "unknown";
  container: "running" | "stopped" | "absent";
  workspaceId?: number;
  requirementsHash?: string;
}> {
  let workspaceId: number | undefined = undefined;
  let reqHash: string | undefined = undefined;
  let venv: "missing" | "building" | "ready" | "unknown" = "unknown";
  try {
    const w = await fetchWorkspaceForRoom(roomId);
    workspaceId = w.workspaceId;
    const norm = normalizeRequirements(w.requirements);
    reqHash = requirementsHash(norm);
    const volumeName = `ottrpad-venv-${reqHash}`;

    // Determine venv status
    try {
      const vols = await (docker as any).listVolumes();
      const found = Array.isArray(vols?.Volumes)
        ? vols.Volumes.some((v: any) => v.Name === volumeName)
        : false;
      if (!found) {
        // If a builder is running, it's building; else missing
        const builders = await docker.listContainers({
          all: true,
          filters: {
            label: ["ottrpad.kind=venv-builder", `ottrpad.venv=${volumeName}`],
          } as any,
        });
        const building = builders.some((c) => c.State === "running");
        venv = building ? "building" : "missing";
      } else {
        // Volume exists; consider it ready unless a builder is still running
        const builders = await docker.listContainers({
          all: true,
          filters: {
            label: ["ottrpad.kind=venv-builder", `ottrpad.venv=${volumeName}`],
          } as any,
        });
        const building = builders.some((c) => c.State === "running");
        venv = building ? "building" : "ready";
      }
    } catch (e) {
      venv = "unknown";
    }
  } catch (e) {
    // Workspace lookup failed; leave venv unknown
    venv = "unknown";
  }

  // Container status
  let containerStatus: "running" | "stopped" | "absent" = "absent";
  try {
    let container = roomContainers[roomId];
    if (!container) {
      const existing = await findContainerByName(roomId);
      if (existing) container = existing;
    }
    if (container) {
      const inspect = await container.inspect();
      containerStatus = inspect.State.Running ? "running" : "stopped";
    }
  } catch {
    containerStatus = "absent";
  }

  return {
    venv,
    container: containerStatus,
    workspaceId,
    requirementsHash: reqHash,
  };
}
