-- Collaboration Documents Table
-- Stores the current state of Yjs documents for each room
CREATE TABLE IF NOT EXISTS collaboration_documents (
  room_id VARCHAR(255) PRIMARY KEY,           -- Room code (e.g., 'qli-635-3ds')
  room_db_id INTEGER NOT NULL,                -- Foreign key to Rooms.room_id
  yjs_state BYTEA NOT NULL,                   -- Yjs document state as binary data
  version INTEGER DEFAULT 1,                  -- Current version number
  last_updated TIMESTAMP DEFAULT NOW(),       -- When document was last updated
  active_users JSONB DEFAULT '[]'::jsonb,     -- Currently active users
  created_at TIMESTAMP DEFAULT NOW(),         -- When document was first created
  
  -- Foreign key constraint (if Rooms table exists)
  CONSTRAINT fk_collaboration_room 
    FOREIGN KEY (room_db_id) 
    REFERENCES "Rooms"(room_id) 
    ON DELETE CASCADE
);

-- Document Versions Table
-- Stores historical snapshots of documents for version control
CREATE TABLE IF NOT EXISTS document_versions (
  id SERIAL PRIMARY KEY,                      -- Unique version ID
  room_id VARCHAR(255) NOT NULL,              -- Room code
  room_db_id INTEGER NOT NULL,                -- Foreign key to Rooms.room_id
  yjs_state BYTEA NOT NULL,                   -- Yjs document state at this version
  version INTEGER NOT NULL,                   -- Version number
  created_by VARCHAR(255) NOT NULL,           -- User ID who created this version
  created_at TIMESTAMP DEFAULT NOW(),         -- When version was created
  snapshot_reason VARCHAR(50) NOT NULL DEFAULT 'manual', -- Reason for snapshot
  
  -- Foreign key constraint
  CONSTRAINT fk_version_room 
    FOREIGN KEY (room_db_id) 
    REFERENCES "Rooms"(room_id) 
    ON DELETE CASCADE,
    
  -- Ensure snapshot_reason is valid
  CONSTRAINT chk_snapshot_reason 
    CHECK (snapshot_reason IN ('manual', 'auto', 'milestone'))
);

-- Collaboration Metrics Table
-- Tracks connection metrics for monitoring and analytics
CREATE TABLE IF NOT EXISTS collaboration_metrics (
  id SERIAL PRIMARY KEY,                      -- Unique metric ID
  room_id VARCHAR(255) NOT NULL,              -- Room code
  user_id VARCHAR(255) NOT NULL,              -- User ID
  connected_at TIMESTAMP DEFAULT NOW(),       -- When user connected
  disconnected_at TIMESTAMP,                  -- When user disconnected (NULL if still connected)
  session_duration INTEGER,                   -- Session duration in milliseconds
  disconnect_reason VARCHAR(100),             -- Reason for disconnection
  created_at TIMESTAMP DEFAULT NOW()          -- When metric was recorded
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_collaboration_documents_room_db_id 
  ON collaboration_documents(room_db_id);

CREATE INDEX IF NOT EXISTS idx_collaboration_documents_last_updated 
  ON collaboration_documents(last_updated);

CREATE INDEX IF NOT EXISTS idx_document_versions_room_id 
  ON document_versions(room_id);

CREATE INDEX IF NOT EXISTS idx_document_versions_created_at 
  ON document_versions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_room_version 
  ON document_versions(room_id, version);

CREATE INDEX IF NOT EXISTS idx_collaboration_metrics_room_id 
  ON collaboration_metrics(room_id);

CREATE INDEX IF NOT EXISTS idx_collaboration_metrics_user_id 
  ON collaboration_metrics(user_id);

CREATE INDEX IF NOT EXISTS idx_collaboration_metrics_connected_at 
  ON collaboration_metrics(connected_at);

-- Comments for documentation
COMMENT ON TABLE collaboration_documents IS 'Stores current Yjs document state for collaborative editing rooms';
COMMENT ON TABLE document_versions IS 'Historical snapshots of documents for version control and recovery';
COMMENT ON TABLE collaboration_metrics IS 'Connection and usage metrics for monitoring collaboration service';

COMMENT ON COLUMN collaboration_documents.room_id IS 'Room code identifier (e.g., qli-635-3ds)';
COMMENT ON COLUMN collaboration_documents.yjs_state IS 'Binary representation of Yjs document state';
COMMENT ON COLUMN collaboration_documents.active_users IS 'JSON array of currently connected user IDs';

COMMENT ON COLUMN document_versions.snapshot_reason IS 'Reason for creating this version: manual, auto, or milestone';
COMMENT ON COLUMN document_versions.version IS 'Incremental version number for this room';

COMMENT ON COLUMN collaboration_metrics.session_duration IS 'Duration of collaboration session in milliseconds';
COMMENT ON COLUMN collaboration_metrics.disconnect_reason IS 'Reason for disconnection (timeout, error, normal, etc.)';
