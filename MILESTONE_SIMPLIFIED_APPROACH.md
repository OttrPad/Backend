# Simplified Milestone Approach

## Current Issue

Milestone creation failing with 500 error - likely due to complex Git tag operations or database schema mismatch.

## Proposed Solution

**Treat milestones as special commits** - they're already in the same timeline, just mark them differently.

### Changes Needed:

1. **Add `is_milestone` flag to commits table**
   - `is_milestone` BOOLEAN DEFAULT FALSE
   - `milestone_name` TEXT NULL
   - `milestone_notes` TEXT NULL

2. **Simplify milestone creation**
   - Just create a commit with `is_milestone = true`
   - No separate milestones table needed
   - Same snapshot storage as commits

3. **Frontend already handles it**
   - VersionsPane already shows unified timeline
   - Just check `is_milestone` flag to show golden styling

### Benefits:

- ✅ Simpler database schema
- ✅ No complex Git tag operations
- ✅ Unified storage and retrieval
- ✅ Same restore mechanism
- ✅ Less code to maintain

### Migration:

```sql
ALTER TABLE commits
ADD COLUMN is_milestone BOOLEAN DEFAULT FALSE,
ADD COLUMN milestone_name TEXT NULL,
ADD COLUMN milestone_notes TEXT NULL;
```

Then just use existing commit creation logic with these extra fields!
