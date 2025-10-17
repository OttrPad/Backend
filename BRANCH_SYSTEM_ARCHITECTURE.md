# Branch System Architecture - Git-like Version Control

## Overview

Implement a complete branching system similar to GitHub where users can:

- Create multiple branches per room
- Commit to specific branches
- Merge branches with diff-based updates (not overwriting)
- Resolve merge conflicts manually
- Milestones only on main branch

## Database Schema Changes

### 1. New `branches` Table

```sql
CREATE TABLE branches (
  branch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT REFERENCES Rooms(room_id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  parent_branch_id UUID REFERENCES branches(branch_id), -- NULL for main branch
  is_main BOOLEAN DEFAULT FALSE,
  last_commit_id UUID REFERENCES commits(commit_id),
  UNIQUE(room_id, branch_name)
);

CREATE INDEX idx_branches_room ON branches(room_id);
CREATE INDEX idx_branches_main ON branches(room_id, is_main);
```

### 2. Update `commits` Table

```sql
ALTER TABLE commits
ADD COLUMN branch_id UUID REFERENCES branches(branch_id),
ADD COLUMN parent_commit_id UUID REFERENCES commits(commit_id);

CREATE INDEX idx_commits_branch ON commits(branch_id);
```

### 3. New `merge_conflicts` Table

```sql
CREATE TABLE merge_conflicts (
  conflict_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT REFERENCES Rooms(room_id),
  source_branch_id UUID REFERENCES branches(branch_id),
  target_branch_id UUID REFERENCES branches(branch_id),
  block_id TEXT NOT NULL,
  source_content TEXT,
  target_content TEXT,
  base_content TEXT, -- common ancestor
  resolved BOOLEAN DEFAULT FALSE,
  resolution_content TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_merge_conflicts_room ON merge_conflicts(room_id);
CREATE INDEX idx_merge_conflicts_unresolved ON merge_conflicts(room_id, resolved);
```

### 4. New `branch_checkouts` Table (track which branch each user is on)

```sql
CREATE TABLE branch_checkouts (
  checkout_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id BIGINT REFERENCES Rooms(room_id),
  user_id UUID REFERENCES auth.users(id),
  branch_id UUID REFERENCES branches(branch_id),
  checked_out_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_branch_checkouts_user ON branch_checkouts(room_id, user_id);
```

## API Endpoints

### Branch Management

- `POST /api/branches` - Create new branch
- `GET /api/branches/:roomId` - List all branches in room
- `POST /api/branches/:branchId/checkout` - Switch to branch
- `DELETE /api/branches/:branchId` - Delete branch
- `GET /api/branches/:roomId/current` - Get user's current branch

### Commit Operations

- `POST /api/commits` - Create commit (now requires branchId)
- `GET /api/commits/:branchId/history` - Get commit history for branch
- `GET /api/commits/:commitId/diff` - Get diff for a commit

### Merge Operations

- `POST /api/branches/:branchId/merge` - Merge branch into target
- `GET /api/merge-conflicts/:roomId` - Get unresolved conflicts
- `POST /api/merge-conflicts/:conflictId/resolve` - Resolve conflict
- `GET /api/branches/:branchId/diff/:targetBranchId` - Preview merge diff

### Milestone Operations (Main Branch Only)

- `POST /api/milestones` - Create milestone (only on main branch)
- `GET /api/milestones/:roomId` - Get milestones

## Backend Implementation

### 1. Branch Service (`branchService.ts`)

```typescript
export const createBranch = async (
  roomId,
  branchName,
  userId,
  parentBranchId?
) => {
  // Create new branch from parent (default: main)
  // Copy latest commit from parent as starting point
};

export const getBranches = async (roomId) => {
  // Get all branches with latest commit info
};

export const checkoutBranch = async (roomId, branchId, userId) => {
  // Update user's current branch
  // Return blocks from latest commit on that branch
};

export const deleteBranch = async (branchId, userId) => {
  // Only if not main and user is owner
};
```

### 2. Merge Service (`mergeService.ts`)

```typescript
export const mergeBranches = async (sourceBranchId, targetBranchId, userId) => {
  // 1. Get latest commits from both branches
  // 2. Find common ancestor (base)
  // 3. Calculate diff using three-way merge
  // 4. Detect conflicts (same block modified in both)
  // 5. If conflicts, create conflict records
  // 6. If no conflicts, auto-merge and create merge commit
};

export const detectConflicts = async (
  sourceSnapshot,
  targetSnapshot,
  baseSnapshot
) => {
  // Block-level conflict detection
  // Return array of conflicts
};

export const applyMerge = async (targetBranchId, mergedBlocks, userId) => {
  // Create merge commit on target branch
};

export const resolveConflict = async (conflictId, resolution, userId) => {
  // User manually resolves conflict
  // Update conflict record with resolution
};
```

