-- ============================================================================
-- GitHub Git Integration Database Migration
-- ============================================================================
-- This migration adds GitHub repository integration to the OttrPad platform
-- 
-- IMPORTANT: Review this migration carefully before running in production
-- Backup your database before applying these changes
--
-- Execution order:
-- 1. Create new git_repos table
-- 2. Alter commits table (add git_commit_hash)
-- 3. Alter milestones table (add git_commit_hash)
-- 4. Alter Rooms table (add github fields)
-- 5. Create indexes
-- 6. Add constraints
-- ============================================================================

-- ============================================================================
-- STEP 1: Create git_repos table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.git_repos (
  repo_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  room_id bigint NOT NULL UNIQUE,
  github_repo_url text NOT NULL UNIQUE,
  github_repo_name text NOT NULL,
  branch_name text NOT NULL DEFAULT 'main',
  github_token_encrypted text,
  local_repo_path text NOT NULL,
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status = ANY (ARRAY['synced'::text, 'syncing'::text, 'failed'::text, 'pending'::text])),
  last_sync_at timestamp with time zone,
  last_sync_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT git_repos_pkey PRIMARY KEY (repo_id),
  CONSTRAINT git_repos_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.Rooms(room_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.git_repos IS 'Stores GitHub repository information for each room';
COMMENT ON COLUMN public.git_repos.room_id IS 'One-to-one relationship with Rooms table';
COMMENT ON COLUMN public.git_repos.github_repo_url IS 'Full GitHub URL (e.g., https://github.com/OttrPad/room-abc-123-def)';
COMMENT ON COLUMN public.git_repos.github_repo_name IS 'Repository name in format: owner/repo';
COMMENT ON COLUMN public.git_repos.sync_status IS 'Current sync status: synced, syncing, failed, pending';
COMMENT ON COLUMN public.git_repos.local_repo_path IS 'Path to local Git repository on server';

-- ============================================================================
-- STEP 2: Alter commits table - Add git_commit_hash
-- ============================================================================
-- Check if column already exists before adding
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'commits' 
    AND column_name = 'git_commit_hash'
  ) THEN
    ALTER TABLE public.commits 
      ADD COLUMN git_commit_hash text;
    
    COMMENT ON COLUMN public.commits.git_commit_hash IS 'Git SHA-1 hash from local/GitHub commit';
  END IF;
END $$;

-- Make git_commit_hash NOT NULL after backfilling (if needed)
-- For new installs, this is immediate. For existing data, backfill first.
-- ALTER TABLE public.commits 
--   ALTER COLUMN git_commit_hash SET NOT NULL;

-- Remove old columns that are no longer needed (if they exist)
DO $$ 
BEGIN
  -- Remove block_id if it exists (moved to snapshot JSON)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'commits' 
    AND column_name = 'block_id'
  ) THEN
    ALTER TABLE public.commits DROP COLUMN block_id;
  END IF;

  -- Remove file_id if it exists (moved to snapshot JSON)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'commits' 
    AND column_name = 'file_id'
  ) THEN
    ALTER TABLE public.commits DROP COLUMN file_id;
  END IF;

  -- Remove milestone column if it exists (replaced by is_milestone)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'commits' 
    AND column_name = 'milestone'
  ) THEN
    ALTER TABLE public.commits DROP COLUMN milestone;
  END IF;
END $$;

-- Ensure is_milestone column exists and has default
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'commits' 
    AND column_name = 'is_milestone'
  ) THEN
    ALTER TABLE public.commits 
      ADD COLUMN is_milestone boolean DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Alter milestones table - Add git_commit_hash
-- ============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'milestones' 
    AND column_name = 'git_commit_hash'
  ) THEN
    ALTER TABLE public.milestones 
      ADD COLUMN git_commit_hash text;
    
    COMMENT ON COLUMN public.milestones.git_commit_hash IS 'Duplicate of commits.git_commit_hash for quick access';
  END IF;
END $$;

-- Backfill git_commit_hash in milestones from commits table
UPDATE public.milestones m
SET git_commit_hash = c.git_commit_hash
FROM public.commits c
WHERE m.commit_id = c.commit_id
AND m.git_commit_hash IS NULL
AND c.git_commit_hash IS NOT NULL;

