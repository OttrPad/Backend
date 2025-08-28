import { Router, Request, Response } from "express";
import { serviceProxy } from "../services/proxy.service";
import { verifySupabaseJWT } from "../middleware/auth.middleware";

const router: Router = Router();

// =============================================================================
// ROOM MANAGEMENT ROUTES
// All room routes are protected and require authentication
// =============================================================================

/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Create a new room
 *     description: Create a new room with a unique shareable code. The authenticated user becomes the room creator and is automatically added as an admin.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the room (must be unique)
 *                 example: "My Coding Session"
 *               description:
 *                 type: string
 *                 description: Optional room description
 *                 example: "A collaborative coding session for our project"
 *     responses:
 *       201:
 *         description: Room created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Room created successfully"
 *                 room:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Room ID
 *                     name:
 *                       type: string
 *                       description: Room name
 *                     description:
 *                       type: string
 *                       description: Room description
 *                     room_code:
 *                       type: string
 *                       pattern: '^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$'
 *                       description: Shareable 9-digit room code
 *                       example: "abc-123-def"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     created_by:
 *                       type: string
 *                       format: uuid
 *                 creator:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Bad request - various validation errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Room name is required"
 *                     - "User authentication required"
 *                     - "You already created a room with this name"
 *                     - "Room with this name already exists"
 *             examples:
 *               missing_name:
 *                 summary: Missing room name
 *                 value:
 *                   error: "Room name is required"
 *               duplicate_by_same_user:
 *                 summary: Same user trying to create duplicate room
 *                 value:
 *                   error: "You already created a room with this name"
 *               auth_required:
 *                 summary: Missing authentication
 *                 value:
 *                   error: "User authentication required"
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 */
router.post("/rooms", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", "/rooms", req, res);
});

/**
 * @swagger
 * /api/rooms:
 *   get:
 *     summary: Get all rooms
 *     description: Retrieve a list of all available rooms
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of rooms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rooms:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/rooms", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", "/rooms", req, res);
});

/**
 * @swagger
 * /api/rooms/join:
 *   post:
 *     summary: Join a room by code
 *     description: Join a room using a shareable 9-digit room code. Access is controlled - user's email must be in the room's allowed list or they must be the room creator. Users are assigned the access level specified in the allowed emails list.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - room_code
 *             properties:
 *               room_code:
 *                 type: string
 *                 pattern: '^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$'
 *                 description: 9-digit room code in format xxx-xxx-xxx
 *                 example: "abc-123-def"
 *     responses:
 *       200:
 *         description: Successfully joined room with assigned access level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully joined room"
 *                 room:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     room_code:
 *                       type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Room code is required"
 *                     - "User authentication required"
 *             examples:
 *               missing_code:
 *                 summary: Missing room code
 *                 value:
 *                   error: "Room code is required"
 *               auth_required:
 *                 summary: Missing authentication
 *                 value:
 *                   error: "User authentication required"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied - Email not authorized for this room
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Access denied"
 *                 message:
 *                   type: string
 *                   example: "Your email is not authorized to access this room"
 *       404:
 *         description: Room not found with this code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Room not found with this code"
 *       409:
 *         description: Already a member of this room
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Already in room"
 *                 message:
 *                   type: string
 *                   example: "You are already a member of this room"
 */
router.post("/rooms/join", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", "/rooms/join", req, res);
});

/**
 * @swagger
 * /api/rooms/{id}:
 *   get:
 *     summary: Get room details
 *     description: Get detailed information about a specific room
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 */
router.get("/rooms/:id", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", `/rooms/${req.params.id}`, req, res);
});

/**
 * @swagger
 * /api/rooms/{id}/join:
 *   post:
 *     summary: Join a room by ID
 *     description: Join a room using room ID. Access is controlled - user's email must be in the room's allowed list or they must be the room creator. Users are assigned the access level specified in the allowed emails list.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID to join
 *     responses:
 *       200:
 *         description: Successfully joined room as editor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully joined room"
 *                 room:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     room_code:
 *                       type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "roomId and valid user authentication are required"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Room not found"
 *       409:
 *         description: Already a member of this room
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Already in room"
 *                 message:
 *                   type: string
 *                   example: "You are already a member of this room"
 */
router.post("/rooms/:id/join", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/join`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/leave:
 *   delete:
 *     summary: Leave a room
 *     description: Leave a room as the authenticated user
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID to leave
 *     responses:
 *       200:
 *         description: Successfully left room
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 room:
 *                   type: object
 *                 user:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 */
router.delete("/rooms/:id/leave", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/leave`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}:
 *   delete:
 *     summary: Delete a room
 *     description: Delete a room (only room creator/admin can delete)
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID to delete
 *     responses:
 *       200:
 *         description: Room deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Room deleted successfully"
 *                 room:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 deletedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only room creator can delete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *                 message:
 *                   type: string
 *                   example: "Only the room creator can delete this room"
 *       404:
 *         description: Room not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Room not found"
 */
router.delete("/rooms/:id", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", `/rooms/${req.params.id}`, req, res);
});

// =============================================================================
// ROOM ACCESS MANAGEMENT ROUTES
// Routes for managing email-based access control to rooms
// =============================================================================

