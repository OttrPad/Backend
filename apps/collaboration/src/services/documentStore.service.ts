import { supabase } from "@packages/supabase";
import { DocumentState, DocumentVersion } from "../types";
import * as Y from "yjs";

export class DocumentStore {
  private autoSaveInterval: number = 5 * 60 * 1000; // 5 minutes
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingSaves: Set<string> = new Set();

  constructor() {
    console.log("📊 DocumentStore initialized");
    this.setupAutoSave();
  }

  /**
   * Save Yjs document state to database
   */
  async saveDocument(
    roomId: string,
    yjsState: Uint8Array,
    activeUsers: string[] = []
  ): Promise<void> {
    try {
      // Prevent duplicate saves
      if (this.pendingSaves.has(roomId)) {
        console.log(`⏳ Save already pending for room ${roomId}, skipping`);
        return;
      }

      this.pendingSaves.add(roomId);
      console.log(
        `💾 Saving document state for room ${roomId} (${yjsState.length} bytes)`
      );

      // Convert Uint8Array to buffer for database storage
      const stateBuffer = Buffer.from(yjsState);

      // Get current room ID from room code
      const roomDbId = await this.getRoomDbId(roomId);
      if (!roomDbId) {
        throw new Error(`Room not found: ${roomId}`);
      }

      // Upsert document state
      const { error } = await supabase.from("collaboration_documents").upsert(
        {
          room_id: roomId,
          room_db_id: roomDbId,
          yjs_state: stateBuffer,
          last_updated: new Date().toISOString(),
          active_users: activeUsers,
          version: await this.getNextVersion(roomId),
        },
        {
          onConflict: "room_id",
        }
      );

      if (error) {
        throw error;
      }

      console.log(`✅ Document saved successfully for room ${roomId}`);

      // Reset auto-save timer
      this.resetAutoSaveTimer(roomId);
    } catch (error) {
      console.error(`❌ Failed to save document for room ${roomId}:`, error);
      throw error;
    } finally {
      this.pendingSaves.delete(roomId);
    }
  }

