import { Router, Request, Response } from "express";
import { startContainer, execCode, stopContainer } from "../services/docker";

const router: ReturnType<typeof Router> = Router();
const rooms: Record<string, any> = {}; // roomId -> container instance

router.post("/room/:roomId/start", async (req: Request, res: Response) => {
  const { roomId } = req.params as { roomId: string };
  const container = await startContainer(roomId);
  rooms[roomId] = container;
  res.json({ status: "started" });
});

router.post("/room/:roomId/exec", async (req: Request, res: Response) => {
  const { roomId } = req.params as { roomId: string };
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: "code is required" });

  if (!rooms[roomId])
    return res.status(400).json({ error: "Room not running" });

  try {
    const output = await execCode(roomId, code);
    res.json({ output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[exe][route][exec] room=${roomId} error=`, err);
    res.status(500).json({ error: "execution_failed", message: msg });
  }
});

router.post("/room/:roomId/stop", async (req: Request, res: Response) => {
  const { roomId } = req.params as { roomId: string };
  if (rooms[roomId]) {
    await stopContainer(roomId);
    delete rooms[roomId];
  }
  res.json({ status: "stopped" });
});

export default router;
