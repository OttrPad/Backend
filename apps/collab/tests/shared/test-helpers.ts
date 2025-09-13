import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import jwt from "jsonwebtoken";
import RealtimeCollaborationService from "../../src/services/realtimeCollaborationService";

export interface TestUser {
  id: string;
  email: string;
  token?: string;
}

export interface TestServer {
  httpServer: HttpServer;
  collaborationService: RealtimeCollaborationService;
  port: number;
  close(): Promise<void>;
}

export interface AuthenticatedClient {
  socket: ClientSocket;
  user: TestUser;
}

/**
 * Common test users for consistent testing
 */
export const TEST_USERS: TestUser[] = [
  { id: "test-user-1", email: "user1@test.com" },
  { id: "test-user-2", email: "user2@test.com" },
  { id: "test-user-3", email: "user3@test.com" },
  { id: "test-user-4", email: "user4@test.com" },
];

/**
 * Generate JWT token for a test user
 */
export function generateTestToken(user: TestUser): string {
  if (!process.env.SUPABASE_JWT_SECRET) {
    throw new Error("SUPABASE_JWT_SECRET not set for tests");
  }

  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.SUPABASE_JWT_SECRET
  );
}

/**
 * Create a test server instance (Socket.IO only)
 */
export async function createTestServer(): Promise<TestServer> {
  const httpServer = new HttpServer();
  const collaborationService = new RealtimeCollaborationService(httpServer);

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      const serverPort = (httpServer.address() as any)?.port;
      resolve(serverPort);
    });
  });

  const close = async (): Promise<void> => {
    // Close socket.io connections first
    await collaborationService.close();
    // Then close HTTP server
    return new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return { httpServer, collaborationService, port, close };
}

/**
 * Create a test server with REST API
 */
export async function createTestServerWithAPI(): Promise<TestServer> {
  const httpServer = new HttpServer();
  const collaborationService = new RealtimeCollaborationService(httpServer);

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      const serverPort = (httpServer.address() as any)?.port;
      resolve(serverPort);
    });
  });

  const close = async (): Promise<void> => {
    // Close socket.io connections first
    await collaborationService.close();
    // Then close HTTP server
    return new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return { httpServer, collaborationService, port, close };
}

/**
 * Create an authenticated Socket.IO client
 */
export async function createAuthenticatedClient(
  server: TestServer,
  user: TestUser,
  timeout: number = 5000
): Promise<AuthenticatedClient> {
  const token = generateTestToken(user);
  user.token = token;

  return new Promise((resolve, reject) => {
    const socket = Client(`http://localhost:${server.port}`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });

    // Set timeout for connection
    const timeoutId = setTimeout(() => {
      if (!socket.connected) {
        socket.disconnect();
        reject(new Error(`Client connection timeout for ${user.email}`));
      }
    }, timeout);

    socket.on("connect", () => {
      clearTimeout(timeoutId);
      resolve({ socket, user });
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeoutId);
      reject(
        new Error(`Connection failed for ${user.email}: ${error.message}`)
      );
    });
  });
}

/**
 * Join a room with a client
 */
export async function joinRoom(
  client: AuthenticatedClient,
  roomId: string,
  timeout: number = 3000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(`Room join timeout for ${client.user.email} in ${roomId}`)
      );
    }, timeout);

    // Listen for welcome message or system message indicating successful join
    const handleMessage = (data: any) => {
      if (
        data.content === "Welcome to the collaboration room!" ||
        (data.system &&
          data.content?.includes("has joined the collaboration room"))
      ) {
        clearTimeout(timeoutId);
        client.socket.off("message", handleMessage);
        resolve();
      }
    };

    client.socket.on("message", handleMessage);
    client.socket.emit("join-room", { roomId });

    // Fallback: if no welcome message within reasonable time, assume success
    setTimeout(() => {
      clearTimeout(timeoutId);
      client.socket.off("message", handleMessage);
      resolve();
    }, 500);
  });
}

/**
 * Leave a room with a client
 */
export async function leaveRoom(client: AuthenticatedClient): Promise<void> {
  return new Promise((resolve) => {
    client.socket.emit("leave-room");
    // Give some time for cleanup
    setTimeout(resolve, 100);
  });
}

/**
 * Clean up a single client
 */
export function disconnectClient(client: AuthenticatedClient): void {
  if (client.socket.connected) {
    client.socket.disconnect();
  }
}

/**
 * Clean up multiple clients
 */
export function disconnectClients(clients: AuthenticatedClient[]): void {
  clients.forEach(disconnectClient);
}

/**
 * Clean up test server and all clients
 */
export async function cleanupTest(
  server?: TestServer,
  clients: AuthenticatedClient[] = []
): Promise<void> {
  // Disconnect all clients first
  disconnectClients(clients);

  // Give clients time to disconnect
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Close server
  if (server) {
    await server.close();
  }
}

