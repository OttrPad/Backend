import * as Y from "yjs";
import {
  NotebookDocument,
  NotebookBlock,
  YjsNotebookData,
  CollaborationRoom,
} from "../types/notebook.types";

export class YjsDocumentManager {
  private documents: Map<string, Y.Doc> = new Map(); // notebookId -> Y.Doc
  private rooms: Map<string, CollaborationRoom> = new Map(); // roomId -> room data
  private inMemoryNotebooks: Map<string, NotebookDocument[]> = new Map(); // roomId -> notebooks

  constructor() {
    console.log("🗄️ YjsDocumentManager initialized (In-Memory Only)");
  }

  /**
   * Get or create a Y.Doc for a notebook
   */
  getDocument(notebookId: string): Y.Doc {
    if (!this.documents.has(notebookId)) {
      const ydoc = new Y.Doc();
      this.documents.set(notebookId, ydoc);
      this.initializeDocument(ydoc, notebookId);
    }
    return this.documents.get(notebookId)!;
  }

  /** Check if a Y.Doc is currently loaded for this notebook */
  hasDocument(notebookId: string): boolean {
    return this.documents.has(notebookId);
  }

  /**
   * Bump room last activity timestamp (noop if room not yet initialized)
   */
  bumpRoomActivity(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.lastActivity = Date.now();
    }
  }

  /**
   * Initialize a new Y.Doc with the required structure
   */
  private initializeDocument(ydoc: Y.Doc, notebookId: string): void {
    // Create the shared data structures
    const blocks = ydoc.getMap("blocks"); // Map of blockId -> NotebookBlock
    const blockContent = ydoc.getMap("blockContent"); // Map of blockId -> Y.Text
    const metadata = ydoc.getMap("metadata"); // Notebook metadata

    // Set initial metadata
    metadata.set("notebookId", notebookId);
    metadata.set("createdAt", Date.now());
    metadata.set("version", 1);
  }

  /**
   * Create a new notebook in a room (in-memory only)
   */
  async createNotebook(
    roomId: string,
    title: string,
    createdBy: string
  ): Promise<NotebookDocument> {
    const notebookId = `notebook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const notebook: NotebookDocument = {
      id: notebookId,
      title,
      roomId,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Store in memory
    if (!this.inMemoryNotebooks.has(roomId)) {
      this.inMemoryNotebooks.set(roomId, []);
    }
    this.inMemoryNotebooks.get(roomId)!.push(notebook);

    // Initialize Y.Doc
    const ydoc = this.getDocument(notebookId);
    const metadata = ydoc.getMap("metadata");
    metadata.set("title", title);
    metadata.set("roomId", roomId);
    metadata.set("createdBy", createdBy);

    // Add to room
    this.addNotebookToRoom(roomId, notebookId);

    // Create a default code block
    this.createBlock(notebookId, "code", 0, "python");

    // Activity bump
    this.bumpRoomActivity(roomId);

    return notebook;
  }

  /**
   * Get all notebooks for a room (from memory)
   */
  async getNotebooks(roomId: string): Promise<NotebookDocument[]> {
    const notebooks = this.inMemoryNotebooks.get(roomId) || [];
    return notebooks.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Update a notebook (rename/modify)
   */
  async updateNotebook(
    notebookId: string,
    updates: { title?: string }
  ): Promise<NotebookDocument | null> {
    // Find the notebook across all rooms
    for (const [roomId, notebooks] of this.inMemoryNotebooks.entries()) {
      const notebookIndex = notebooks.findIndex((nb) => nb.id === notebookId);
      if (notebookIndex !== -1) {
        const notebook = notebooks[notebookIndex];

        // Update the notebook
        const updatedNotebook = {
          ...notebook,
          ...updates,
          updatedAt: Date.now(),
        };

        // Update in memory
        notebooks[notebookIndex] = updatedNotebook;

        // Update Y.Doc metadata
        const ydoc = this.getDocument(notebookId);
        const metadata = ydoc.getMap("metadata");
        if (updates.title) {
          metadata.set("title", updates.title);
        }
        metadata.set("updatedAt", Date.now());

        // Activity bump
        const room = this.rooms.get(roomId);
        if (room) room.lastActivity = Date.now();

        return updatedNotebook;
      }
    }

    return null; // Notebook not found
  }

  /**
   * Delete a notebook
   */
  async deleteNotebook(notebookId: string): Promise<boolean> {
    // Find and remove the notebook across all rooms
    for (const [roomId, notebooks] of this.inMemoryNotebooks.entries()) {
      const notebookIndex = notebooks.findIndex((nb) => nb.id === notebookId);
      if (notebookIndex !== -1) {
        // Remove from memory
        notebooks.splice(notebookIndex, 1);

        // Clean up Y.Doc
        this.documents.delete(notebookId);

        // Remove from room
        this.removeNotebookFromRoom(roomId, notebookId);

        // Activity bump
        this.bumpRoomActivity(roomId);

        return true;
      }
    }

    return false; // Notebook not found
  }

  /**
   * Create a new block in a notebook
   */
  createBlock(
    notebookId: string,
    type: "code" | "markdown" | "output",
    position: number,
    language?: string
  ): NotebookBlock {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");
    const blockContent = ydoc.getMap("blockContent");

    const blockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const block: NotebookBlock = {
      id: blockId,
      type,
      language,
      position,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Add block metadata
    blocks.set(blockId, block);

    // Create Y.Text for block content
    const ytext = new Y.Text();
    blockContent.set(blockId, ytext);

    // Bump activity for the room this notebook belongs to
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);

    return block;
  }

  /**
   * Delete a block from a notebook
   */
  deleteBlock(notebookId: string, blockId: string): boolean {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");
    const blockContent = ydoc.getMap("blockContent");

    if (!blocks.has(blockId)) {
      return false;
    }

    blocks.delete(blockId);
    blockContent.delete(blockId);

    // Activity bump
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);

    return true;
  }

  /**
   * Move a block to a new position
   */
  moveBlock(notebookId: string, blockId: string, newPosition: number): boolean {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");

    const block = blocks.get(blockId) as NotebookBlock;
    if (!block) {
      return false;
    }

    block.position = newPosition;
    block.updatedAt = Date.now();
    blocks.set(blockId, block);

    // Activity bump
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);

    return true;
  }

  /**
   * Get all blocks for a notebook, sorted by position
   */
  getBlocks(notebookId: string): NotebookBlock[] {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");

    const blockArray: NotebookBlock[] = [];
    blocks.forEach((block) => {
      blockArray.push(block as NotebookBlock);
    });

    return blockArray.sort((a, b) => a.position - b.position);
  }

  /**
   * Get the Y.Text for a specific block
   */
  getBlockText(notebookId: string, blockId: string): Y.Text | null {
    const ydoc = this.getDocument(notebookId);
    const blockContent = ydoc.getMap("blockContent");
    return (blockContent.get(blockId) as Y.Text) || null;
  }

  /**
   * Apply a Yjs update to a document
   */
  applyUpdate(notebookId: string, update: Uint8Array): void {
    const ydoc = this.getDocument(notebookId);
    Y.applyUpdate(ydoc, update);
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);
  }

  /**
   * Get the current state of a document for synchronization
   */
  getDocumentState(notebookId: string): Uint8Array {
    const ydoc = this.getDocument(notebookId);
    return Y.encodeStateAsUpdate(ydoc);
  }

  /**
   * Add a notebook to a room's tracking
   */
  private addNotebookToRoom(roomId: string, notebookId: string): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        notebooks: new Map(),
        participants: new Map(),
        chatHistory: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      });
    }

    const room = this.rooms.get(roomId)!;
    const ydoc = this.getDocument(notebookId);

    room.notebooks.set(notebookId, {
      blocks: ydoc.getMap("blocks") as any,
      blockContent: ydoc.getMap("blockContent") as any,
      metadata: ydoc.getMap("metadata") as any,
    });
    room.lastActivity = Date.now();
  }

  /**
   * Remove a notebook from a room's tracking
   */
  private removeNotebookFromRoom(roomId: string, notebookId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.notebooks.delete(notebookId);
      room.lastActivity = Date.now();
    }
  }

  /**
   * Get a room's data
   */
  getRoom(roomId: string): CollaborationRoom | null {
    return this.rooms.get(roomId) || null;
  }

  /**
   * List all tracked rooms
   */
  getAllRooms(): CollaborationRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Find a notebook by ID and return it with its room information
   */
  async findNotebook(notebookId: string): Promise<NotebookDocument | null> {
    // Search through all rooms to find the notebook
    for (const [roomId, notebooks] of this.inMemoryNotebooks.entries()) {
      const notebook = notebooks.find((nb) => nb.id === notebookId);
      if (notebook) {
        return notebook;
      }
    }
    return null;
  }

  // Synchronous variant to avoid async in hot paths
  private findNotebookSync(notebookId: string): NotebookDocument | null {
    for (const notebooks of this.inMemoryNotebooks.values()) {
      const nb = notebooks.find((n) => n.id === notebookId);
      if (nb) return nb;
    }
    return null;
  }

  /**
   * Export notebook as a snapshot compatible with VCS commits
   */
  exportNotebookSnapshot(notebookId: string): {
    cells: Array<{
      cell_type: string;
      metadata: { id?: string; language?: string; [k: string]: any };
      source: string[];
      outputs?: any[];
    }>;
    metadata?: Record<string, any>;
  } {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");
    const blockContent = ydoc.getMap("blockContent");

    const items: any[] = [];
    blocks.forEach((b, id) => {
      const block = b as NotebookBlock;
      const ytext = blockContent.get(id as string) as Y.Text;
      items.push({
        block,
        id: id as string,
        text: ytext ? ytext.toString() : "",
      });
    });
    items.sort((a, b) => a.block.position - b.block.position);

    const cells = items.map((it) => ({
      cell_type: it.block.type === "code" ? "code" : "markdown",
      metadata: { id: it.id, language: it.block.language },
      source: (it.text || "").split("\n"),
      outputs: [],
    }));

    const metadata = (ydoc.getMap("metadata") as any)?.toJSON?.() || {};

    return { cells, metadata };
  }

  /**
   * Apply a full snapshot to a notebook (reset and rebuild)
   */
  applySnapshot(
    notebookId: string,
    snapshot: {
      cells: Array<{
        cell_type: string;
        metadata: { id?: string; language?: string; [k: string]: any };
        source: string[];
        outputs?: any[];
      }>;
      metadata?: Record<string, any>;
    }
  ): void {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");
    const blockContent = ydoc.getMap("blockContent");
    // Clear
    Array.from(blocks.keys()).forEach((k) => blocks.delete(k as any));
    Array.from(blockContent.keys()).forEach((k) =>
      blockContent.delete(k as any)
    );

    // Rebuild
    let position = 0;
    for (const cell of snapshot.cells || []) {
      const id =
        (cell.metadata && cell.metadata.id) ||
        `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      blocks.set(id, {
        id,
        type: cell.cell_type === "code" ? "code" : "markdown",
        language: cell.metadata?.language,
        position: position++,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any);
      let ytext = blockContent.get(id) as Y.Text;
      if (!ytext) {
        ytext = new Y.Text();
        blockContent.set(id, ytext as any);
      }
      // Replace content
      (ytext as any).delete(0, (ytext as any).length || 0);
      (ytext as any).insert(0, (cell.source || []).join("\n"));
    }

    // Activity bump
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);
  }

  /**
   * Unload Yjs docs for all notebooks in a room (keep notebook metadata list)
   */
  unloadRoomDocs(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const notebookId of Array.from(room.notebooks.keys())) {
      // Destroy Y.Doc instance and remove from maps
      const ydoc = this.documents.get(notebookId);
      if (ydoc) {
        try {
          ydoc.destroy();
        } catch {}
        this.documents.delete(notebookId);
      }
    }
    // Clear notebook Yjs references but keep room entry to track activity
    room.notebooks.clear();
    room.lastActivity = Date.now();
  }

  /**
   * Restore a notebook from a snapshot (e.g., from a hidden auto-commit)
   */
  restoreNotebookFromSnapshot(notebookId: string, snapshot: any): void {
    const ydoc = this.getDocument(notebookId);
    const blocks = ydoc.getMap("blocks");
    const blockContent = ydoc.getMap("blockContent");

    // Clear existing blocks
    const existingBlockIds = Array.from(blocks.keys());
    existingBlockIds.forEach((blockId) => {
      blocks.delete(blockId);
      blockContent.delete(blockId);
    });

    // Restore blocks from snapshot
    if (snapshot.blocks && Array.isArray(snapshot.blocks)) {
      snapshot.blocks.forEach((block: any, index: number) => {
        const blockId = block.id || `block-${Date.now()}-${index}`;
        
        // Set block metadata
        blocks.set(blockId, {
          id: blockId,
          type: block.lang === "markdown" ? "markdown" : "code",
          language: block.lang || "python",
          position: block.position !== undefined ? block.position : index,
          createdAt: block.createdAt || Date.now(),
          updatedAt: block.updatedAt || Date.now(),
        } as any);

        // Set block content
        let ytext = blockContent.get(blockId) as Y.Text;
        if (!ytext) {
          ytext = new Y.Text();
          blockContent.set(blockId, ytext as any);
        }
        
        // Replace content
        if ((ytext as any).length > 0) {
          (ytext as any).delete(0, (ytext as any).length);
        }
        (ytext as any).insert(0, block.content || "");
      });
    }

    // Update metadata
    const metadata = ydoc.getMap("metadata");
    metadata.set("updatedAt", Date.now());
    metadata.set("restoredAt", Date.now());

    // Bump activity
    const nb = this.findNotebookSync(notebookId);
    if (nb) this.bumpRoomActivity(nb.roomId);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clean up Y.Docs
    this.documents.forEach((ydoc) => ydoc.destroy());
    this.documents.clear();
    this.rooms.clear();
    this.inMemoryNotebooks.clear();
    console.log("🧹 YjsDocumentManager cleaned up");
  }
}
