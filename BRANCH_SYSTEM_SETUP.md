# Branch System - Migration & Setup Instructions

## ✅ Backend Implementation Status

### Completed:

1. **Database Migration** (`migrations/branch_system.sql`)
   - ✅ Tables: branches, branch_checkouts, merge_conflicts, merge_requests
   - ✅ Updated commits table with branch support
   - ✅ Helper functions for branch hierarchy
   - ✅ Automatic migration of existing rooms to main branch

2. **Services** (all implemented)
   - ✅ `branchService.ts` - Create, get, checkout, delete branches
   - ✅ `diffService.ts` - Block-level diff and three-way merge algorithm
   - ✅ `mergeService.ts` - Branch merging with conflict detection
   - ✅ `commitService.ts` - Updated for branch support

3. **Controllers** (all implemented)
   - ✅ `branchController.ts` - HTTP handlers for branch operations
   - ✅ `mergeController.ts` - HTTP handlers for merge operations

4. **Routes** (all added to `versionControl.routes.ts`)
   - ✅ POST `/branches` - Create branch
   - ✅ GET `/branches/:roomId` - List branches
   - ✅ GET `/branches/:roomId/current` - Get user's current branch
   - ✅ GET `/branches/:roomId/main` - Get main branch
   - ✅ POST `/branches/:branchId/checkout` - Switch branch
   - ✅ DELETE `/branches/:branchId` - Delete branch
   - ✅ POST `/merge` - Merge branches
   - ✅ GET `/merge/conflicts/:roomId` - Get conflicts
   - ✅ POST `/merge/conflicts/:conflictId/resolve` - Resolve conflict
   - ✅ POST `/merge/apply` - Apply merge
   - ✅ GET `/merge/diff` - Preview merge

## 🚀 Setup Instructions

### Step 1: Run Database Migration

**Option A: Via Supabase Dashboard** (Recommended)

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Open `Backend/migrations/branch_system.sql`
3. Copy the entire SQL content
4. Paste into Supabase SQL Editor
5. Click "Run"

**Option B: Via psql Command Line**

```powershell
# Set your DATABASE_URL
$env:DATABASE_URL = "postgresql://postgres:[YOUR-PASSWORD]@db.agmtvkietedgnlrzzidr.supabase.co:5432/postgres"

# Run migration
Get-Content Backend/migrations/branch_system.sql | psql $env:DATABASE_URL
```

### Step 2: Verify Migration

After running the migration, verify it worked:

```sql
-- Check tables were created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('branches', 'branch_checkouts', 'merge_conflicts');

-- Check main branch was created for existing rooms
SELECT r.room_id, r.room_name, b.branch_name, b.is_main
FROM "Rooms" r
LEFT JOIN branches b ON b.room_id = r.room_id AND b.is_main = true;

-- Check commits were linked to branches
SELECT COUNT(*) as commits_with_branch
FROM commits
WHERE branch_id IS NOT NULL;
```

Expected results:

- 3 new tables found
- Each room has a "main" branch with `is_main = true`
- All existing commits have `branch_id` set to their room's main branch

### Step 3: Test Backend APIs

The backend services are ready! Test with:

```powershell
# Get branches for room 57
Invoke-WebRequest -Uri "http://localhost:4000/api/version-control/branches/57" `
  -Headers @{"x-gateway-user-id"="YOUR_USER_ID"}

# Get current branch
Invoke-WebRequest -Uri "http://localhost:4000/api/version-control/branches/57/current" `
  -Headers @{"x-gateway-user-id"="YOUR_USER_ID"}

# Create a new branch
Invoke-WebRequest -Uri "http://localhost:4000/api/version-control/branches" `
  -Method POST `
  -Headers @{
    "Content-Type"="application/json"
    "x-gateway-user-id"="YOUR_USER_ID"
    "x-gateway-user-email"="YOUR_EMAIL"
  } `
  -Body '{"roomId":"57","branchName":"feature-test","description":"Testing branch system"}'
```

## 📋 Next Steps

### Frontend Implementation

1. **Update API Client** - Add branch/merge methods to `apiClient.ts`
2. **Create Branch Store** - Zustand store for branch state
3. **Create BranchPane** - UI to replace TestPane
4. **Create Merge UI** - Conflict resolution interface
5. **Update existing components**:
   - CommitModal - Use current branch
   - MilestoneModal - Restrict to main branch
   - VersionsPane - Filter by branch

## 🎯 How It Works

### Branch Creation Flow

```
User clicks "Create Branch" → feature-x created from main
   ↓
1. New branch record created
2. Parent set to main branch
3. Copies main's latest commit as starting point
4. User auto-checked out to feature-x
```

### Commit Flow

```
User commits on feature-x
   ↓
1. Commit created with branch_id = feature-x
2. Linked to parent commit (previous commit on feature-x)
3. Branch's last_commit_id updated
4. Only visible in feature-x timeline
```

### Merge Flow (No Conflicts)

```
Merge feature-x → main
   ↓
1. Get latest commits from both branches
2. Find common ancestor (base commit)
3. Three-way merge algorithm
4. No conflicts detected
5. Auto-create merge commit on main
```

### Merge Flow (With Conflicts)

```
Merge feature-x → main
   ↓
1. Three-way merge detects conflicts
2. Conflict records created in database
3. Frontend shows conflict UI
4. User manually resolves each conflict
5. Click "Apply Merge" → creates merge commit
```

## 🔧 Troubleshooting

### Migration Fails with "relation already exists"

- Tables already created, safe to ignore or drop tables first:

```sql
DROP TABLE IF EXISTS merge_conflicts CASCADE;
DROP TABLE IF EXISTS branch_checkouts CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
```

### "Main branch not found" errors

- Run the migration section that creates main branches:

```sql
DO $$
DECLARE
  room_record RECORD;
  main_branch_id UUID;
BEGIN
  FOR room_record IN SELECT room_id FROM Rooms
  LOOP
    INSERT INTO branches (room_id, branch_name, is_main, created_at)
    VALUES (room_record.room_id, 'main', TRUE, NOW())
    RETURNING branch_id INTO main_branch_id;

    UPDATE commits
    SET branch_id = main_branch_id
    WHERE room_id = room_record.room_id AND branch_id IS NULL;
  END LOOP;
END $$;
```

### Commits not showing after migration

- Verify commits are linked to branches:

```sql
UPDATE commits c
SET branch_id = (
  SELECT branch_id FROM branches b
  WHERE b.room_id = c.room_id AND b.is_main = true
  LIMIT 1
)
WHERE branch_id IS NULL;
```

## 📖 API Documentation

See `BRANCH_SYSTEM_ARCHITECTURE.md` for complete API documentation.

## ✨ Ready for Frontend!

The backend is now fully implemented and ready. Once the database migration is complete, you can:

- Create branches
- Switch between branches
- Commit to specific branches
- Merge branches with conflict detection
- All via the REST API

The next phase is building the frontend UI to interact with these APIs!