/**
 * @swagger
 * /api/rooms/{id}/access/add:
 *   post:
 *     summary: Add email to room access list
 *     description: Add an email to the room's allowed access list with specified permission level. Only room creator can manage access.
 *     tags: [Room Access]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - access_level
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to grant access
 *                 example: "user@example.com"
 *               access_level:
 *                 type: string
 *                 enum: [viewer, editor]
 *                 description: Access level for the email
 *                 example: "editor"
 *     responses:
 *       201:
 *         description: Email added to room access list successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email added to room access list successfully"
 *                 allowed_email:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     access_level:
 *                       type: string
 *                     invited_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Room ID, email, and access level are required"
 *                     - "Access level must be 'viewer' or 'editor'"
 *                     - "Invalid email format"
 *                     - "Cannot add your own email to the access list"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only room creator can manage access
 *       404:
 *         description: Room not found
 *       409:
 *         description: Email already invited to this room
 */
router.post("/rooms/:id/access/add", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/access/add`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/access/remove:
 *   delete:
 *     summary: Remove email from room access list
 *     description: Remove an email from the room's allowed access list. Only room creator can manage access.
 *     tags: [Room Access]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to remove access
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Email removed from room access list successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email removed from room access list successfully"
 *       400:
 *         description: Bad request - Room ID and email are required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only room creator can manage access
 *       404:
 *         description: Room not found
 */
router.delete(
  "/rooms/:id/access/remove",
  verifySupabaseJWT,
  async (req, res) => {
    await serviceProxy.proxyRequest(
      "core",
      `/rooms/${req.params.id}/access/remove`,
      req,
      res
    );
  }
);

/**
 * @swagger
 * /api/rooms/{id}/access/update:
 *   put:
 *     summary: Update email access level
 *     description: Update the access level for an email in the room's access list. Only room creator can manage access.
 *     tags: [Room Access]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - access_level
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to update
 *                 example: "user@example.com"
 *               access_level:
 *                 type: string
 *                 enum: [viewer, editor]
 *                 description: New access level for the email
 *                 example: "viewer"
 *     responses:
 *       200:
 *         description: Email access level updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email access level updated successfully"
 *                 allowed_email:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     access_level:
 *                       type: string
 *                     invited_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only room creator can manage access
 *       404:
 *         description: Email not found in room access list or room not found
 */
router.put("/rooms/:id/access/update", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/access/update`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/access:
 *   get:
 *     summary: Get room access list
 *     description: Get all emails that have access to the room with their permission levels. Only room creator can view the access list.
 *     tags: [Room Access]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room access list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Room access list retrieved successfully"
 *                 room:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 allowed_emails:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       email:
 *                         type: string
 *                       access_level:
 *                         type: string
 *                         enum: [viewer, editor]
 *                       invited_by:
 *                         type: string
 *                       invited_at:
 *                         type: string
 *                         format: date-time
 *                 total_count:
 *                   type: integer
 *                   description: Total number of allowed emails
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only room creator can view the access list
 *       404:
 *         description: Room not found
 */
router.get("/rooms/:id/access", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/access`,
    req,
    res
  );
});

// =============================================================================
// REALTIME COLLABORATION ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/rooms/{id}/participants:
 *   get:
 *     summary: Get current participants in a room
 *     description: Retrieve list of users currently connected to the room via WebSocket
 *     tags: [Realtime]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room participants retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Room participants retrieved successfully"
 *                 roomId:
 *                   type: string
 *                 participants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       userEmail:
 *                         type: string
 *                       socketId:
 *                         type: string
 *                       joinedAt:
 *                         type: number
 *                 totalCount:
 *                   type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/rooms/:id/participants", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/participants`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/kick:
 *   post:
 *     summary: Kick a user from a room
 *     description: Remove a user from the room and disconnect their WebSocket connection
 *     tags: [Realtime]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user to kick
 *                 example: "user123"
 *     responses:
 *       200:
 *         description: User kicked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 roomId:
 *                   type: string
 *                 kickedUserId:
 *                   type: string
 *                 kickedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/rooms/:id/kick", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/kick`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/broadcast:
 *   post:
 *     summary: Broadcast an event to all room participants
 *     description: Send a custom event with data to all users in the room
 *     tags: [Realtime]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *             properties:
 *               event:
 *                 type: string
 *                 description: Event name to broadcast
 *                 example: "custom-notification"
 *               data:
 *                 type: object
 *                 description: Event data to send
 *                 example:
 *                   message: "Hello everyone!"
 *     responses:
 *       200:
 *         description: Event broadcast successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 roomId:
 *                   type: string
 *                 event:
 *                   type: string
 *                 broadcastBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/rooms/:id/broadcast", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/broadcast`,
    req,
    res
  );
});

/**
 * @swagger
 * /api/rooms/{id}/save:
 *   post:
 *     summary: Save room content
 *     description: Save the current code content for the room and broadcast the save event
 *     tags: [Realtime]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Code content to save
 *                 example: "console.log('Hello World!');"
 *               language:
 *                 type: string
 *                 description: Programming language
 *                 example: "javascript"
 *     responses:
 *       200:
 *         description: Content saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 roomId:
 *                   type: string
 *                 savedBy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                 timestamp:
 *                   type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/rooms/:id/save", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest(
    "core",
    `/rooms/${req.params.id}/save`,
    req,
    res
  );
});

// =============================================================================
// FUTURE MICROSERVICES
// Add routes for other services here (AI Engine, etc.)
// =============================================================================

/**
 * @swagger
 * /api/ai:
 *   post:
 *     summary: AI Engine (Coming Soon)
 *     description: AI-powered code assistance and suggestions
 *     tags: [AI Engine]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       501:
 *         description: Not implemented yet
 */
router.all("/ai*", verifySupabaseJWT, async (req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "AI Engine service is coming soon",
    plannedFeatures: ["Code suggestions", "Error detection", "Code completion"],
  });
});

export default router;
