import { Router, Request, Response } from "express";
import { YjsDocumentManager } from "../services/yjsDocumentManager.service";
import {
  verifyToken,
  AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router: Router = Router();
const yjsManager = new YjsDocumentManager();

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

// Block management endpoints
router.get("/notebooks/:notebookId/blocks", (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const blocks = yjsManager.getBlocks(notebookId);
    res.json({ success: true, data: blocks });
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
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId } = req.params;
      const { type, position, language } = req.body;

      if (!type || position === undefined) {
        return res.status(400).json({
          success: false,
          error: "Type and position are required",
        });
      }

      const block = yjsManager.createBlock(
        notebookId,
        type,
        position,
        language
      );
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
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId, blockId } = req.params;
      const success = yjsManager.deleteBlock(notebookId, blockId);

      if (success) {
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
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notebookId, blockId } = req.params;
      const { position } = req.body;

      if (position === undefined) {
        return res.status(400).json({
          success: false,
          error: "Position is required",
        });
      }

      const success = yjsManager.moveBlock(notebookId, blockId, position);

      if (success) {
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
      
      // Simply return success since we're in-memory only
      res.json({
        success: true,
        message: "Document ready (in-memory mode)",
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
