# Core Service

The **Core Service** handles the fundamental business logic for the Realtime Code Editor, including room management, user operations, and data persistence with Supabase.

## 🚀 Overview

- **Port**: `4001` (configurable via `CORE_PORT`)
- **Purpose**: Business logic, data management, room operations
- **Dependencies**: Express.js, Supabase, JWT verification
- **Database**: Supabase PostgreSQL

## 📡 Features

- **🏠 Room Management**: Create, update, delete, and list rooms
- **👥 User Management**: Profile management and user operations
- **🔐 Access Control**: Room access validation and permissions
- **📊 Data Persistence**: Supabase database operations
- **🔒 Authentication**: Service-level JWT validation
- **❤️ Health Monitoring**: Service health and database connectivity

## 🏗️ Architecture

```
API Gateway → Core Service → Supabase Database
```

The Core Service receives authenticated requests from the API Gateway with user context headers and performs database operations.

## 🛠️ Development

### Start the Service

```bash
# From project root
cd apps/core
pnpm dev

# Or from root using turbo
pnpm dev:core
```

### Environment Variables

```bash
# Service Configuration
CORE_PORT=4001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret

# Service Authentication (for inter-service communication)
SERVICE_SECRET=your_service_secret_key
```

### Available Scripts

```bash
pnpm dev          # Start in development mode with hot reload
pnpm dev:no-watch # Start without file watching
pnpm build        # Compile TypeScript to JavaScript
pnpm start        # Start production build
```

## 📚 API Endpoints

### Health & Status

| Method | Endpoint  | Description          | Auth Required |
| ------ | --------- | -------------------- | ------------- |
| `GET`  | `/health` | Service health check | ❌            |
| `GET`  | `/status` | Detailed status info | ❌            |

### Room Management

| Method   | Endpoint                  | Description           | Auth Required |
| -------- | ------------------------- | --------------------- | ------------- |
| `GET`    | `/rooms`                  | List user's rooms     | ✅ (Headers)  |
| `POST`   | `/rooms`                  | Create new room       | ✅ (Headers)  |
| `GET`    | `/rooms/:id`              | Get room details      | ✅ (Headers)  |
| `PUT`    | `/rooms/:id`              | Update room           | ✅ (Headers)  |
| `DELETE` | `/rooms/:id`              | Delete room           | ✅ (Headers)  |
| `GET`    | `/rooms/:id/participants` | Get room participants | ✅ (Headers)  |

### User Management

| Method | Endpoint         | Description              | Auth Required |
| ------ | ---------------- | ------------------------ | ------------- |
| `GET`  | `/users/profile` | Get current user profile | ✅ (Headers)  |
| `PUT`  | `/users/profile` | Update user profile      | ✅ (Headers)  |

## 🔐 Authentication

The Core Service expects authenticated requests with user context provided via headers from the API Gateway:

### Required Headers (from API Gateway)

```typescript
{
  'x-user-id': string,     // User UUID from JWT
  'x-user-email': string,  // User email from JWT
  'x-user-role': string,   // User role from JWT
  'x-auth-time': string    // Token issued timestamp
}
```

### Service-to-Service Authentication

For direct service communication (bypassing API Gateway):

```typescript
{
  'x-service-auth': 'Bearer SERVICE_SECRET'
}
```

## 📊 Database Schema

### Tables Managed

- **`rooms`** - Room metadata and configuration
- **`room_participants`** - Room access and participation
- **`users`** - User profiles and settings
- **`allowed_emails`** - Email whitelist for access control

### Key Operations

- **Room CRUD**: Full lifecycle management
- **Access Control**: Permission validation
- **User Sync**: Profile synchronization with Supabase Auth
- **Participant Management**: Room membership tracking

## 📁 Project Structure

```
apps/core/
├── src/
│   ├── controllers/
│   │   ├── realtimeController.ts      # Realtime/WebSocket endpoints
│   │   ├── room.Controller.ts         # Room management logic
│   │   ├── roomAccessController.ts    # Access control logic
│   │   └── userController.ts          # User management logic
│   ├── lib/
│   │   └── supabaseServer.ts          # Supabase client configuration
│   ├── middleware/
│   │   └── service-auth.middleware.ts # Authentication middleware
│   ├── routes/
│   │   ├── realtime.routes.ts         # Realtime endpoints
│   │   ├── room.routes.ts             # Room endpoints
│   │   └── user.routes.ts             # User endpoints
│   ├── services/
│   │   ├── allowedEmailService.ts     # Email whitelist service
│   │   ├── realtimeService.ts         # Realtime coordination
│   │   ├── roomService.ts             # Room business logic
│   │   └── roomUserService.ts         # Room-user relationships
│   └── app.ts                         # Express application
├── package.json                       # Dependencies and scripts
├── tsconfig.json                      # TypeScript configuration
└── README.md                          # This file
```