### 3. Diff Service (`diffService.ts`)

```typescript
export const calculateBlockDiff = (sourceBlocks, targetBlocks) => {
  // Calculate diff at block level
  // Return: added, removed, modified blocks
};

export const threeWayMerge = (baseBlocks, sourceBlocks, targetBlocks) => {
  // Intelligent merge using common ancestor
  // Auto-resolve non-conflicting changes
};

export const formatDiffForDisplay = (diff) => {
  // Format for UI display
};
```

## Frontend Implementation

### 1. BranchPane Component (replaces TestPane)

```typescript
interface BranchPaneProps {
  roomId: string;
}

Features:
- List all branches
- Show current branch indicator
- Create new branch button
- Switch branch (checkout)
- Merge branch with conflict UI
- Delete branch
- Visual branch tree/graph
```

### 2. Branch Store

```typescript
interface BranchState {
  currentBranch: Branch | null;
  branches: Branch[];
  conflicts: MergeConflict[];

  createBranch: (name, parentId?) => Promise<void>;
  checkoutBranch: (branchId) => Promise<void>;
  mergeBranch: (sourceId, targetId) => Promise<void>;
  resolveConflict: (conflictId, resolution) => Promise<void>;
}
```

### 3. Merge Conflict UI

- Side-by-side diff view
- Highlight conflicting blocks
- Manual selection UI (source/target/custom)
- Apply resolution button

## Flow Diagrams

### Create Branch Flow

```
User creates "feature-x" from main
  ↓
1. Create branch record (parent: main)
2. Copy main's latest commit as starting point
3. User's checkout updated to feature-x
4. Load blocks from feature-x
```

### Commit Flow

```
User commits on "feature-x"
  ↓
1. Verify user is on feature-x
2. Create commit linked to feature-x branch
3. Update branch's last_commit_id
4. Git commit with branch info
```

### Merge Flow

```
Merge feature-x → main
  ↓
1. Get latest commits: main & feature-x
2. Find common ancestor (base commit)
3. Calculate three-way diff
4. Detect conflicts (block modified in both)
5a. NO CONFLICTS: Auto-merge
    - Apply changes block-by-block
    - Create merge commit on main
5b. CONFLICTS FOUND:
    - Create conflict records
    - Show conflict UI
    - Wait for manual resolution
    - Apply after all resolved
```

### Conflict Resolution Flow

```
User sees conflict on block "abc123"
  ↓
1. Show side-by-side:
   - Source (feature-x) content
   - Target (main) content
   - Base (common ancestor) content
2. User selects:
   - Keep source
   - Keep target
   - Manual edit
3. Apply resolution
4. Mark conflict as resolved
5. Continue merge when all resolved
```

## Implementation Phases

### Phase 1: Database Setup ✅

- Create migration files
- Add new tables
- Update existing tables
- Run migrations

### Phase 2: Backend - Branch Management 🔄

- Branch service (create, list, checkout, delete)
- Update commit service (branch linking)
- Branch controllers & routes
- Authorization (branch creation)

### Phase 3: Backend - Merge & Diff 🔄

- Diff calculation service
- Three-way merge algorithm
- Conflict detection
- Merge controllers & routes

### Phase 4: Frontend - BranchPane 🔄

- Replace TestPane with BranchPane
- Branch list UI
- Create/checkout/delete actions
- Visual branch indicator

### Phase 5: Frontend - Merge & Conflicts 🔄

- Merge UI
- Conflict detection display
- Side-by-side diff viewer
- Manual conflict resolution

### Phase 6: Integration & Testing 🔄

- Update VersionsPane (branch-aware timeline)
- Update commit creation (branch context)
- Milestone restriction (main only)
- End-to-end testing

## Key Differences from Current System

| Feature        | Current       | With Branches             |
| -------------- | ------------- | ------------------------- |
| Commits        | Room-level    | Branch-level              |
| Milestones     | Any commit    | Main branch only          |
| User isolation | Local restore | Per-branch workspace      |
| Merge          | Overwrite     | Diff-based with conflicts |
| Timeline       | Single        | Per-branch + merged view  |

## Migration Strategy

1. Create `main` branch for all existing rooms
2. Link all existing commits to `main` branch
3. Set all users' checkout to `main` branch
4. Ensure backward compatibility

This is a comprehensive system that mirrors Git/GitHub functionality!
