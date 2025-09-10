# Supabase Package

A **shared Supabase client package** used across all microservices in the Realtime Code Editor backend. Provides a centralized, configured Supabase client with optimized settings for server-side usage.

## 🚀 Overview

- **Purpose**: Shared Supabase client configuration
- **Usage**: Imported by Core Service and other services that need database access
- **Features**: Server-optimized client, connection pooling, type safety
- **Architecture**: Workspace package for code reuse across services

## 📦 Installation

This package is automatically available to all services in the workspace:

```json
{
  "dependencies": {
    "@packages/supabase": "workspace:*"
  }
}
```

## 🔧 Usage

### Basic Import

```typescript
import { supabase } from "@packages/supabase";

// Use the configured client
const { data, error } = await supabase
  .from("rooms")
  .select("*")
  .eq("owner_id", userId);
```

### Service Integration

```typescript
// In any microservice
import { supabase } from "@packages/supabase";

export class RoomService {
  async getAllRooms(userId: string) {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        id,
        name,
        description,
        created_at,
        owner_id
      `
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch rooms: ${error.message}`);
    }

    return data;
  }
}
```

## ⚙️ Configuration

### Client Settings

The package exports a pre-configured Supabase client optimized for server-side usage:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  {
    auth: {
      autoRefreshToken: false, // Disable for server-side
      persistSession: false, // No session persistence needed
      detectSessionInUrl: false, // Disable URL-based session detection
    },
    db: {
      schema: "public", // Default schema
    },
    global: {
      headers: {
        "X-Client-Info": "realtime-code-editor-backend",
      },
    },
  }
);
```

### Environment Requirements

```bash
# Required environment variables
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# Optional: Service-specific key (future use)
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

## 🏗️ Project Structure

```
packages/supabase/
├── src/
│   └── index.ts              # Main client export
├── package.json              # Package configuration
├── tsconfig.json            # TypeScript configuration
├── tsconfig.tsbuildinfo     # Build cache
└── README.md                # This documentation
```

## 🔧 Features

### Server-Optimized Configuration

- **No Auth Refresh**: Disabled automatic token refresh for server environment
- **No Session Persistence**: Stateless operation for microservices
- **Connection Pooling**: Supabase handles connection optimization
- **Error Handling**: Structured error responses

### Type Safety

```typescript
// Automatic TypeScript types for your database schema
interface Room {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

// Type-safe database operations
const { data } = await supabase.from("rooms").select("*").returns<Room[]>();
```

### Row Level Security (RLS)

```typescript
// RLS policies are automatically enforced
// Client respects Supabase RLS policies for data access control

// Example: Users can only access their own rooms
const { data } = await supabase
  .from("rooms")
  .select("*")
  .eq("owner_id", userId); // RLS enforces this automatically
```

## 🧪 Testing

### Connection Testing

```typescript
// Test database connectivity
import { supabase } from "@packages/supabase";

export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("count(*)")
      .limit(1);

    if (error) {
      console.error("Database connection failed:", error);
      return false;
    }

    console.log("Database connection successful");
    return true;
  } catch (error) {
    console.error("Connection test failed:", error);
    return false;
  }
}
```

### Query Examples

```typescript
// Create operation
const { data: newRoom, error: createError } = await supabase
  .from("rooms")
  .insert({
    name: "New Room",
    description: "A collaborative workspace",
    owner_id: userId,
  })
  .select()
  .single();

// Read operation with joins
const { data: roomsWithParticipants, error: readError } = await supabase
  .from("rooms")
  .select(
    `
    *,
    room_participants (
      user_id,
      role,
      joined_at
    )
  `
  )
  .eq("owner_id", userId);

// Update operation
const { data: updatedRoom, error: updateError } = await supabase
  .from("rooms")
  .update({
    name: "Updated Room Name",
    updated_at: new Date().toISOString(),
  })
  .eq("id", roomId)
  .eq("owner_id", userId) // RLS ensures user can only update their rooms
  .select()
  .single();

// Delete operation
const { error: deleteError } = await supabase
  .from("rooms")
  .delete()
  .eq("id", roomId)
  .eq("owner_id", userId); // RLS ensures user can only delete their rooms
```

## 🔒 Security Considerations

### API Key Usage

- **Anon Key**: Used for most operations with RLS enforcement
- **Service Key**: Reserved for admin operations (future implementation)
- **JWT Context**: User context from JWT tokens for RLS

### RLS Policies

```sql
-- Example RLS policy for rooms table
CREATE POLICY "Users can only access their rooms" ON rooms
  FOR ALL USING (auth.uid() = owner_id);

-- Example RLS policy for room participants
CREATE POLICY "Users can access rooms they participate in" ON room_participants
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() IN (
      SELECT owner_id FROM rooms WHERE id = room_participants.room_id
    )
  );
```

### Error Handling

```typescript
// Centralized error handling
export function handleSupabaseError(error: any) {
  if (error?.code === "PGRST116") {
    return { message: "Resource not found", statusCode: 404 };
  }

  if (error?.code === "42501") {
    return { message: "Insufficient permissions", statusCode: 403 };
  }

  return { message: "Database operation failed", statusCode: 500 };
}
```

## 📈 Performance Optimization

### Query Optimization

```typescript
// Select only needed fields
const { data } = await supabase
  .from("rooms")
  .select("id, name, created_at") // Don't select unnecessary columns
  .eq("owner_id", userId);

// Use efficient filtering
const { data } = await supabase
  .from("rooms")
  .select("*")
  .eq("owner_id", userId)
  .order("created_at", { ascending: false })
  .limit(10); // Paginate results
```

### Connection Management

- Supabase handles connection pooling automatically
- Client reuses connections efficiently
- No manual connection management needed

## 🚧 Future Enhancements

### Planned Features

- **Service Role Client**: Separate client for admin operations
- **Query Builder Helpers**: Common query patterns
- **Migration Helpers**: Database schema management
- **Caching Layer**: Redis integration for query caching
- **Monitoring**: Query performance tracking

### Type Generation

```bash
# Future: Automatic type generation from Supabase schema
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```

## 🔗 Related Documentation

- **[Core Service](../../apps/core/README.md)** - Primary consumer of this package
- **[API Gateway](../../apps/api/README.md)** - Authentication and routing
- **[Root README](../../README.md)** - Overall architecture overview
- **[Supabase Documentation](https://supabase.com/docs)** - Official Supabase docs

## 🐛 Troubleshooting

### Connection Issues

```bash
# Test Supabase connectivity
curl "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_KEY"

# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_KEY
```

### Common Errors

- **Connection refused**: Check SUPABASE_URL format
- **API key invalid**: Verify SUPABASE_KEY from project settings
- **RLS violations**: Check Row Level Security policies
- **Table not found**: Verify table exists and is accessible

---

**🔗 Part of the [Realtime Code Editor Backend](../../README.md) microservices architecture**