-- ============================================================================
-- STEP 4: Alter Rooms table - Add GitHub fields
-- ============================================================================
DO $$ 
BEGIN
  -- Add github_repo_id foreign key
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'Rooms' 
    AND column_name = 'github_repo_id'
  ) THEN
    ALTER TABLE public.Rooms 
      ADD COLUMN github_repo_id bigint REFERENCES public.git_repos(repo_id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN public.Rooms.github_repo_id IS 'Reference to associated GitHub repository';
  END IF;

  -- Add repo_initialized flag
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'Rooms' 
    AND column_name = 'repo_initialized'
  ) THEN
    ALTER TABLE public.Rooms 
      ADD COLUMN repo_initialized boolean DEFAULT false;
    
    COMMENT ON COLUMN public.Rooms.repo_initialized IS 'True if GitHub repository has been created and initialized';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Create Indexes for Performance
-- ============================================================================

-- git_repos indexes
CREATE INDEX IF NOT EXISTS idx_git_repos_room_id ON public.git_repos(room_id);
CREATE INDEX IF NOT EXISTS idx_git_repos_sync_status ON public.git_repos(sync_status);
CREATE INDEX IF NOT EXISTS idx_git_repos_last_sync ON public.git_repos(last_sync_at DESC) WHERE sync_status != 'synced';

-- commits indexes (add to existing)
CREATE INDEX IF NOT EXISTS idx_commits_room_id ON public.commits(room_id);
CREATE INDEX IF NOT EXISTS idx_commits_git_hash ON public.commits(git_commit_hash) WHERE git_commit_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commits_created_at ON public.commits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commits_author ON public.commits(author_id);
CREATE INDEX IF NOT EXISTS idx_commits_is_milestone ON public.commits(is_milestone) WHERE is_milestone = true;
CREATE INDEX IF NOT EXISTS idx_commits_room_timeline ON public.commits(room_id, created_at DESC) WHERE hidden = false;

-- milestones indexes (add to existing)
CREATE INDEX IF NOT EXISTS idx_milestones_room_id ON public.milestones(room_id);
CREATE INDEX IF NOT EXISTS idx_milestones_commit_id ON public.milestones(commit_id);
CREATE INDEX IF NOT EXISTS idx_milestones_created_at ON public.milestones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_git_hash ON public.milestones(git_commit_hash) WHERE git_commit_hash IS NOT NULL;

-- Rooms indexes (add to existing)
CREATE INDEX IF NOT EXISTS idx_rooms_github_repo ON public.Rooms(github_repo_id) WHERE github_repo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_repo_initialized ON public.Rooms(repo_initialized) WHERE repo_initialized = false;

-- Room_users index for authorization checks
CREATE INDEX IF NOT EXISTS idx_room_users_authorization ON public.Room_users(room_id, uid, type);

-- ============================================================================
-- STEP 6: Add Additional Constraints
-- ============================================================================

-- Unique constraint on git_commit_hash per room (prevent duplicate commits)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'commits_git_hash_room_unique'
  ) THEN
    ALTER TABLE public.commits 
      ADD CONSTRAINT commits_git_hash_room_unique 
      UNIQUE (git_commit_hash, room_id);
  END IF;
END $$;

-- Ensure commit_message is not empty
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'commits_message_not_empty'
  ) THEN
    ALTER TABLE public.commits 
      ADD CONSTRAINT commits_message_not_empty 
      CHECK (length(trim(commit_message)) > 0);
  END IF;
END $$;

-- Ensure milestone name is not empty
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'milestones_name_not_empty'
  ) THEN
    ALTER TABLE public.milestones 
      ADD CONSTRAINT milestones_name_not_empty 
      CHECK (length(trim(name)) > 0);
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Create Helper Functions
-- ============================================================================

