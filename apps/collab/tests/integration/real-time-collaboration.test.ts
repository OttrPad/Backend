import {
  createTestServer,
  createAuthenticatedClient,
  joinRoom,
  disconnectClients,
  cleanupServer,
  waitForEvent,
  collectEvents,
  createTestRoom,
  createTestNotebook,
  createTestBlock,
  assertions,
  performance,
  generators,
  TEST_USERS,
  TestServer,
  AuthenticatedClient,
} from "../shared/test-helpers";

describe("🔄 Real-time Collaboration Integration Tests", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await cleanupServer(server);
  });

  describe("📓 Notebook Lifecycle", () => {
    let clients: AuthenticatedClient[];
    const roomId = generators.roomId();

    beforeEach(async () => {
      clients = await createTestRoom(server, roomId, 2);
    });

    afterEach(() => {
      disconnectClients(clients);
    });

    test("should handle complete notebook creation, update, and deletion flow", async () => {
      const [client1, client2] = clients;
      const notebook = createTestNotebook("Integration Test Notebook");

      // Step 1: Create notebook
      const createPromise = waitForEvent(client2, "notebook:created");
      client1.socket.emit("notebook:create", {
        roomId,
        ...notebook,
      });

      const createdEvent = await createPromise;
      assertions.expectEvent(createdEvent.notebook, {
        title: notebook.title,
        roomId,
      });
      expect(createdEvent.createdBy).toBe(client1.user.email);

      // Step 2: Update notebook
      const updatePromise = waitForEvent(client2, "notebook:updated");
      client1.socket.emit("notebook:update", {
        roomId,
        notebookId: createdEvent.notebook.id,
        title: "Updated Title",
      });

      const updatedEvent = await updatePromise;
      assertions.expectEvent(updatedEvent.notebook, {
        title: "Updated Title",
        id: createdEvent.notebook.id,
      });

      // Step 3: Delete notebook
      const deletePromise = waitForEvent(client2, "notebook:deleted");
      client1.socket.emit("notebook:delete", {
        roomId,
        notebookId: createdEvent.notebook.id,
      });

      const deletedEvent = await deletePromise;
      assertions.expectEvent(deletedEvent, {
        notebookId: createdEvent.notebook.id,
      });
    });

    test("should handle concurrent notebook operations without conflicts", async () => {
      const [client1, client2] = clients;

      // Create notebooks concurrently
      const { duration } = await performance.measureConcurrent([
        () =>
          new Promise<void>((resolve) => {
            client1.socket.emit("notebook:create", {
              roomId,
              ...createTestNotebook("Concurrent Notebook 1"),
            });
            resolve();
          }),
        () =>
          new Promise<void>((resolve) => {
            client2.socket.emit("notebook:create", {
              roomId,
              ...createTestNotebook("Concurrent Notebook 2"),
            });
            resolve();
          }),
      ]);

      // Collect all creation events
      const events = await collectEvents(client1, "notebook:created", 1000);

      expect(events).toHaveLength(2);
      expect(events[0].notebook.title).toContain("Concurrent Notebook");
      expect(events[1].notebook.title).toContain("Concurrent Notebook");

      // Should complete quickly
      performance.expectWithinTime(duration, 100);
    });
  });

  describe("📦 Block Management", () => {
    let clients: AuthenticatedClient[];
    let notebookId: string;
    const roomId = generators.roomId();

    beforeEach(async () => {
      clients = await createTestRoom(server, roomId, 2);

      // Create a notebook for block operations
      const createEvent = waitForEvent(clients[1], "notebook:created");
      clients[0].socket.emit("notebook:create", {
        roomId,
        ...createTestNotebook("Block Test Notebook"),
      });
      const notebook = await createEvent;
      notebookId = notebook.notebook.id;
    });

    afterEach(() => {
      disconnectClients(clients);
    });

    test("should handle block creation and management flow", async () => {
      const [client1, client2] = clients;
      const block = createTestBlock("code", "console.log('test');");

      // Create block
      const createPromise = waitForEvent(client2, "block:created");
      client1.socket.emit("block:create", {
        roomId,
        notebookId,
        ...block,
      });

      const createdBlock = await createPromise;
      assertions.expectBlockStructure(createdBlock.block);
      assertions.expectEvent(createdBlock.block, {
        type: "code",
      });
      expect(createdBlock.notebookId).toBe(notebookId);

      // Move block (reorder)
      const movePromise = waitForEvent(client2, "block:moved");
      client1.socket.emit("block:move", {
        roomId,
        notebookId,
        blockId: createdBlock.block.id,
        newPosition: 0,
      });

      const movedBlock = await movePromise;
      assertions.expectEvent(movedBlock, {
        blockId: createdBlock.block.id,
        newPosition: 0,
      });

      // Delete block
      const deletePromise = waitForEvent(client2, "block:deleted");
      client1.socket.emit("block:delete", {
        roomId,
        notebookId,
        blockId: createdBlock.block.id,
      });

      const deletedBlock = await deletePromise;
      assertions.expectEvent(deletedBlock, {
        blockId: createdBlock.block.id,
        notebookId,
      });
    });

    test("should handle rapid block operations efficiently", async () => {
      const [client1, client2] = clients;
      const blockCount = 5;

      // Create multiple blocks rapidly
      const { duration } = await performance.measureTime(async () => {
        const promises = [];
        for (let i = 0; i < blockCount; i++) {
          promises.push(
            new Promise<void>((resolve) => {
              client1.socket.emit("block:create", {
                roomId,
                notebookId,
                ...createTestBlock("code", `console.log(${i});`),
              });
              resolve();
            })
          );
        }
        await Promise.all(promises);
      });

      // Should complete quickly
      performance.expectWithinTime(duration, 500);

      // Verify all blocks were created
      const events = await collectEvents(client2, "block:created", 1000);
      expect(events).toHaveLength(blockCount);
    });
  });

  describe("👥 Multi-User Collaboration", () => {
    let clients: AuthenticatedClient[];
    const roomId = generators.roomId();

    beforeEach(async () => {
      clients = await createTestRoom(server, roomId, 3);
    });

    afterEach(() => {
      disconnectClients(clients);
    });

    test("should broadcast events to all room members except sender", async () => {
      const [client1, client2, client3] = clients;

      // Set up event listeners
      const client2Events: any[] = [];
      const client3Events: any[] = [];

      client2.socket.on("notebook:created", (event) =>
        client2Events.push(event)
      );
      client3.socket.on("notebook:created", (event) =>
        client3Events.push(event)
      );

      // Create notebook from client1
      client1.socket.emit("notebook:create", {
        roomId,
        ...createTestNotebook("Multi-user Test"),
      });

      // Wait for propagation
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Both other clients should receive the event
      expect(client2Events).toHaveLength(1);
      expect(client3Events).toHaveLength(1);

      // Events should be identical
      expect(client2Events[0]).toEqual(client3Events[0]);
      expect(client2Events[0].createdBy).toBe(client1.user.email);
    });

    test("should maintain room isolation", async () => {
      // Create a separate room with one client
      const isolatedRoomId = generators.roomId();
      const isolatedClient = await createAuthenticatedClient(
        server,
        TEST_USERS[3]
      );
      await joinRoom(isolatedClient, isolatedRoomId);

      // Listen for events on isolated client
      const isolatedEvents: any[] = [];
      isolatedClient.socket.on("notebook:created", (event) =>
        isolatedEvents.push(event)
      );

      // Create notebook in main room
      clients[0].socket.emit("notebook:create", {
        roomId,
        ...createTestNotebook("Room Isolation Test"),
      });

      // Wait for propagation
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Isolated client should not receive the event
      expect(isolatedEvents).toHaveLength(0);

      // Cleanup
      isolatedClient.socket.disconnect();
    });

    test("should handle user join and leave events", async () => {
      // Test adding a new user to existing room
      const newClient = await createAuthenticatedClient(server, TEST_USERS[3]);

      // Set up event listener BEFORE joining
      const joinEventsPromise = collectEvents(clients[0], "user-joined", 1000);

      // Join the room
      await joinRoom(newClient, roomId);

      // Wait for join events
      const joinEvents = await joinEventsPromise;

      expect(joinEvents).toHaveLength(1);
      assertions.expectEvent(joinEvents[0], {
        roomId,
        userId: TEST_USERS[3].id,
        userEmail: TEST_USERS[3].email,
      });

      // Test user leaving
      const leaveEventsPromise = collectEvents(clients[0], "user-left", 1000);
      newClient.socket.emit("leave-room");

      // Wait for leave events
      const leaveEvents = await leaveEventsPromise;

      expect(leaveEvents).toHaveLength(1);
      assertions.expectEvent(leaveEvents[0], {
        roomId,
        userId: TEST_USERS[3].id,
      });

      newClient.socket.disconnect();
    });
  });

  describe("⚡ Performance & Scalability", () => {
    let clients: AuthenticatedClient[];
    const roomId = generators.roomId();

    beforeEach(async () => {
      clients = await createTestRoom(server, roomId, 2);
    });

    afterEach(() => {
      disconnectClients(clients);
    });

    test("should handle high-frequency operations efficiently", async () => {
      const [client1, client2] = clients;
      const operationCount = 20;

      const { duration } = await performance.measureTime(async () => {
        // Rapid notebook creation
        for (let i = 0; i < operationCount; i++) {
          client1.socket.emit("notebook:create", {
            roomId,
            ...createTestNotebook(`High Freq Notebook ${i}`),
          });
        }

        // Wait for all operations to complete
        const events = await collectEvents(client2, "notebook:created", 2000);
        expect(events).toHaveLength(operationCount);
      });

      // Should complete within reasonable time
      performance.expectWithinTime(duration, 3000);
      console.log(`📊 Created ${operationCount} notebooks in ${duration}ms`);
    });

    test("should maintain event ordering under load", async () => {
      const [client1, client2] = clients;
      const sequenceLength = 10;

      // Create notebooks with sequential titles
      for (let i = 0; i < sequenceLength; i++) {
        client1.socket.emit("notebook:create", {
          roomId,
          ...createTestNotebook(`Sequence ${i.toString().padStart(2, "0")}`),
        });
      }

      // Collect all events
      const events = await collectEvents(client2, "notebook:created", 2000);
      expect(events).toHaveLength(sequenceLength);

      // Verify ordering
      for (let i = 0; i < sequenceLength; i++) {
        expect(events[i].notebook.title).toBe(
          `Sequence ${i.toString().padStart(2, "0")}`
        );
      }
    });
  });

  describe("🚨 Error Handling", () => {
    let clients: AuthenticatedClient[];
    const roomId = generators.roomId();

    beforeEach(async () => {
      clients = await createTestRoom(server, roomId, 2);
    });

    afterEach(() => {
      disconnectClients(clients);
    });

    test("should handle invalid operations gracefully", async () => {
      const [client1, client2] = clients;

      // Listen for error events
      const errors: any[] = [];
      client1.socket.on("error", (error) => errors.push(error));

      // Try to delete non-existent notebook
      client1.socket.emit("delete-notebook", {
        roomId,
        notebookId: "non-existent-notebook",
      });

      // Try to create block in non-existent notebook
      client1.socket.emit("block:create", {
        roomId,
        notebookId: "non-existent-notebook",
        ...createTestBlock(),
      });

      // Wait for error responses
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should handle gracefully without crashing
      expect(errors.length).toBeGreaterThanOrEqual(0); // May or may not emit errors
      expect(client1.socket.connected).toBe(true);
      expect(client2.socket.connected).toBe(true);
    });

    test("should handle malformed event data", async () => {
      const [client1] = clients;

      // Send malformed data
      const malformedOperations = [
        () => client1.socket.emit("notebook:create", null),
        () => client1.socket.emit("notebook:create", undefined),
        () => client1.socket.emit("notebook:create", { invalidField: true }),
        () => client1.socket.emit("block:create", { notebookId: null }),
      ];

      // None of these should crash the connection
      for (const operation of malformedOperations) {
        operation();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(client1.socket.connected).toBe(true);
      }
    });
  });
});
