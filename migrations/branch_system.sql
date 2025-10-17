-- Migration: Branch System Implementation
-- Description: Adds branching, merging, and conflict resolution capabilities
-- Date: 2025-10-17

-- ============================================
-- 1. Create branches table
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
  branch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT NOT NULL REFERENCES Rooms(room_id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  parent_branch_id UUID REFERENCES branches(branch_id), -- NULL for main branch
  is_main BOOLEAN DEFAULT FALSE,
  last_commit_id UUID REFERENCES commits(commit_id),
  description TEXT,
  UNIQUE(room_id, branch_name)
);

CREATE INDEX idx_branches_room ON branches(room_id);
CREATE INDEX idx_branches_main ON branches(room_id, is_main);
CREATE INDEX idx_branches_created_by ON branches(created_by);

-- ============================================
-- 2. Update commits table to support branches
-- ============================================
ALTER TABLE commits
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(branch_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS parent_commit_id UUID REFERENCES commits(commit_id),
ADD COLUMN IF NOT EXISTS is_merge_commit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS merged_from_branch_id UUID REFERENCES branches(branch_id);

CREATE INDEX idx_commits_branch ON commits(branch_id);
CREATE INDEX idx_commits_parent ON commits(parent_commit_id);

-- ============================================
-- 3. Create branch_checkouts table
-- ============================================
CREATE TABLE IF NOT EXISTS branch_checkouts (
  checkout_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT NOT NULL REFERENCES Rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  checked_out_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_branch_checkouts_user ON branch_checkouts(room_id, user_id);
CREATE INDEX idx_branch_checkouts_branch ON branch_checkouts(branch_id);

-- ============================================
-- 4. Create merge_conflicts table
-- ============================================
CREATE TABLE IF NOT EXISTS merge_conflicts (
  conflict_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT NOT NULL REFERENCES Rooms(room_id) ON DELETE CASCADE,
  source_branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  target_branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  source_content JSONB, -- Full block from source branch
  target_content JSONB, -- Full block from target branch
  base_content JSONB,   -- Block from common ancestor
  conflict_type TEXT DEFAULT 'modify-modify', -- 'modify-modify', 'modify-delete', 'add-add'
  resolved BOOLEAN DEFAULT FALSE,
  resolution_content JSONB, -- User's chosen resolution
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_merge_conflicts_room ON merge_conflicts(room_id);
CREATE INDEX idx_merge_conflicts_unresolved ON merge_conflicts(room_id, resolved) WHERE resolved = FALSE;
CREATE INDEX idx_merge_conflicts_branches ON merge_conflicts(source_branch_id, target_branch_id);

-- ============================================
-- 5. Create merge_requests table (optional - for PR-like workflow)
-- ============================================
CREATE TABLE IF NOT EXISTS merge_requests (
  merge_request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT NOT NULL REFERENCES Rooms(room_id) ON DELETE CASCADE,
  source_branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  target_branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open', -- 'open', 'merged', 'closed', 'conflicts'
  has_conflicts BOOLEAN DEFAULT FALSE,
  merged_at TIMESTAMP WITH TIME ZONE,
  merged_by UUID REFERENCES auth.users(id),
  merge_commit_id UUID REFERENCES commits(commit_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_merge_requests_room ON merge_requests(room_id);
CREATE INDEX idx_merge_requests_status ON merge_requests(status);
CREATE INDEX idx_merge_requests_source ON merge_requests(source_branch_id);
CREATE INDEX idx_merge_requests_target ON merge_requests(target_branch_id);

-- ============================================
-- 6. Migration: Create main branch for existing rooms
-- ============================================
DO $$
DECLARE
  room_record RECORD;
  main_branch_id UUID;
BEGIN
  -- For each existing room, create a main branch
  FOR room_record IN SELECT room_id FROM Rooms
  LOOP
    -- Create main branch
    INSERT INTO branches (room_id, branch_name, is_main, created_at)
    VALUES (room_record.room_id, 'main', TRUE, NOW())
    RETURNING branch_id INTO main_branch_id;
    
    -- Link all existing commits to main branch
    UPDATE commits
    SET branch_id = main_branch_id
    WHERE room_id = room_record.room_id AND branch_id IS NULL;
    
    -- Update main branch's last_commit_id
    UPDATE branches
    SET last_commit_id = (
      SELECT commit_id 
      FROM commits 
      WHERE branch_id = main_branch_id 
      ORDER BY created_at DESC 
      LIMIT 1
    )
    WHERE branch_id = main_branch_id;
    
    -- Set all users in this room to be on main branch
    INSERT INTO branch_checkouts (room_id, user_id, branch_id)
    SELECT 
      room_record.room_id,
      user_id,
      main_branch_id
    FROM Room_users
    WHERE room_id = room_record.room_id
    ON CONFLICT (room_id, user_id) DO NOTHING;
    
  END LOOP;
END $$;

-- ============================================
-- 7. Update milestones table to enforce main branch only
-- ============================================
ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(branch_id);

-- Link existing milestones to main branch
UPDATE milestones m
SET branch_id = (
  SELECT b.branch_id
  FROM branches b
  WHERE b.room_id = m.room_id AND b.is_main = TRUE
  LIMIT 1
)
WHERE branch_id IS NULL;

-- Add constraint: milestones must be on main branch
ALTER TABLE milestones
ADD CONSTRAINT milestones_main_branch_only 
CHECK (
  branch_id IN (
    SELECT branch_id FROM branches WHERE is_main = TRUE
  )
);

CREATE INDEX idx_milestones_branch ON milestones(branch_id);

-- ============================================
-- 8. Create helper functions
-- ============================================

-- Function to get branch hierarchy
CREATE OR REPLACE FUNCTION get_branch_hierarchy(p_branch_id UUID)
RETURNS TABLE (
  branch_id UUID,
  branch_name TEXT,
  depth INTEGER
) AS $$
WITH RECURSIVE branch_tree AS (
  -- Base case: start with the given branch
  SELECT 
    b.branch_id,
    b.branch_name,
    b.parent_branch_id,
    0 AS depth
  FROM branches b
  WHERE b.branch_id = p_branch_id
  
  UNION ALL
  
  -- Recursive case: get parent branches
  SELECT 
    b.branch_id,
    b.branch_name,
    b.parent_branch_id,
    bt.depth + 1
  FROM branches b
  INNER JOIN branch_tree bt ON b.branch_id = bt.parent_branch_id
)
SELECT branch_id, branch_name, depth
FROM branch_tree
ORDER BY depth DESC;
$$ LANGUAGE sql STABLE;

-- Function to find common ancestor of two branches
CREATE OR REPLACE FUNCTION find_common_ancestor(p_branch1_id UUID, p_branch2_id UUID)
RETURNS UUID AS $$
DECLARE
  common_ancestor_id UUID;
BEGIN
  -- Find the first common branch in the hierarchy
  SELECT b1.branch_id INTO common_ancestor_id
  FROM get_branch_hierarchy(p_branch1_id) b1
  INNER JOIN get_branch_hierarchy(p_branch2_id) b2 ON b1.branch_id = b2.branch_id
  ORDER BY b1.depth DESC
  LIMIT 1;
  
  RETURN common_ancestor_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get latest commit on branch
CREATE OR REPLACE FUNCTION get_latest_commit(p_branch_id UUID)
RETURNS UUID AS $$
  SELECT commit_id
  FROM commits
  WHERE branch_id = p_branch_id
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============================================
-- 9. Grant permissions (adjust as needed)
-- ============================================
-- These will depend on your auth setup
-- GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON branch_checkouts TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON merge_conflicts TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON merge_requests TO authenticated;

-- ============================================
-- 10. Trigger to update branch updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_branch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_branch_timestamp
BEFORE UPDATE ON branches
FOR EACH ROW
EXECUTE FUNCTION update_branch_timestamp();

-- ============================================
-- Migration Complete
-- ============================================
-- Summary:
-- ✅ branches table created
-- ✅ commits table updated with branch support
-- ✅ branch_checkouts table created
-- ✅ merge_conflicts table created
-- ✅ merge_requests table created (optional)
-- ✅ Existing rooms migrated to main branch
-- ✅ Existing commits linked to main branch
-- ✅ Helper functions created
-- ✅ Triggers added
