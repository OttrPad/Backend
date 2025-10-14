import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  NotebookDocument,
  NotebookBlock,
  YjsNotebookData,
  CollaborationRoom,
} from "../types/notebook.types";

export class YjsDocumentManager {
  private documents: Map<string, Y.Doc> = new Map(); // notebookId -> Y.Doc
  private awarenessMap: Map<string, Awareness> = new Map(); // notebookId -> Awareness
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

  getAwareness(notebookId: string): Awareness {
    if (!this.awarenessMap.has(notebookId)) {
      const ydoc = this.getDocument(notebookId);
      const awareness = new Awareness(ydoc);
      this.awarenessMap.set(notebookId, awareness);
    }
    return this.awarenessMap.get(notebookId)!;
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

    // Initialize Awareness
    this.getAwareness(notebookId);

    // Add to room
    this.addNotebookToRoom(roomId, notebookId);

    // Create a default code block
    this.createBlock(notebookId, "code", 0, "python");

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

        // Clean up Awareness
        this.awarenessMap.delete(notebookId);

        // Remove from room
        this.removeNotebookFromRoom(roomId, notebookId);

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

  getActiveUsers(notebookId: string): any[] {
    const awareness = this.awarenessMap.get(notebookId);
    if (!awareness) return [];
    return Array.from(awareness.getStates().values());
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
    this.awarenessMap.clear();
    console.log("🧹 YjsDocumentManager cleaned up");
  }
}