  /**
   * Load existing document state when users join
   */
  async loadDocument(roomId: string): Promise<Uint8Array | null> {
    try {
      console.log(`📖 Loading document state for room ${roomId}`);

      const { data, error } = await supabase
        .from("collaboration_documents")
        .select("yjs_state, last_updated, version")
        .eq("room_id", roomId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No document found, this is normal for new rooms
          console.log(`📄 No existing document found for room ${roomId}`);
          return null;
        }
        throw error;
      }

      if (!data || !data.yjs_state) {
        console.log(`📄 Empty document state for room ${roomId}`);
        return null;
      }

      // Convert buffer back to Uint8Array
      const yjsState = new Uint8Array(data.yjs_state);

      console.log(
        `✅ Loaded document for room ${roomId} (${yjsState.length} bytes, version ${data.version})`
      );
      return yjsState;
    } catch (error) {
      console.error(`❌ Failed to load document for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Create a snapshot/version of the current document
   */
  async createSnapshot(
    roomId: string,
    yjsState: Uint8Array,
    createdBy: string,
    reason: "manual" | "auto" | "milestone"
  ): Promise<string> {
    try {
      console.log(`📸 Creating snapshot for room ${roomId}, reason: ${reason}`);

      const roomDbId = await this.getRoomDbId(roomId);
      if (!roomDbId) {
        throw new Error(`Room not found: ${roomId}`);
      }

      const version = await this.getNextVersion(roomId);
      const stateBuffer = Buffer.from(yjsState);

      const { data, error } = await supabase
        .from("document_versions")
        .insert({
          room_id: roomId,
          room_db_id: roomDbId,
          yjs_state: stateBuffer,
          version,
          created_by: createdBy,
          created_at: new Date().toISOString(),
          snapshot_reason: reason,
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      const snapshotId = data.id.toString();
      console.log(`✅ Snapshot created: ${snapshotId} for room ${roomId}`);

      return snapshotId;
    } catch (error) {
      console.error(`❌ Failed to create snapshot for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Restore document from a specific version
   */
  async restoreVersion(roomId: string, versionId: string): Promise<Uint8Array> {
    try {
      console.log(`🔄 Restoring room ${roomId} from version ${versionId}`);

      const { data, error } = await supabase
        .from("document_versions")
        .select("yjs_state, version, created_at, created_by")
        .eq("id", parseInt(versionId))
        .eq("room_id", roomId)
        .single();

      if (error || !data) {
        throw new Error(`Version ${versionId} not found for room ${roomId}`);
      }

      const yjsState = new Uint8Array(data.yjs_state);

      // Save this as the current document state
      const activeUsers: string[] = []; // Will be populated by connection manager
      await this.saveDocument(roomId, yjsState, activeUsers);

      console.log(
        `✅ Restored room ${roomId} from version ${data.version} (created by ${data.created_by})`
      );
      return yjsState;
    } catch (error) {
      console.error(
        `❌ Failed to restore version ${versionId} for room ${roomId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get version history for a room
   */
  async getVersionHistory(
    roomId: string,
    limit: number = 20
  ): Promise<DocumentVersion[]> {
    try {
      const { data, error } = await supabase
        .from("document_versions")
        .select("id, version, created_by, created_at, snapshot_reason")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []).map((item) => ({
        id: item.id.toString(),
        roomId,
        yjsState: new Uint8Array(), // Not loaded for list view
        version: item.version,
        createdBy: item.created_by,
        createdAt: new Date(item.created_at).getTime(),
        snapshotReason: item.snapshot_reason,
      }));
    } catch (error) {
      console.error(
        `❌ Failed to get version history for room ${roomId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Auto-save document when users are inactive
   */
  private setupAutoSave(): void {
    console.log(
      `⏰ Auto-save configured with ${this.autoSaveInterval / 1000}s interval`
    );
  }

  /**
   * Start or reset auto-save timer for a room
   */
  resetAutoSaveTimer(
    roomId: string,
    yjsState?: Uint8Array,
    activeUsers: string[] = []
  ): void {
    // Clear existing timer
    const existingTimer = this.autoSaveTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      if (yjsState && yjsState.length > 0) {
        console.log(`⏰ Auto-saving room ${roomId} after inactivity`);
        try {
          await this.saveDocument(roomId, yjsState, activeUsers);
        } catch (error) {
          console.error(`❌ Auto-save failed for room ${roomId}:`, error);
        }
      }
      this.autoSaveTimers.delete(roomId);
    }, this.autoSaveInterval);

    this.autoSaveTimers.set(roomId, timer);
  }

  /**
   * Clear auto-save timer for a room
   */
  clearAutoSaveTimer(roomId: string): void {
    const timer = this.autoSaveTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(roomId);
      console.log(`⏰ Cleared auto-save timer for room ${roomId}`);
    }
  }

  /**
   * Save when last user leaves room
   */
  async saveOnRoomEmpty(roomId: string, yjsState: Uint8Array): Promise<void> {
    console.log(`💾 Saving room ${roomId} as last user left`);
    await this.saveDocument(roomId, yjsState, []);
    this.clearAutoSaveTimer(roomId);
  }

  /**
   * Get room database ID from room code
   */
  private async getRoomDbId(roomCode: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomCode)
        .single();

      if (error || !data) {
        return null;
      }

      return data.room_id;
    } catch (error) {
      console.error(`❌ Failed to get room DB ID for ${roomCode}:`, error);
      return null;
    }
  }

  /**
   * Get next version number for a room
   */
  private async getNextVersion(roomId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from("document_versions")
        .select("version")
        .eq("room_id", roomId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return 1; // First version
      }

      return data.version + 1;
    } catch (error) {
      return 1; // Default to first version on error
    }
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(roomId: string): Promise<{
    exists: boolean;
    size: number;
    version: number;
    lastUpdated: string | null;
    versionsCount: number;
  }> {
    try {
      // Get current document
      const { data: doc, error: docError } = await supabase
        .from("collaboration_documents")
        .select("yjs_state, version, last_updated")
        .eq("room_id", roomId)
        .single();

      // Get versions count
      const { count: versionsCount, error: countError } = await supabase
        .from("document_versions")
        .select("id", { count: "exact" })
        .eq("room_id", roomId);

      return {
        exists: !docError && !!doc,
        size: doc?.yjs_state ? doc.yjs_state.length : 0,
        version: doc?.version || 0,
        lastUpdated: doc?.last_updated || null,
        versionsCount: versionsCount || 0,
      };
    } catch (error) {
      console.error(
        `❌ Failed to get document stats for room ${roomId}:`,
        error
      );
      return {
        exists: false,
        size: 0,
        version: 0,
        lastUpdated: null,
        versionsCount: 0,
      };
    }
  }

  /**
   * Cleanup old versions (keep last N versions)
   */
  async cleanupOldVersions(
    roomId: string,
    keepVersions: number = 10
  ): Promise<void> {
    try {
      console.log(
        `🧹 Cleaning up old versions for room ${roomId}, keeping ${keepVersions} versions`
      );

      const { data, error } = await supabase
        .from("document_versions")
        .select("id")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .range(keepVersions, 1000); // Skip first N, get rest

      if (error || !data || data.length === 0) {
        return;
      }

      const idsToDelete = data.map((v) => v.id);
      const { error: deleteError } = await supabase
        .from("document_versions")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        throw deleteError;
      }

      console.log(
        `✅ Cleaned up ${idsToDelete.length} old versions for room ${roomId}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to cleanup old versions for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log("🛑 Shutting down document store...");

    // Clear all auto-save timers
    for (const [roomId, timer] of this.autoSaveTimers.entries()) {
      clearTimeout(timer);
      console.log(`⏰ Cleared auto-save timer for room ${roomId}`);
    }

    this.autoSaveTimers.clear();
    this.pendingSaves.clear();

    console.log("✅ Document store shutdown complete");
  }
}
