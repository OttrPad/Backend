import express, { Application } from "express";
import { createServer } from "http";
import cors from "cors";
import RealtimeCollaborationService from "./services/realtimeCollaborationService";
import collaborationRoutes from "./routes/collaboration.routes";

const app: Application = express();
const httpServer = createServer(app);

// Environment variables with defaults
const PORT = process.env.COLLABORATION_HTTP_PORT || 5002;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const REAPER_ENABLED =
  (process.env.COLLAB_REAPER_ENABLED || "true").toLowerCase() === "true";
const ROOM_IDLE_TTL_MS = parseInt(
  process.env.COLLAB_ROOM_IDLE_TTL_MS || "600000"
); // 10 min default (increased from 5min to prevent premature cleanup)
const REAPER_INTERVAL_MS = parseInt(
  process.env.COLLAB_REAPER_INTERVAL_MS || "120000"
); // 2 min default (increased from 1min to reduce aggressive checking)
const VERSION_CONTROL_BASE =
  (process.env.VERSION_CONTROL_SERVICE_URL || "http://localhost:5000") +
  "/api/version-control";
const INTERNAL_VCS_SECRET = process.env.VERSION_CONTROL_INTERNAL_SECRET || "";

// Middleware
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "collaboration",
    timestamp: new Date().toISOString(),
  });
});

// Initialize realtime collaboration service
const realtimeService = new RealtimeCollaborationService(httpServer);

// Attach service to routes for access (simplified approach)
app.locals.realtimeService = realtimeService;

// API routes
app.use("/api/collaboration", collaborationRoutes);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Collaboration Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for: ${FRONTEND_URL}`);
});

// --- Idle Reaper: stash temp commits and unload Yjs docs when room is idle ---
type TempCommitResponse = { message: string; commit: { commit_id: string } };

async function createTempCommit(
  roomId: string,
  notebookId: string,
  snapshot: any
) {
  try {
    const res = await fetch(`${VERSION_CONTROL_BASE}/commits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // mark as temp so VCS can hide it from timelines
        "x-commit-temp": "true",
        "x-internal-secret": INTERNAL_VCS_SECRET,
        // In production this call should come via API gateway to include auth headers.
      },
      body: JSON.stringify({
        roomId,
        notebookId,
        message: "[temp] autosave before idle eviction",
        snapshot,
      }),
    });
    if (!res.ok) throw new Error(`VCS temp commit failed: ${res.status}`);
    const data = (await res.json()) as TempCommitResponse;
    return data.commit.commit_id;
  } catch (e) {
    console.warn(`⚠️ Temp commit failed for room=${roomId}`, e);
    return null;
  }
}

async function runIdleReaper() {
  if (!REAPER_ENABLED) return;
  const yjs = realtimeService.getYjsManager();
  const now = Date.now();
  const rooms = yjs.getAllRooms();
  const GRACE_PERIOD_MS = 30000; // 30 seconds grace period for page reloads
  
  for (const room of rooms) {
    const participantsCount =
      (realtimeService as any).getRoomParticipants?.(room.roomId)?.length || 0;
    const idleFor = now - (room.lastActivity || 0);
    
    // Only reap if:
    // 1. No participants are connected AND
    // 2. Room has been idle for longer than TTL AND
    // 3. There has been some activity (lastActivity exists) AND
    // 4. Idle time is SIGNIFICANTLY longer than TTL (not just barely over)
    // This prevents reaping during brief disconnects (page reloads)
    const isReallyIdle = idleFor > (ROOM_IDLE_TTL_MS + GRACE_PERIOD_MS);
    
    if (participantsCount === 0 && room.lastActivity && isReallyIdle) {
      try {
        console.log(`🧹 Reaping idle room ${room.roomId} (idle ${Math.round(idleFor/1000)}s, participants: ${participantsCount})`);
        // For each notebook in this room: export snapshot and create temp commit
        const roomNotebooks = await yjs.getNotebooks(room.roomId);
        for (const nb of roomNotebooks) {
          try {
            const snapshot = yjs.exportNotebookSnapshot(nb.id);
            await createTempCommit(room.roomId, nb.id, snapshot);
          } catch (e) {
            console.warn(`⚠️ Failed temp-stash for notebook ${nb.id}`, e);
          }
        }
        // Unload Yjs docs for the room to free memory
        yjs.unloadRoomDocs(room.roomId);
      } catch (e) {
        console.error(`Idle reaper error for room ${room.roomId}:`, e);
      }
    }
  }
}

if (REAPER_ENABLED) {
  console.log(
    `🕰️ Idle reaper enabled: TTL=${ROOM_IDLE_TTL_MS}ms, interval=${REAPER_INTERVAL_MS}ms`
  );
  setInterval(runIdleReaper, REAPER_INTERVAL_MS).unref?.();
}

export { app, httpServer, realtimeService };
