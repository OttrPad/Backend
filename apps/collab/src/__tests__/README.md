# Real-time Broadcasting Test Suite Documentation

## Overview

This comprehensive test suite validates all real-time broadcasting functionality in the collaborative code editor backend. The tests cover Socket.IO events, REST API broadcasting, and YJS document management.

## Test Structure

### 📡 Socket.IO Event Broadcasting (`broadcasting.test.ts`)

Tests the core real-time WebSocket functionality using Socket.IO.

#### Room Management

- ✅ User join/leave events
- ✅ Room isolation and targeting
- ✅ Multi-user collaboration

#### Notebook Lifecycle

- ✅ `notebook:created` - When notebooks are created via Socket.IO
- ✅ `notebook:updated` - When notebook metadata changes
- ✅ `notebook:deleted` - When notebooks are removed

#### Block Management

- ✅ `block:created` - New code/markdown blocks
- ✅ `block:deleted` - Block removal
- ✅ `block:moved` - Block position changes

#### Code Collaboration

- ✅ `code-changed` - Real-time code edits with block targeting
- ✅ `cursor-moved` - User cursor position updates
- ✅ `selection-changed` - Text selection broadcasts
- ✅ `typing-start`/`typing-stop` - Typing indicators
- ✅ `language-change` - Block language updates

#### User Presence

- ✅ `user-focus-block` - When users focus on blocks
- ✅ `user-blur-block` - When users leave blocks
- ✅ `block-content-changed` - Block content updates

#### YJS Synchronization

- ✅ `yjs-update` - Document state changes
- ✅ `yjs-state` - Document state requests
- ✅ Multi-client synchronization

#### Chat System

- ✅ Real-time chat messages
- ✅ Room-specific message delivery

#### Error Handling

- ✅ Invalid authentication
- ✅ Missing parameters
- ✅ Network failures

### 🌐 REST API Broadcasting (`rest-broadcasting.test.ts`)

Tests REST API endpoints that also broadcast Socket.IO events.

#### Notebook REST Operations

- ✅ `POST /api/notebooks` → broadcasts `notebook:created`
- ✅ `PUT /api/notebooks/:id` → broadcasts `notebook:updated`
- ✅ `DELETE /api/notebooks/:id` → broadcasts `notebook:deleted`

#### Block REST Operations

- ✅ `POST /api/notebooks/:id/blocks` → broadcasts `block:created`
- ✅ `PUT /api/notebooks/:id/blocks/:blockId` → broadcasts `block:updated`
- ✅ `DELETE /api/notebooks/:id/blocks/:blockId` → broadcasts `block:deleted`
- ✅ `PUT /api/notebooks/:id/blocks/:blockId/move` → broadcasts `block:moved`

#### Authentication & Security

- ✅ JWT token validation
- ✅ Unauthorized request rejection
- ✅ Token expiry handling

#### Event Targeting

- ✅ Room-specific broadcasting
- ✅ Event isolation between rooms
- ✅ Concurrent operation handling

#### Performance

- ✅ High-frequency operation handling
- ✅ Event ordering guarantees
- ✅ Concurrent client management

### 📄 YJS Document Management (`yjs-management.test.ts`)

Tests the YJS-based collaborative document management system.

#### Document Creation

- ✅ Document initialization
- ✅ Instance caching and reuse
- ✅ Document isolation

#### Block & Text Management

- ✅ Block creation and management
- ✅ Y.Text handling for collaborative editing
- ✅ Content synchronization

#### Notebook Operations

- ✅ In-memory notebook CRUD
- ✅ Room-based organization
- ✅ Metadata management

#### Real-time Synchronization

- ✅ YJS update broadcasting
- ✅ Document state sharing
- ✅ Multi-client collaboration

#### State Management

- ✅ Document state serialization
- ✅ Update application
- ✅ Cleanup and resource management

## Running Tests

### Individual Test Suites

```bash
# Run all tests
npm test

# Run specific test suite
npm test broadcasting.test.ts
npm test rest-broadcasting.test.ts
npm test yjs-management.test.ts

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Comprehensive Test Runner

```bash
# Run all broadcasting tests with detailed reporting
npm run test:broadcasting

# Run integration tests
npm run test:integration

# Verbose test output
npm run test:verbose
```

### Custom Test Runner Features

The `run-tests.js` script provides:

- 📊 **Detailed Progress Reporting** - Real-time test execution status
- 🎯 **Feature Coverage Mapping** - Shows which features each test covers
- ⚡ **Performance Metrics** - Test execution times and statistics
- 🔧 **Dependency Validation** - Checks for required packages
- 📋 **Comprehensive Summary** - Final report with recommendations
- 🚫 **Error Isolation** - Sequential execution to prevent port conflicts

## Test Configuration

### Environment Requirements

```bash
# Required environment variables (.env file)
SUPABASE_JWT_SECRET=your-jwt-secret-here
COLLABORATION_HTTP_PORT=5002
FRONTEND_URL=http://localhost:3000
```

### Dependencies

The following packages are required for testing:

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.5.0",
    "socket.io-client": "^4.8.1",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.0"
  }
}
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000,
  detectOpenHandles: true,
  forceExit: true,
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.test.ts"],
};
```

## Test Architecture

### Mock Data Structure

```typescript
const mockUsers = [
  { id: "user1", email: "user1@test.com" },
  { id: "user2", email: "user2@test.com" },
  { id: "user3", email: "user3@test.com" },
];
```

### Authentication Flow

1. Generate JWT tokens using test user data
2. Connect Socket.IO clients with authentication
3. Join test rooms for isolation
4. Execute test scenarios
5. Verify event broadcasting

### Event Verification Pattern

```typescript
// Setup event listeners
let receivedEvents: any[] = [];
client.on("event-name", (data) => {
  receivedEvents.push(data);
});

// Trigger action
client.emit("action", payload);

// Verify results
await new Promise((resolve) => setTimeout(resolve, 200));
expect(receivedEvents).toHaveLength(1);
expect(receivedEvents[0]).toMatchObject(expectedData);
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Tests run sequentially to avoid port conflicts
   - Use random ports when possible
   - Add delays between test suites

2. **JWT Authentication**
   - Ensure `SUPABASE_JWT_SECRET` is set
   - Use valid JWT tokens for all requests
   - Check token expiry in long-running tests

3. **Socket.IO Connections**
   - Properly disconnect clients after tests
   - Use connection timeouts
   - Handle connection errors gracefully

4. **Event Timing**
   - Add appropriate delays for event propagation
   - Use Promise-based event handling
   - Account for network latency

### Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with verbose output
npm run test:verbose -- --testNamePattern="specific test name"
```

## Coverage Goals

- ✅ **100% Event Broadcasting** - All real-time events tested
- ✅ **Authentication Coverage** - All auth scenarios validated
- ✅ **Error Handling** - Comprehensive error case testing
- ✅ **Performance Validation** - Concurrent operation testing
- ✅ **Integration Testing** - REST + Socket.IO coordination

## Contributing

When adding new real-time features:

1. Add corresponding tests to appropriate test file
2. Update the test runner configuration
3. Add coverage documentation
4. Ensure proper cleanup in tests
5. Test both success and failure scenarios

## Performance Benchmarks

The test suite measures:

- **Event Latency** - Time between trigger and broadcast
- **Concurrent Users** - Multiple clients in same room
- **Message Throughput** - High-frequency event handling
- **Memory Usage** - Document and connection management
- **Error Recovery** - Graceful failure handling

Target performance metrics:

- Event latency: < 50ms
- Concurrent users: 100+ per room
- Message rate: 1000+ events/second
- Memory growth: Linear with active connections
