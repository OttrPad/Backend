import { Router, Request, Response } from "express";
import { YjsDocumentManager } from "../services/yjsDocumentManager.service";
import {
  verifyToken,
  AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router: Router = Router();

// Helper function to get YJS manager from app locals
function getYjsManager(req: Request): YjsDocumentManager {
  return req.app.locals.realtimeService.getYjsManager();
}

const VERSION_CONTROL_BASE =
  (process.env.VERSION_CONTROL_SERVICE_URL || "http://localhost:5000") +
  "/api/version-control";
const INTERNAL_VCS_SECRET = process.env.VERSION_CONTROL_INTERNAL_SECRET || "";

// Health check endpoint
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "collaboration",
    features: [
      "real-time chat",
      "code collaboration",
      "notebook management",
      "yjs integration",
    ],
    timestamp: new Date().toISOString(),
  });
});

// Get collaboration room info
router.get(
  "/rooms/:roomId/info",
  verifyToken,
  (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;

    res.json({
      roomId,
      status: "active",
      userId: req.user?.id,
      userEmail: req.user?.email,
      features: {
        realTimeChat: true,
        codeCollaboration: true,
        notebookSupport: true,
        yjsIntegration: true,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// Notebook management endpoints
router.get("/rooms/:roomId/notebooks", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const yjsManager = getYjsManager(req);
    const notebooks = await yjsManager.getNotebooks(roomId);
    res.json({ success: true, data: notebooks });
  } catch (error) {
    console.error("Get notebooks error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notebooks",
      details: (error as Error).message,
    });
  }
});

router.post(
  "/rooms/:roomId/notebooks",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const { title } = req.body;
      const createdBy = req.user?.id!;
      const yjsManager = getYjsManager(req);

      if (!title) {
        return res.status(400).json({
          success: false,
          error: "Title is required",
        });
      }

      const notebook = await yjsManager.createNotebook(
        roomId,
        title,
        createdBy
      );

      // Broadcast the new notebook to all users in the room via Socket.IO
      const realtimeService = req.app.locals.realtimeService;
      if (realtimeService) {
        realtimeService.broadcastToRoom(roomId, "notebook:created", {
          notebook,
          createdBy: req.user?.email,
          timestamp: Date.now(),
        });
      }

      res.json({ success: true, data: notebook });
    } catch (error) {
      console.error("Create notebook error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create notebook",
        details: (error as Error).message,
      });
    }
  }
);

// Update notebook (rename)
router.put(
  "/notebooks/:notebookId",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId } = req.params;
      const { title } = req.body;
      const yjsManager = getYjsManager(req);

      if (!title) {
        return res.status(400).json({
          success: false,
          error: "Title is required",
        });
      }

      const updatedNotebook = await yjsManager.updateNotebook(notebookId, {
        title,
      });

      if (!updatedNotebook) {
        return res.status(404).json({
          success: false,
          error: "Notebook not found",
        });
      }

      // Broadcast the notebook update to all users in the room
      const realtimeService = req.app.locals.realtimeService;
      if (realtimeService) {
        // We need to find the room for this notebook first
        const notebook = await yjsManager.findNotebook(notebookId);
        if (notebook) {
          realtimeService.broadcastToRoom(notebook.roomId, "notebook:updated", {
            notebook: updatedNotebook,
            updatedBy: req.user?.email,
            timestamp: Date.now(),
          });
        }
      }

      res.json({ success: true, data: updatedNotebook });
    } catch (error) {
      console.error("Update notebook error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update notebook",
        details: (error as Error).message,
      });
    }
  }
);

// Delete notebook
router.delete(
  "/notebooks/:notebookId",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId } = req.params;
      const yjsManager = getYjsManager(req);

      // Get notebook info before deleting (to know which room to broadcast to)
      const notebook = await yjsManager.findNotebook(notebookId);

      const deleted = await yjsManager.deleteNotebook(notebookId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Notebook not found",
        });
      }

      // Broadcast the notebook deletion to all users in the room
      const realtimeService = req.app.locals.realtimeService;
      if (realtimeService && notebook) {
        realtimeService.broadcastToRoom(notebook.roomId, "notebook:deleted", {
          notebookId,
          deletedBy: req.user?.email,
          timestamp: Date.now(),
        });
      }

      res.json({
        success: true,
        message: "Notebook deleted successfully",
        data: { notebookId },
      });
    } catch (error) {
      console.error("Delete notebook error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete notebook",
        details: (error as Error).message,
      });
    }
  }
);