-- Function to get unified timeline for a room
CREATE OR REPLACE FUNCTION public.get_room_timeline(p_room_id bigint, p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  type text,
  message text,
  git_commit_hash text,
  created_at timestamp with time zone,
  author_id uuid,
  author_email text,
  is_milestone boolean,
  milestone_name text,
  milestone_notes text,
  snapshot_json jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.commit_id as id,
    CASE 
      WHEN m.milestone_id IS NOT NULL THEN 'milestone'::text
      ELSE 'commit'::text
    END as type,
    c.commit_message as message,
    c.git_commit_hash,
    c.created_at,
    c.author_id,
    u.email as author_email,
    c.is_milestone,
    m.name as milestone_name,
    m.notes as milestone_notes,
    c.snapshot_json
  FROM public.commits c
  LEFT JOIN public.milestones m ON m.commit_id = c.commit_id
  LEFT JOIN auth.users u ON u.id = c.author_id
  WHERE c.room_id = p_room_id 
    AND c.hidden = false
  ORDER BY c.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_room_timeline IS 'Get unified timeline of commits and milestones for a room';

-- Function to check if user can create milestone (owner only)
CREATE OR REPLACE FUNCTION public.can_create_milestone(p_room_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_type text;
BEGIN
  -- Check if user is admin/owner
  SELECT type INTO v_user_type
  FROM public.Room_users
  WHERE room_id = p_room_id AND uid = p_user_id;
  
  RETURN v_user_type = 'admin';
END;
$$;

COMMENT ON FUNCTION public.can_create_milestone IS 'Check if user has permission to create milestones (admin only)';

-- ============================================================================
-- STEP 8: Enable Row Level Security (RLS) for git_repos
-- ============================================================================

-- Enable RLS on git_repos table
ALTER TABLE public.git_repos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view git repo info for rooms they have access to
CREATE POLICY git_repos_select_policy ON public.git_repos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.Room_users ru
      WHERE ru.room_id = git_repos.room_id
      AND ru.uid = auth.uid()
    )
  );

-- Policy: Only service role can insert/update/delete git_repos
-- (This is handled by backend service with service role key)

-- ============================================================================
-- STEP 9: Create View for Room with GitHub Info
-- ============================================================================

CREATE OR REPLACE VIEW public.rooms_with_github AS
SELECT 
  r.*,
  gr.github_repo_url,
  gr.github_repo_name,
  gr.sync_status,
  gr.last_sync_at,
  gr.branch_name
FROM public.Rooms r
LEFT JOIN public.git_repos gr ON gr.room_id = r.room_id;

COMMENT ON VIEW public.rooms_with_github IS 'Rooms joined with GitHub repository information';

-- ============================================================================
-- STEP 10: Sample Data Verification Queries
-- ============================================================================

-- Verify migration success
DO $$ 
DECLARE
  v_git_repos_count integer;
  v_commits_with_hash integer;
  v_milestones_with_hash integer;
BEGIN
  SELECT COUNT(*) INTO v_git_repos_count FROM public.git_repos;
  SELECT COUNT(*) INTO v_commits_with_hash FROM public.commits WHERE git_commit_hash IS NOT NULL;
  SELECT COUNT(*) INTO v_milestones_with_hash FROM public.milestones WHERE git_commit_hash IS NOT NULL;
  
  RAISE NOTICE 'Migration Verification:';
  RAISE NOTICE '  git_repos table: % rows', v_git_repos_count;
  RAISE NOTICE '  commits with git_hash: % rows', v_commits_with_hash;
  RAISE NOTICE '  milestones with git_hash: % rows', v_milestones_with_hash;
END $$;

-- ============================================================================
-- ROLLBACK SCRIPT (Save separately - DO NOT RUN unless rolling back)
-- ============================================================================

/*
-- ROLLBACK INSTRUCTIONS
-- Run these commands to reverse the migration if needed

-- Drop new table
DROP TABLE IF EXISTS public.git_repos CASCADE;

-- Remove new columns from commits
ALTER TABLE public.commits DROP COLUMN IF EXISTS git_commit_hash;
ALTER TABLE public.commits DROP COLUMN IF EXISTS is_milestone;

-- Remove new columns from milestones
ALTER TABLE public.milestones DROP COLUMN IF EXISTS git_commit_hash;

-- Remove new columns from Rooms
ALTER TABLE public.Rooms DROP COLUMN IF EXISTS github_repo_id;
ALTER TABLE public.Rooms DROP COLUMN IF EXISTS repo_initialized;

-- Drop helper functions
DROP FUNCTION IF EXISTS public.get_room_timeline(bigint, integer);
DROP FUNCTION IF EXISTS public.can_create_milestone(bigint, uuid);

-- Drop view
DROP VIEW IF EXISTS public.rooms_with_github;

-- Drop indexes (they will be dropped automatically with the columns)
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Final success message
DO $$ 
BEGIN
  RAISE NOTICE '✅ GitHub Git Integration migration completed successfully!';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Configure GITHUB_TOKEN in environment variables';
  RAISE NOTICE '  2. Deploy updated VCS service';
  RAISE NOTICE '  3. Test room creation → GitHub repo creation';
  RAISE NOTICE '  4. Test commit → GitHub push';
  RAISE NOTICE '  5. Test milestone → GitHub tag';
END $$;
