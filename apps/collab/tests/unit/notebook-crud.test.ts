import {
  createTestServer,
  createAuthenticatedClient,
  joinRoom,
  disconnectClients,
  cleanupTest,
  waitForEvent,
  collectEvents,
  TEST_USERS,
  generators,
  TestServer,
  AuthenticatedClient,
} from "../shared/test-helpers";


// pnpm test --runInBand --detectOpenHandles --verbose --testPathPattern "tests/unit"

describe("Comprehensive Notebook CRUD & Broadcasting", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await cleanupTest(server);
  });

  describe("Multi-User Notebook Broadcasting", () => {
    it("should broadcast notebook creation to all room members", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const client3 = await createAuthenticatedClient(server, TEST_USERS[2]);
      const roomId = generators.roomId();

      // First user joins and triggers default notebook creation
      const defaultCreationPromise = waitForEvent(client1, "notebook:created");
      await joinRoom(client1, roomId);
      await defaultCreationPromise; // Wait for default notebook creation

      // Subsequent users join and should receive notebook history, not creation events
      const history2Promise = waitForEvent(client2, "notebook-history");
      const history3Promise = waitForEvent(client3, "notebook-history");

      await joinRoom(client2, roomId);
      await joinRoom(client3, roomId);

      // Wait for notebook history to be sent to new users
      await Promise.all([history2Promise, history3Promise]);

      const testTitle = "Multi-User Test Notebook";

      // Set up listeners for new notebook creation (all should receive)
      const event1Promise = waitForEvent(client1, "notebook:created");
      const event2Promise = waitForEvent(client2, "notebook:created");
      const event3Promise = waitForEvent(client3, "notebook:created");

      // Client1 creates a new notebook
      client1.socket.emit("notebook:create", {
        roomId,
        title: testTitle,
      });

      // All clients should receive the creation event
      const [event1, event2, event3] = await Promise.all([
        event1Promise,
        event2Promise,
        event3Promise,
      ]);

      // Validate all events have the same notebook data
      for (const event of [event1, event2, event3]) {
        expect(event).toMatchObject({
          notebook: {
            title: testTitle,
            roomId,
            createdBy: TEST_USERS[0].id,
          },
          createdBy: TEST_USERS[0].email,
        });
        expect(typeof event.notebook.id).toBe("string");
        expect(typeof event.timestamp).toBe("number");
      }

      // All events should have the same notebook ID
      expect(event1.notebook.id).toBe(event2.notebook.id);
      expect(event2.notebook.id).toBe(event3.notebook.id);

      disconnectClients([client1, client2, client3]);
    });

    it("should broadcast notebook deletion to all room members", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const roomId = generators.roomId();

      // First user joins and triggers default notebook creation
      const defaultCreationPromise = waitForEvent(client1, "notebook:created");
      await joinRoom(client1, roomId);
      await defaultCreationPromise;

      // Second user joins and receives notebook history
      const historyPromise = waitForEvent(client2, "notebook-history");
      await joinRoom(client2, roomId);
      await historyPromise;

      // Create a notebook to delete
      const create1Promise = waitForEvent(client1, "notebook:created");
      const create2Promise = waitForEvent(client2, "notebook:created");

      client1.socket.emit("notebook:create", {
        roomId,
        title: "To Be Deleted",
      });

      const [createdEvent1] = await Promise.all([
        create1Promise,
        create2Promise,
      ]);
      const notebookId = createdEvent1.notebook.id;

      // Set up deletion event listeners
      const delete1Promise = waitForEvent(client1, "notebook:deleted");
      const delete2Promise = waitForEvent(client2, "notebook:deleted");

      // Delete the notebook
      client1.socket.emit("notebook:delete", {
        roomId,
        notebookId,
      });

      const [deleteEvent1, deleteEvent2] = await Promise.all([
        delete1Promise,
        delete2Promise,
      ]);

      // Validate deletion events
      for (const event of [deleteEvent1, deleteEvent2]) {
        expect(event).toMatchObject({
          notebookId,
          deletedBy: TEST_USERS[0].email,
        });
        expect(typeof event.timestamp).toBe("number");
      }

      disconnectClients([client1, client2]);
    });

    it("should broadcast notebook updates to all room members", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const roomId = generators.roomId();

      // First user joins and triggers default notebook creation
      const defaultCreationPromise = waitForEvent(client1, "notebook:created");
      await joinRoom(client1, roomId);
      await defaultCreationPromise;

      // Second user joins and receives notebook history
      const historyPromise = waitForEvent(client2, "notebook-history");
      await joinRoom(client2, roomId);
      await historyPromise;

      // Create a notebook to update
      const create1Promise = waitForEvent(client1, "notebook:created");
      const create2Promise = waitForEvent(client2, "notebook:created");

      client1.socket.emit("notebook:create", {
        roomId,
        title: "Original Title",
      });

      const [createdEvent1] = await Promise.all([
        create1Promise,
        create2Promise,
      ]);
      const notebookId = createdEvent1.notebook.id;

      const newTitle = "Updated Title";

      // Set up update event listeners
      const update1Promise = waitForEvent(client1, "notebook:updated");
      const update2Promise = waitForEvent(client2, "notebook:updated");

      // Update the notebook
      client1.socket.emit("notebook:update", {
        notebookId,
        title: newTitle,
      });

      const [updateEvent1, updateEvent2] = await Promise.all([
        update1Promise,
        update2Promise,
      ]);

      // Validate update events
      for (const event of [updateEvent1, updateEvent2]) {
        expect(event).toMatchObject({
          notebook: {
            id: notebookId,
            title: newTitle,
            roomId,
          },
          updatedBy: TEST_USERS[0].email,
        });
        expect(typeof event.timestamp).toBe("number");
      }

      disconnectClients([client1, client2]);
    });
  });

  describe("Room Isolation", () => {
    it("should isolate notebook operations between different rooms", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const roomId1 = generators.roomId();
      const roomId2 = generators.roomId();

      // Join different rooms - each should get their own default notebook
      const default1Promise = waitForEvent(client1, "notebook:created");
      const default2Promise = waitForEvent(client2, "notebook:created");

      await joinRoom(client1, roomId1);
      await joinRoom(client2, roomId2);

      await Promise.all([default1Promise, default2Promise]);

      // Set up event collection for client2 - should NOT receive events from room1
      const client2Events = collectEvents(client2, "notebook:created", 1000);

      // Client1 creates notebook in room1
      const create1Promise = waitForEvent(client1, "notebook:created");

      client1.socket.emit("notebook:create", {
        roomId: roomId1,
        title: "Room 1 Notebook",
      });

      // Client1 should receive the event
      await create1Promise;

      // Client2 should NOT receive any events
      const client2ReceivedEvents = await client2Events;
      expect(client2ReceivedEvents).toHaveLength(0);

      disconnectClients([client1, client2]);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent notebook creation correctly", async () => {
      const client = await createAuthenticatedClient(server, TEST_USERS[0]);
      const roomId = generators.roomId();

      // Join room and wait for default
      const defaultPromise = waitForEvent(client, "notebook:created");
      await joinRoom(client, roomId);
      await defaultPromise;

      // Set up to collect multiple notebook creation events
      const eventsPromise = collectEvents(client, "notebook:created", 2000);

      // Create multiple notebooks rapidly
      client.socket.emit("notebook:create", { roomId, title: "Notebook 1" });
      client.socket.emit("notebook:create", { roomId, title: "Notebook 2" });
      client.socket.emit("notebook:create", { roomId, title: "Notebook 3" });

      const events = await eventsPromise;

      // Should have received 3 creation events
      expect(events.length).toBe(3);

      // Verify all notebooks were created with unique IDs
      const notebookIds = events.map((e) => e.notebook.id);
      const uniqueIds = new Set(notebookIds);
      expect(uniqueIds.size).toBe(3);

      // Verify titles
      const titles = events.map((e) => e.notebook.title).sort();
      expect(titles).toEqual(["Notebook 1", "Notebook 2", "Notebook 3"]);

      disconnectClients([client]);
    });
  });

  describe("Error Handling", () => {
    it("should handle update of non-existent notebook gracefully", async () => {
      const client = await createAuthenticatedClient(server, TEST_USERS[0]);
      const roomId = generators.roomId();

      // Join room and wait for default
      const defaultPromise = waitForEvent(client, "notebook:created");
      await joinRoom(client, roomId);
      await defaultPromise;

      const fakeNotebookId = generators.notebookId();

      // Listen for error event
      const errorPromise = waitForEvent(client, "error");

      client.socket.emit("notebook:update", {
        notebookId: fakeNotebookId,
        title: "New Title",
      });

      const errorEvent = await errorPromise;

      expect(errorEvent).toMatchObject({
        message: "Notebook not found",
      });

      disconnectClients([client]);
    });

    it("should still broadcast deletion events for non-existent notebooks", async () => {
      const client = await createAuthenticatedClient(server, TEST_USERS[0]);
      const roomId = generators.roomId();

      // Join room and wait for default
      const defaultPromise = waitForEvent(client, "notebook:created");
      await joinRoom(client, roomId);
      await defaultPromise;

      const fakeNotebookId = generators.notebookId();

      // Should still broadcast deletion event even for non-existent notebook
      const deletePromise = waitForEvent(client, "notebook:deleted");

      client.socket.emit("notebook:delete", {
        roomId,
        notebookId: fakeNotebookId,
      });

      const deleteEvent = await deletePromise;

      expect(deleteEvent).toMatchObject({
        notebookId: fakeNotebookId,
        deletedBy: TEST_USERS[0].email,
      });

      disconnectClients([client]);
    });
  });

  describe("Notebook Lifecycle", () => {
    it("should not create duplicate default notebook for subsequent users", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const roomId = generators.roomId();

      // First user joins and creates default notebook
      const default1Promise = waitForEvent(client1, "notebook:created");
      await joinRoom(client1, roomId);
      await default1Promise;

      // Second user joins - should receive notebook history, not trigger new creation
      const historyPromise = waitForEvent(client2, "notebook-history");
      const client2Events = collectEvents(client2, "notebook:created", 1000);

      await joinRoom(client2, roomId);
      await historyPromise;

      // Client2 should not receive any new notebook creation events
      const client2ReceivedEvents = await client2Events;
      expect(client2ReceivedEvents).toHaveLength(0);

      disconnectClients([client1, client2]);
    });

    it("should send notebook history to new users joining room with existing notebooks", async () => {
      const client1 = await createAuthenticatedClient(server, TEST_USERS[0]);
      const client2 = await createAuthenticatedClient(server, TEST_USERS[1]);
      const roomId = generators.roomId();

      // First user joins and gets default notebook
      const defaultPromise = waitForEvent(client1, "notebook:created");
      await joinRoom(client1, roomId);
      await defaultPromise;

      // Create additional notebooks
      const create1Promise = waitForEvent(client1, "notebook:created");
      client1.socket.emit("notebook:create", {
        roomId,
        title: "Custom Notebook",
      });
      await create1Promise;

      // Second user joins - should receive notebook history
      const historyPromise = waitForEvent(client2, "notebook-history");
      await joinRoom(client2, roomId);
      const historyEvent = await historyPromise;

      // Should receive both the default and custom notebooks
      expect(historyEvent).toMatchObject({
        roomId,
        notebooks: expect.arrayContaining([
          expect.objectContaining({ title: "Main" }),
          expect.objectContaining({ title: "Custom Notebook" }),
        ]),
      });
      expect(historyEvent.notebooks).toHaveLength(2);

      disconnectClients([client1, client2]);
    });
  });
});