## 🔧 Business Logic

### Room Service

**Create Room:**

```typescript
// Validates user permissions
// Generates unique room ID
// Stores room metadata in Supabase
// Returns room details
```

**Room Access Control:**

```typescript
// Validates user access to room
// Checks owner permissions
// Validates participant status
// Returns access details
```

### User Service

**Profile Management:**

```typescript
// Syncs with Supabase Auth
// Manages user preferences
// Handles profile updates
// Returns user data
```

## 🧪 Testing

### Manual Testing

```bash
# Health check
curl http://localhost:4001/health

# Test room creation (with headers from API Gateway)
curl -X POST http://localhost:4001/rooms \
  -H "x-user-id: user-uuid" \
  -H "x-user-email: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Room", "description": "Test room"}'

# Test with service auth
curl http://localhost:4001/rooms \
  -H "x-service-auth: Bearer YOUR_SERVICE_SECRET"
```

### Response Examples

**Health Check:**

```json
{
  "status": "ok",
  "service": "core",
  "database": "connected",
  "timestamp": "2025-09-10T10:30:00.000Z"
}
```

**Room Creation:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Test Room",
  "description": "Test room",
  "owner_id": "user-uuid",
  "created_at": "2025-09-10T10:30:00.000Z",
  "updated_at": "2025-09-10T10:30:00.000Z"
}
```

## 🔧 Configuration

### Supabase Connection

```typescript
// Configured in lib/supabaseServer.ts
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

### Service Authentication

```typescript
// Middleware for inter-service communication
// Validates SERVICE_SECRET for direct access
// Bypasses user authentication for system operations
```

## 📊 Error Handling

### Common Error Responses

**Authentication Error:**

```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid user context headers"
}
```

**Room Not Found:**

```json
{
  "error": "Not Found",
  "message": "Room with ID 'room-id' not found"
}
```

**Database Error:**

```json
{
  "error": "Database Error",
  "message": "Failed to connect to database"
}
```

## 🚧 Extending the Service

### Adding New Controllers

1. **Create controller** in `src/controllers/`:

```typescript
export const newFeatureHandler = async (req: Request, res: Response) => {
  // Business logic here
};
```

2. **Add routes** in `src/routes/`:

```typescript
router.get("/new-feature", newFeatureHandler);
```

3. **Update app.ts**:

```typescript
app.use("/new-feature", newFeatureRoutes);
```

### Database Operations

Use the Supabase client from `lib/supabaseServer.ts`:

```typescript
import { supabase } from "../lib/supabaseServer";

const { data, error } = await supabase
  .from("table_name")
  .select("*")
  .eq("user_id", userId);
```

## 📈 Performance Considerations

### Database Queries

- Use selective field queries
- Implement proper indexing
- Batch operations when possible
- Use RLS (Row Level Security) for access control

### Caching Strategy

- Room metadata caching
- User profile caching
- Participant list caching
- Cache invalidation on updates

### Connection Pooling

- Supabase handles connection pooling
- Monitor connection usage
- Implement connection limits if needed

## 🔗 Related Services

- **[API Gateway](../api/README.md)** - Routes requests to this service
- **[Collaboration Service](../collab/README.md)** - Handles realtime features
- **[Supabase Package](../../packages/supabase/README.md)** - Shared database client

## 🐛 Common Issues

### Database Connection Issues

```bash
# Check Supabase URL and key
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Test connection
curl "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_KEY"
```

### Authentication Problems

```bash
# Verify headers are being passed from API Gateway
# Check middleware configuration
# Validate JWT secret matches Supabase project
```

### Service Discovery

```bash
# Ensure core service is accessible
curl http://localhost:4001/health

# Check if API Gateway can reach core service
echo $CORE_SERVICE_URL
```

## 📊 Database Migrations

### Schema Management

- Use Supabase Dashboard for schema changes
- Implement RLS policies for security
- Create indexes for performance
- Backup before major changes

### Sample Policies

**Room Access Policy:**

```sql
CREATE POLICY "Users can only access their rooms" ON rooms
  FOR ALL USING (auth.uid() = owner_id);
```

---

**🔗 Part of the [Realtime Code Editor Backend](../../README.md) microservices architecture**
