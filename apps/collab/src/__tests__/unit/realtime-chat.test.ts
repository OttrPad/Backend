import {
  createTestServer,
  createAuthenticatedClient,
  joinRoom,
  cleanupTest,
  TEST_USERS,
  TestServer,
  AuthenticatedClient,
} from "../shared/test-helpers";

interface ChatMessage {
  uid: string;
  email: string;
  content: string;
  timestamp: number;
}

describe("Realtime Chat Feature", () => {
  let server: TestServer;
  let client1: AuthenticatedClient;
  let client2: AuthenticatedClient;
  let client3: AuthenticatedClient;

  const ROOM_ID = "test-room-chat";
  const USER1 = TEST_USERS[0];
  const USER2 = TEST_USERS[1];
  const USER3 = TEST_USERS[2];

  beforeEach(async () => {
    server = await createTestServer();

    // Create authenticated clients
    client1 = await createAuthenticatedClient(server, USER1);
    client2 = await createAuthenticatedClient(server, USER2);
    client3 = await createAuthenticatedClient(server, USER3);

    // Join room for all clients
    await joinRoom(client1, ROOM_ID);
    await joinRoom(client2, ROOM_ID);
    await joinRoom(client3, ROOM_ID);
  });

  afterEach(async () => {
    await cleanupTest(server, [client1, client2, client3]);
  });

  describe("Chat Message Sending", () => {
    it("should send and receive chat messages successfully", (done: jest.DoneCallback) => {
      const testMessage = "Hello, this is a test message!";
      let receivedCount = 0;

      // Both client2 and client3 should receive the message
      const messageHandler = (message: ChatMessage) => {
        expect(message.content).toBe(testMessage);
        expect(message.email).toBe(USER1.email);
        expect(message.uid).toBe(USER1.id);
        expect(typeof message.timestamp).toBe("number");
        expect(message.timestamp).toBeGreaterThan(Date.now() - 1000);

        receivedCount++;
        if (receivedCount === 2) {
          // Both client2 and client3 received
          done();
        }
      };

      client2.socket.on("message", messageHandler);
      client3.socket.on("message", messageHandler);

      // Client1 sends message
      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: testMessage,
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(true);
          expect(response.error).toBeUndefined();
        }
      );
    });

    it("should handle acknowledgment callbacks correctly", (done: jest.DoneCallback) => {
      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: "Test with callback",
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(true);
          expect(response.error).toBeUndefined();
          done();
        }
      );
    });

    it("should broadcast to all users in the room including sender", (done: jest.DoneCallback) => {
      const testMessage = "Broadcast test message";
      let receivedCount = 0;
      const expectedReceivers = 3; // All 3 clients should receive

      const messageHandler = (message: ChatMessage) => {
        expect(message.content).toBe(testMessage);
        receivedCount++;
        if (receivedCount === expectedReceivers) {
          done();
        }
      };

      client1.socket.on("message", messageHandler);
      client2.socket.on("message", messageHandler);
      client3.socket.on("message", messageHandler);

      client1.socket.emit("chat:send", {
        roomId: ROOM_ID,
        message: testMessage,
        uid: USER1.id,
        email: USER1.email,
      });
    });
  });

  describe("Chat Message Validation", () => {
    it("should reject messages without roomId", (done: jest.DoneCallback) => {
      client1.socket.emit(
        "chat:send",
        {
          message: "Test message",
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(false);
          expect(response.error).toBe("roomId and message are required");
          done();
        }
      );
    });

    it("should reject messages without content", (done: jest.DoneCallback) => {
      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(false);
          expect(response.error).toBe("roomId and message are required");
          done();
        }
      );
    });

    it("should reject empty messages", (done: jest.DoneCallback) => {
      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: "   ", // Only whitespace
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(false);
          expect(response.error).toBe("roomId and message are required");
          done();
        }
      );
    });

    it("should reject messages that are too long", (done: jest.DoneCallback) => {
      const longMessage = "a".repeat(5001); // Exceeds default limit of 5000

      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: longMessage,
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(false);
          expect(response.error).toBe("Message is too long");
          done();
        }
      );
    });

    it("should accept messages at the character limit", (done: jest.DoneCallback) => {
      const limitMessage = "a".repeat(5000); // Exactly at limit

      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: limitMessage,
          uid: USER1.id,
          email: USER1.email,
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(true);
          expect(response.error).toBeUndefined();
          done();
        }
      );
    });

    it("should reject messages from users not in the room", async () => {
      // Create a new client that doesn't join the room
      const outsideClient = await createAuthenticatedClient(server, {
        id: "outside-user",
        email: "outside@test.com",
      });

      return new Promise<void>((resolve) => {
        outsideClient.socket.emit(
          "chat:send",
          {
            roomId: ROOM_ID,
            message: "Message from outside",
            uid: "outside-user",
            email: "outside@test.com",
          },
          (response: { ok: boolean; error?: string }) => {
            expect(response.ok).toBe(false);
            expect(response.error).toBe(
              "Join the room before sending messages"
            );
            outsideClient.socket.disconnect();
            resolve();
          }
        );
      });
    });
  });

  describe("Chat Error Handling", () => {
    it("should emit chat:error for validation failures", (done: jest.DoneCallback) => {
      client1.socket.on("chat:error", (error: { message: string }) => {
        expect(error.message).toBe("roomId and message are required");
        done();
      });

      client1.socket.emit("chat:send", {
        roomId: ROOM_ID,
        // Missing message
        uid: USER1.id,
        email: USER1.email,
      });
    });

    it("should emit chat:error for message length violations", (done: jest.DoneCallback) => {
      client1.socket.on("chat:error", (error: { message: string }) => {
        expect(error.message).toBe("Message is too long");
        done();
      });

      client1.socket.emit("chat:send", {
        roomId: ROOM_ID,
        message: "a".repeat(5001),
        uid: USER1.id,
        email: USER1.email,
      });
    });

    it("should emit chat:error for room access violations", async () => {
      const outsideClient = await createAuthenticatedClient(server, {
        id: "outside-user",
        email: "outside@test.com",
      });

      return new Promise<void>((resolve) => {
        outsideClient.socket.on("chat:error", (error: { message: string }) => {
          expect(error.message).toBe("Join the room before sending messages");
          outsideClient.socket.disconnect();
          resolve();
        });

        outsideClient.socket.emit("chat:send", {
          roomId: ROOM_ID,
          message: "Unauthorized message",
          uid: "outside-user",
          email: "outside@test.com",
        });
      });
    });
  });

  describe("Chat History Management", () => {
    it("should maintain chat history per room", (done: jest.DoneCallback) => {
      const messages = ["First message", "Second message", "Third message"];
      let sentCount = 0;

      const sendNextMessage = () => {
        if (sentCount < messages.length) {
          client1.socket.emit(
            "chat:send",
            {
              roomId: ROOM_ID,
              message: messages[sentCount],
              uid: USER1.id,
              email: USER1.email,
            },
            () => {
              sentCount++;
              if (sentCount < messages.length) {
                setTimeout(sendNextMessage, 50);
              } else {
                // Request chat history
                client2.socket.emit("request-chat-history", {
                  roomId: ROOM_ID,
                });
              }
            }
          );
        }
      };

      client2.socket.on(
        "chat-history",
        (data: { roomId: string; messages: ChatMessage[] }) => {
          expect(data.roomId).toBe(ROOM_ID);
          expect(data.messages).toHaveLength(3);
          expect(data.messages[0].content).toBe("First message");
          expect(data.messages[1].content).toBe("Second message");
          expect(data.messages[2].content).toBe("Third message");

          // All messages should be from the same user
          data.messages.forEach((msg) => {
            expect(msg.email).toBe(USER1.email);
            expect(msg.uid).toBe(USER1.id);
          });

          done();
        }
      );

      sendNextMessage();
    });

    it("should return empty history for rooms with no messages", (done: jest.DoneCallback) => {
      const emptyRoomId = "empty-room";

      // Join empty room
      client1.socket.emit("join-room", { roomId: emptyRoomId });

      client1.socket.on(
        "chat-history",
        (data: { roomId: string; messages: ChatMessage[] }) => {
          expect(data.roomId).toBe(emptyRoomId);
          expect(data.messages).toHaveLength(0);
          done();
        }
      );

      // Request history immediately
      setTimeout(() => {
        client1.socket.emit("request-chat-history", { roomId: emptyRoomId });
      }, 100);
    });
  });

  describe("Multi-Room Chat Isolation", () => {
    it("should isolate chat messages between different rooms", async () => {
      const room2Id = "test-room-2";

      // Create a new client for room 2
      const client4 = await createAuthenticatedClient(server, {
        id: "user4",
        email: "user4@test.com",
      });
      await joinRoom(client4, room2Id);

      const room1Message = "Message for room 1";
      const room2Message = "Message for room 2";

      let room1Received = false;
      let room2Received = false;

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client4.socket.disconnect();
          reject(new Error("Test timeout - messages not properly isolated"));
        }, 2000);

        // Client2 should only receive room1 message
        client2.socket.on("message", (message: ChatMessage) => {
          if (message.content === room2Message) {
            clearTimeout(timeout);
            client4.socket.disconnect();
            reject(new Error("Room 1 client received message from room 2"));
            return;
          }
          if (message.content === room1Message) {
            room1Received = true;
            checkCompletion();
          }
        });

        // Client4 should only receive room2 message
        client4.socket.on("message", (message: ChatMessage) => {
          if (message.content === room1Message) {
            clearTimeout(timeout);
            client4.socket.disconnect();
            reject(new Error("Room 2 client received message from room 1"));
            return;
          }
          if (message.content === room2Message) {
            room2Received = true;
            checkCompletion();
          }
        });

        const checkCompletion = () => {
          if (room1Received && room2Received) {
            clearTimeout(timeout);
            client4.socket.disconnect();
            resolve();
          }
        };

        // Send messages to different rooms
        client1.socket.emit("chat:send", {
          roomId: ROOM_ID,
          message: room1Message,
          uid: USER1.id,
          email: USER1.email,
        });

        client4.socket.emit("chat:send", {
          roomId: room2Id,
          message: room2Message,
          uid: "user4",
          email: "user4@test.com",
        });
      });
    });
  });

  describe("User Authentication and Authorization", () => {
    it("should use socket authentication data for message metadata", (done: jest.DoneCallback) => {
      client1.socket.emit(
        "chat:send",
        {
          roomId: ROOM_ID,
          message: "Test authentication",
          // Omit uid and email to test fallback to socket data
        },
        (response: { ok: boolean; error?: string }) => {
          expect(response.ok).toBe(true);
        }
      );

      client2.socket.on("message", (message: ChatMessage) => {
        if (message.content === "Test authentication") {
          expect(message.uid).toBe(USER1.id);
          expect(message.email).toBe(USER1.email);
          done();
        }
      });
    });

    it("should prefer provided uid and email over socket authentication", (done: jest.DoneCallback) => {
      const customUid = "custom-uid";
      const customEmail = "custom@email.com";

      client1.socket.emit("chat:send", {
        roomId: ROOM_ID,
        message: "Test custom metadata",
        uid: customUid,
        email: customEmail,
      });

      client2.socket.on("message", (message: ChatMessage) => {
        if (message.content === "Test custom metadata") {
          expect(message.uid).toBe(customUid);
          expect(message.email).toBe(customEmail);
          done();
        }
      });
    });
  });
});