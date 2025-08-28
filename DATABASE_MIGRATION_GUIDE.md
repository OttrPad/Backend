# Database Migration Instructions

## Overview

You need to create the `allowed_emails` table and the `transition_user_to_room` function in your Supabase database to support the email invitation functionality.

## Files Created

- `create_allowed_emails_table.sql` - Creates the allowed_emails table
- `create_transition_function.sql` - Creates the atomic transition function

## How to Run Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Visit [supabase.com](https://supabase.com)
   - Navigate to your project
   - Go to the SQL Editor

2. **Run the Table Migration**
   - Copy the contents of `create_allowed_emails_table.sql`
   - Paste it into the SQL Editor
   - Click "Run" to execute

3. **Run the Function Migration**
   - Copy the contents of `create_transition_function.sql`
   - Paste it into the SQL Editor
   - Click "Run" to execute

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Navigate to your project directory
cd e:\projects\realtime-code-editor\backend

# Run the migrations (assuming you have supabase init done)
supabase db reset --linked
# or apply specific migrations
supabase migration new create_allowed_emails_table
supabase migration new create_transition_function
```

### Option 3: Manual SQL Execution

If you prefer to run SQL manually:

1. Connect to your Supabase database using any PostgreSQL client
2. Execute the SQL files in order:
   - First: `create_allowed_emails_table.sql`
   - Second: `create_transition_function.sql`

## Verification

After running the migrations, verify they worked:

### Check Table Creation

```sql
-- Verify the table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'allowed_emails';

-- Check table structure
\d public.allowed_emails
```

### Check Function Creation

```sql
-- Verify the function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'transition_user_to_room';
```

### Test the Function

```sql
-- Test function (replace with actual values)
SELECT public.transition_user_to_room(1, 'test-user-id', 'test@example.com', 'viewer');
```

## What These Migrations Do

### `allowed_emails` Table

- Stores email invitations before users join rooms
- Links emails to specific user IDs and rooms
- Tracks invitation metadata (who invited, when, access level)
- Prevents duplicate invitations
- Cascades deletes when rooms are deleted

### `transition_user_to_room` Function

- Atomically moves users from invited status to room members
- Prevents race conditions during the join process
- Validates user isn't already a member
- Handles error cases gracefully
- Returns structured JSON responses

## After Migration

Once the migrations are complete:

1. **Restart your backend services**

   ```bash
   # Stop current services
   # Restart with:
   npm run dev
   ```

2. **Test the functionality**
   - Try creating a room
   - Test adding email invitations
   - Test the participant list endpoint
   - Test joining rooms with invitations

## Troubleshooting

### If migrations fail:

- Check you have the necessary permissions in Supabase
- Ensure you're connected to the correct database
- Check the Supabase logs for detailed error messages

### If the backend still shows errors:

- Restart the backend services
- Check that the table and function exist in the database
- Verify the backend is connecting to the correct Supabase project

## Current Status

The backend code has been updated to handle the missing table gracefully:

- If `allowed_emails` table doesn't exist, it will log a warning but continue
- Only room members will be shown until the migration is completed
- All functionality will work fully once migrations are applied

## Next Steps

1. Run the migrations using one of the options above
2. Restart your backend services
3. Test the email invitation functionality
4. The participant list will now show both invited users and room members