// Block management endpoints
router.get("/notebooks/:notebookId/blocks", (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const yjsManager = getYjsManager(req);
    const blocks = yjsManager.getBlocks(notebookId);

    // Enhance blocks with content
    const blocksWithContent = blocks.map((block) => {
      const ytext = yjsManager.getBlockText(notebookId, block.id);
      return {
        ...block,
        content: ytext ? ytext.toString() : "",
      };
    });

    res.json({ success: true, data: blocksWithContent });
  } catch (error) {
    console.error("Get blocks error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blocks",
      details: (error as Error).message,
    });
  }
});

router.post(
  "/notebooks/:notebookId/blocks",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId } = req.params;
      const { type, position, language } = req.body;
      const yjsManager = getYjsManager(req);

      if (!type || position === undefined) {
        return res.status(400).json({
          success: false,
          error: "Type and position are required",
        });
      }

      // Validate block type
      if (!["code", "markdown", "output"].includes(type)) {
        return res.status(400).json({
          success: false,
          error: "Invalid block type. Must be 'code', 'markdown', or 'output'",
        });
      }

      // Validate language for code blocks
      if (type === "code" && !language) {
        return res.status(400).json({
          success: false,
          error: "Language is required for code blocks",
        });
      }

      const block = yjsManager.createBlock(
        notebookId,
        type,
        position,
        language
      );

      // Broadcast the new block to all users in the room via Socket.IO
      const realtimeService = req.app.locals.realtimeService;
      if (realtimeService) {
        await realtimeService.broadcastBlockCreated(
          notebookId,
          block,
          req.user?.email
        );
      }

      res.json({ success: true, data: block });
    } catch (error) {
      console.error("Create block error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create block",
        details: (error as Error).message,
      });
    }
  }
);

router.delete(
  "/notebooks/:notebookId/blocks/:blockId",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId, blockId } = req.params;
      const yjsManager = getYjsManager(req);
      const success = yjsManager.deleteBlock(notebookId, blockId);

      if (success) {
        // Broadcast the block deletion to all users in the room
        const realtimeService = req.app.locals.realtimeService;
        if (realtimeService) {
          await realtimeService.broadcastBlockDeleted(
            notebookId,
            blockId,
            req.user?.email
          );
        }

        res.json({ success: true, message: "Block deleted successfully" });
      } else {
        res.status(404).json({ success: false, error: "Block not found" });
      }
    } catch (error) {
      console.error("Delete block error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete block",
        details: (error as Error).message,
      });
    }
  }
);

router.put(
  "/notebooks/:notebookId/blocks/:blockId/position",
  verifyToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId, blockId } = req.params;
      const { position } = req.body;
      const yjsManager = getYjsManager(req);

      if (position === undefined) {
        return res.status(400).json({
          success: false,
          error: "Position is required",
        });
      }

      const success = yjsManager.moveBlock(notebookId, blockId, position);

      if (success) {
        // Broadcast the block move to all users in the room
        const realtimeService = req.app.locals.realtimeService;
        if (realtimeService) {
          await realtimeService.broadcastBlockMoved(
            notebookId,
            blockId,
            position,
            req.user?.email
          );
        }

        res.json({ success: true, message: "Block moved successfully" });
      } else {
        res.status(404).json({ success: false, error: "Block not found" });
      }
    } catch (error) {
      console.error("Move block error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to move block",
        details: (error as Error).message,
      });
    }
  }
);

// Yjs document state endpoints
router.get("/notebooks/:notebookId/state", (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const yjsManager = getYjsManager(req);
    const state = yjsManager.getDocumentState(notebookId);

    // Convert Uint8Array to base64 for JSON serialization
    const stateBase64 = Buffer.from(state).toString("base64");

    res.json({ success: true, data: { state: stateBase64 } });
  } catch (error) {
    console.error("Get document state error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get document state",
      details: (error as Error).message,
    });
  }
});

