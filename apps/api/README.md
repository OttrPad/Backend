# API Gateway Service

The **API Gateway** serves as the central entry point for all HTTP requests in the Realtime Code Editor backend. It handles authentication, request routing, and provides comprehensive API documentation.

## 🚀 Overview

- **Port**: `4000` (configurable via `API_PORT`)
- **Purpose**: Central HTTP routing, JWT authentication, API documentation
- **Dependencies**: Express.js, Swagger UI, JWT verification
- **Routes HTTP requests to**: Core Service (`4001`)

## 📡 Features

- **🔐 JWT Authentication**: Validates Supabase JWT tokens
- **🔄 Request Proxying**: Intelligent routing to microservices
- **📚 Swagger Documentation**: Interactive API explorer
- **❤️ Health Monitoring**: System and service health checks
- **🛡️ CORS Protection**: Configurable cross-origin policies
- **🔒 Security Headers**: Content security and safety headers

## 🏗️ Architecture

```
Frontend Request → API Gateway → JWT Validation → Core Service → Response
```

## 🛠️ Development

### Start the Service

```bash
# From project root
cd apps/api
pnpm dev

# Or from root using turbo
pnpm dev:api
```

### Environment Variables

```bash
# Service Configuration
API_PORT=4000
NODE_ENV=development

# Authentication
SUPABASE_JWT_SECRET=your_jwt_secret

# Routing
CORE_SERVICE_URL=http://localhost:4001
FRONTEND_URL=http://localhost:3000
```

### Available Scripts

```bash
pnpm dev          # Start in development mode with hot reload
pnpm dev:no-watch # Start without file watching
pnpm build        # Compile TypeScript to JavaScript
pnpm start        # Start production build
```

## 📚 API Endpoints

### Public Endpoints

| Method | Endpoint           | Description              | Auth Required |
| ------ | ------------------ | ------------------------ | ------------- |
| `GET`  | `/`                | Service information      | ❌            |
| `GET`  | `/health`          | Basic health check       | ❌            |
| `GET`  | `/health/services` | Microservices health     | ❌            |
| `GET`  | `/api-docs`        | Swagger UI documentation | ❌            |

### Protected API Routes

All `/api/*` routes require JWT authentication via `Authorization: Bearer <token>` header.

| Method   | Endpoint                      | Description              | Proxied To   |
| -------- | ----------------------------- | ------------------------ | ------------ |
| `GET`    | `/api/rooms`                  | List all rooms           | Core Service |
| `POST`   | `/api/rooms`                  | Create new room          | Core Service |
| `GET`    | `/api/rooms/:id`              | Get room details         | Core Service |
| `PUT`    | `/api/rooms/:id`              | Update room              | Core Service |
| `DELETE` | `/api/rooms/:id`              | Delete room              | Core Service |
| `GET`    | `/api/rooms/:id/participants` | Get room participants    | Core Service |
| `GET`    | `/api/users/profile`          | Get current user profile | Core Service |
| `PUT`    | `/api/users/profile`          | Update user profile      | Core Service |

## 🔐 Authentication Flow

1. **Frontend** sends request with JWT token in `Authorization` header
2. **API Gateway** extracts and validates JWT using Supabase secret
3. **User context** is injected into request headers for downstream services
4. **Request** is proxied to appropriate microservice
5. **Response** is returned to frontend

### JWT Headers Added to Proxied Requests

```typescript
{
  'x-user-id': user.sub,           // User UUID
  'x-user-email': user.email,      // User email
  'x-user-role': user.role,        // User role
  'x-auth-time': user.iat          // Token issued time
}
```

## 🛡️ Security Features

### CORS Configuration

```typescript
cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
});
```

### Content Security Policy

```typescript
"Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
```

### Error Handling

- Sanitized error responses
- No sensitive data leakage
- Proper HTTP status codes
- Structured error format

## 📁 Project Structure

```
apps/api/
├── src/
│   ├── config/
│   │   └── swagger.config.ts      # OpenAPI specification
│   ├── middleware/
│   │   └── auth.middleware.ts     # JWT authentication
│   ├── routes/
│   │   ├── gateway.routes.ts      # Protected API routes
│   │   └── health.routes.ts       # Health check routes
│   ├── services/
│   │   └── proxy.service.ts       # Request proxying logic
│   └── app.ts                     # Express application
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## 🧪 Testing

### Manual Testing

```bash
# Health check
curl http://localhost:4000/health

# Test authentication (should fail)
curl http://localhost:4000/api/rooms

# Test with valid JWT
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:4000/api/rooms

# Interactive testing
open http://localhost:4000/api-docs
```

### Response Examples

**Health Check Response:**

```json
{
  "status": "ok",
  "service": "api-gateway",
  "timestamp": "2025-09-10T10:30:00.000Z",
  "docs": "/api-docs"
}
```

**Error Response:**

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing JWT token"
}
```

## 🔧 Configuration

### Swagger Configuration

The API Gateway automatically generates OpenAPI documentation from route definitions and JSDoc comments.

### Service Discovery

Services are discovered via environment variables:

- `CORE_SERVICE_URL` - Core service endpoint
- Additional services can be added to `proxy.service.ts`

### Proxy Behavior

- **Timeout**: 30 seconds per request
- **Headers**: JWT user context automatically injected
- **Error Handling**: Proper status code forwarding
- **Logging**: Request/response logging in development

## 🚧 Extending the Gateway

### Adding New Microservices

1. **Update proxy service** (`src/services/proxy.service.ts`):

```typescript
const serviceMap = {
  "/api/rooms": process.env.CORE_SERVICE_URL,
  "/api/users": process.env.CORE_SERVICE_URL,
  "/api/new-service": process.env.NEW_SERVICE_URL, // Add here
};
```

2. **Add route definitions** (`src/routes/gateway.routes.ts`):

```typescript
router.use("/new-service/*", authenticateJWT, proxyToService);
```

3. **Update Swagger documentation** in route comments

### Custom Middleware

Add middleware in `src/middleware/` for:

- Rate limiting
- Request validation
- Logging
- Custom authentication

## 📊 Monitoring

### Health Checks

The gateway provides health endpoints for monitoring:

- `GET /health` - Gateway health
- `GET /health/services` - All microservices health

### Metrics (Future)

- Request count and latency
- Error rates by endpoint
- Service response times
- Authentication success/failure rates

## 🔗 Related Services

- **[Core Service](../core/README.md)** - Business logic and data management
- **[Collaboration Service](../collab/README.md)** - Realtime features and chat
- **[Supabase Package](../../packages/supabase/README.md)** - Shared database client

## 📄 API Documentation

When running, visit:

- **Swagger UI**: http://localhost:4000/api-docs
- **OpenAPI JSON**: http://localhost:4000/api-docs.json

## 🐛 Common Issues

### Authentication Failures

```bash
# Check JWT secret configuration
echo $SUPABASE_JWT_SECRET

# Verify token format
# Should start with: eyJhbGciOiJIUzI1NiIs...
```

### Service Proxy Errors

```bash
# Verify core service is running
curl http://localhost:4001/health

# Check service URL configuration
echo $CORE_SERVICE_URL
```

### CORS Issues

```bash
# Update frontend URL in environment
FRONTEND_URL=http://localhost:3000

# Restart the gateway after changes
```

---

**🔗 Part of the [Realtime Code Editor Backend](../../README.md) microservices architecture**