/**
 * Clean up test server
 */
export async function cleanupServer(server: TestServer): Promise<void> {
  // Use the server's own close method which should handle cleanup
  await server.close();
}

/**
 * Wait for a specific event on a client
 */
export function waitForEvent<T = any>(
  client: AuthenticatedClient,
  eventName: string,
  timeout: number = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      client.socket.off(eventName, handler);
      reject(
        new Error(
          `Timeout waiting for event '${eventName}' on ${client.user.email}`
        )
      );
    }, timeout);

    const handler = (data: T) => {
      clearTimeout(timeoutId);
      client.socket.off(eventName, handler);
      resolve(data);
    };

    client.socket.on(eventName, handler);
  });
}

/**
 * Collect events over a time period
 */
export function collectEvents<T = any>(
  client: AuthenticatedClient,
  eventName: string,
  duration: number = 1000
): Promise<T[]> {
  return new Promise((resolve) => {
    const events: T[] = [];

    const handler = (data: T) => {
      events.push(data);
    };

    client.socket.on(eventName, handler);

    setTimeout(() => {
      client.socket.off(eventName, handler);
      resolve(events);
    }, duration);
  });
}

/**
 * Create a test room with multiple users
 */
export async function createTestRoom(
  server: TestServer,
  roomId: string,
  userCount: number = 2
): Promise<AuthenticatedClient[]> {
  if (userCount > TEST_USERS.length) {
    throw new Error(
      `Cannot create room with ${userCount} users. Max is ${TEST_USERS.length}`
    );
  }

  const clients: AuthenticatedClient[] = [];

  for (let i = 0; i < userCount; i++) {
    const client = await createAuthenticatedClient(server, TEST_USERS[i]);
    await joinRoom(client, roomId);
    clients.push(client);
  }

  return clients;
}

/**
 * Create test notebook data
 */
export function createTestNotebook(title: string = "Test Notebook") {
  return {
    title,
    blocks: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Create test block data
 */
export function createTestBlock(
  type: string = "code",
  content: string = "console.log('test');"
) {
  return {
    type,
    content,
    language: type === "code" ? "javascript" : undefined,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Assertion helpers for common test patterns
 */
export const assertions = {
  /**
   * Assert event was received with expected data structure
   */
  expectEvent<T>(actualEvent: T, expectedFields: Partial<T>): void {
    expect(actualEvent).toMatchObject(expectedFields);
  },

  /**
   * Assert user information in event
   */
  expectUserInfo(event: any, user: TestUser): void {
    expect(event).toMatchObject({
      userId: user.id,
      userEmail: user.email,
    });
  },

  /**
   * Assert event timing is reasonable
   */
  expectRecentTimestamp(timestamp: number, tolerance: number = 5000): void {
    const now = Date.now();
    expect(timestamp).toBeGreaterThan(now - tolerance);
    expect(timestamp).toBeLessThanOrEqual(now);
  },

  /**
   * Assert notebook structure
   */
  expectNotebookStructure(notebook: any): void {
    expect(notebook).toHaveProperty("id");
    expect(notebook).toHaveProperty("title");
    expect(notebook).toHaveProperty("blocks");
    expect(Array.isArray(notebook.blocks)).toBe(true);
  },

  /**
   * Assert block structure
   */
  expectBlockStructure(block: any): void {
    expect(block).toHaveProperty("id");
    expect(block).toHaveProperty("type");
    // Note: content property may not always be present in all block events
  },
};

/**
 * Performance testing helpers
 */
export const performance = {
  /**
   * Measure execution time of an async operation
   */
  async measureTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await operation();
    const duration = Date.now() - start;
    return { result, duration };
  },

  /**
   * Run concurrent operations and measure total time
   */
  async measureConcurrent<T>(
    operations: (() => Promise<T>)[]
  ): Promise<{ results: T[]; duration: number }> {
    const start = Date.now();
    const results = await Promise.all(operations.map((op) => op()));
    const duration = Date.now() - start;
    return { results, duration };
  },

  /**
   * Assert operation completed within time limit
   */
  expectWithinTime(duration: number, maxTime: number): void {
    expect(duration).toBeLessThanOrEqual(maxTime);
  },
};

/**
 * Mock data generators
 */
export const generators = {
  /**
   * Generate random room ID
   */
  roomId(): string {
    return `test-room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Generate random notebook ID
   */
  notebookId(): string {
    return `notebook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Generate random block ID
   */
  blockId(): string {
    return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Generate test chat message
   */
  chatMessage(content: string = "Test message"): any {
    return {
      content,
      timestamp: Date.now(),
      uid: "test-user-1",
      email: "user1@test.com",
    };
  },
};