router.get(
  "/notebooks/:notebookId/blocks/:blockId/content",
  (req: Request, res: Response) => {
    try {
      const { notebookId, blockId } = req.params;
      const yjsManager = getYjsManager(req);
      const ytext = yjsManager.getBlockText(notebookId, blockId);

      if (!ytext) {
        return res
          .status(404)
          .json({ success: false, error: "Block not found" });
      }

      const content = ytext.toString();
      res.json({ success: true, data: { content } });
    } catch (error) {
      console.error("Get block content error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get block content",
        details: (error as Error).message,
      });
    }
  }
);

// Load document from in-memory state
router.post(
  "/notebooks/:notebookId/load",
  async (req: Request, res: Response) => {
    try {
      const { notebookId } = req.params;
      const yjsManager = getYjsManager(req);
      // If doc not loaded, try auto-restore latest temp snapshot, else noop
      if (!yjsManager.hasDocument(notebookId)) {
        try {
          // Query VCS for latest commit for this notebook marked as temp/hidden
          const qs = new URLSearchParams({
            notebookId,
            type: "temp",
            limit: "1",
          }).toString();
          const resp = await fetch(`${VERSION_CONTROL_BASE}/commits?${qs}`, {
            headers: {
              accept: "application/json",
              "x-internal-secret": INTERNAL_VCS_SECRET,
            },
          });
          if (resp.ok) {
            const json = await resp.json();
            const tempCommit = (json?.commits || [])[0];
            if (tempCommit?.commit_id) {
              const snapResp = await fetch(
                `${VERSION_CONTROL_BASE}/commits/${tempCommit.commit_id}/snapshot`,
                { headers: { "x-internal-secret": INTERNAL_VCS_SECRET } as any }
              );
              if (snapResp.ok) {
                const snapshot = await snapResp.json();
                yjsManager.applySnapshot(notebookId, snapshot);
                // Optionally delete the temp commit now (best-effort)
                await fetch(
                  `${VERSION_CONTROL_BASE}/commits/${tempCommit.commit_id}`,
                  {
                    method: "DELETE",
                    headers: {
                      "x-internal-secret": INTERNAL_VCS_SECRET,
                    } as any,
                  }
                );
              }
            }
          }
        } catch (e) {
          // best effort only
          console.warn("Temp auto-restore failed:", e);
        }
      }

      res.json({
        success: true,
        message: "Document ready",
        data: { notebookId },
      });
    } catch (error) {
      console.error("Load document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to prepare document",
        details: (error as Error).message,
      });
    }
  }
);

export default router;
// Apply a full notebook snapshot (server-side restore)
router.post(
  "/notebooks/:notebookId/restore",
  async (req: Request, res: Response) => {
    try {
      const { notebookId } = req.params;
      const snapshot = req.body as {
        cells: Array<{
          cell_type: string;
          metadata: { id?: string; language?: string; [k: string]: any };
          source: string[];
          outputs?: any[];
        }>;
        metadata?: Record<string, any>;
      };

      const yjsManager = getYjsManager(req);
      // Reset doc by creating a new Y.Doc internally
      const ydoc = yjsManager.getDocument(notebookId);
      const blocks = ydoc.getMap("blocks");
      const blockContent = ydoc.getMap("blockContent");
      // Clear existing
      Array.from(blocks.keys()).forEach((k) => blocks.delete(k as any));
      Array.from(blockContent.keys()).forEach((k) =>
        blockContent.delete(k as any)
      );

      // Rebuild from snapshot
      let position = 0;
      for (const cell of snapshot.cells || []) {
        const id =
          cell.metadata?.id ||
          `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        blocks.set(id, {
          id,
          type: cell.cell_type === "code" ? "code" : "markdown",
          language: cell.metadata?.language,
          position: position++,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any);
        const ytext =
          yjsManager.getBlockText(notebookId, id) ||
          new (require("yjs").Text)();
        // If new, need to set into map
        if (!yjsManager.getBlockText(notebookId, id)) {
          blockContent.set(id, ytext as any);
        }
        (ytext as any).delete(0, (ytext as any).length || 0);
        (ytext as any).insert(0, (cell.source || []).join("\n"));
      }

      res.json({ success: true, data: { notebookId } });
    } catch (error) {
      console.error("Restore notebook error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to restore notebook" });
    }
  }
);
