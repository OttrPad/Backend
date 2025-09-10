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
 *     summary: Get user's accessible rooms
 *     description: Retrieve a list of rooms that the authenticated user has access to. This includes rooms where the user is a member or creator. Users who have email invitations but haven't joined yet will not see those rooms until they join.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of rooms to return
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of rooms to skip for pagination
 *     responses:
 *       200:
 *         description: List of user's accessible rooms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User rooms retrieved successfully"
 *                 rooms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       room_id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       room_code:
 *                         type: string
 *                       created_by:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       user_access:
 *                         type: object
 *                         properties:
 *                           is_member:
 *                             type: boolean
 *                             description: Whether user is a room member
 *                           is_creator:
 *                             type: boolean
 *                             description: Whether user created the room
 *                           user_type:
 *                             type: string
 *                             enum: [admin, editor, viewer, null]
 *                             description: User's role in the room (null if not a member)
 *                 total:
 *                   type: integer
 *                   description: Total number of accessible rooms
 *                 hasMore:
 *                   type: boolean
 *                   description: Whether there are more rooms to load
 *       400:
 *         description: Bad request - User authentication required
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 */
router.get("/rooms", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", "/rooms", req, res);
});

/**
 * @swagger
 * /api/rooms/join:
 *   post:
 *     summary: Join a room by code
 *     description: |
 *       Join a room using a shareable 9-digit room code. Access control flow:
 *       - Room creators can always join as admin
 *       - Users with email-based access (in allowed_emails) will be transitioned to room members
 *       - On first join, user is moved from allowed_emails to room_users table
 *       - Subsequent joins will be validated against room_users membership
 *       - Users get the access level specified in their email invitation (viewer/editor)
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
 *                 transition_info:
 *                   type: object
 *                   description: Information about how the user joined (creator vs email invitation)
 *                   properties:
 *                     user_type:
 *                       type: string
 *                       enum: [admin, editor, viewer]
 *                       description: User's role in the room
 *                     transition_type:
 *                       type: string
 *                       enum: [creator_join, email_to_member]
 *                       description: How the user was added to the room
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
 *         description: Access denied - Various access control failures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Access denied"
 *                     - "Access denied: Email not authorized for this room"
 *                     - "Access denied: Email authorized for different user"
 *                 message:
 *                   type: string
 *                   enum:
 *                     - "Your email is not authorized to access this room"
 *                     - "Email access exists but for a different user account"
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
 *     description: |
 *       Join a room using room ID. Access control flow:
 *       - Room creators can always join as admin
 *       - Users with email-based access (in allowed_emails) will be transitioned to room members
 *       - On first join, user is moved from allowed_emails to room_users table
 *       - Subsequent joins will be validated against room_users membership
 *       - Users get the access level specified in their email invitation (viewer/editor)
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
 *                 transition_info:
 *                   type: object
 *                   description: Information about how the user joined (creator vs email invitation)
 *                   properties:
 *                     user_type:
 *                       type: string
 *                       enum: [admin, editor, viewer]
 *                       description: User's role in the room
 *                     transition_type:
 *                       type: string
 *                       enum: [creator_join, email_to_member]
 *                       description: How the user was added to the room
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
 *     description: Add an email to the room's allowed access list with specified permission level. Only room admin (creator or assigned admin) can manage access.
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
 *               - user_id
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
 *               user_id:
 *                 type: string
 *                 description: User ID that must be a member of the room to grant access
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
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
 *                     - "Room ID, email, access level, and user ID are required"
 *                     - "Access level must be 'viewer' or 'editor'"
 *                     - "Invalid email format"
 *                     - "Cannot add your own email to the access list"
 *                     - "User must be a member of the room to be granted access"
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
 *     description: Remove an email from the room's allowed access list. Only room admin (creator or assigned admin) can manage access.
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
 *     description: Update the access level for an email in the room's access list. Only room admin (creator or assigned admin) can manage access.
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
 *               - user_id
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
 *               user_id:
 *                 type: string
 *                 description: User ID that must be a member of the room to update access
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
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
 *     description: Get all emails that have access to the room with their permission levels. Only room admin (creator or assigned admin) can view the access list.
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
// Proxied to Collaboration Service
// =============================================================================

/**
 * @swagger
 * /api/collaboration/health:
 *   get:
 *     summary: Collaboration service health
 *     description: Get health status and features of the collaboration service
 *     tags: [Collaboration]
 *     responses:
 *       200:
 *         description: Collaboration service health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 service:
 *                   type: string
 *                   example: "collaboration"
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["real-time chat", "code collaboration", "cursor tracking"]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Collaboration service unavailable
 */
router.get("/collaboration/health", async (req, res) => {
  await serviceProxy.proxyRequest(
    "collaboration",
    "/api/collaboration/health",
    req,
    res
  );
});

/**
 * @swagger
 * /api/collaboration/rooms/{roomId}/info:
 *   get:
 *     summary: Get collaboration room info
 *     description: Get collaboration-specific information for a room
 *     tags: [Collaboration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: roomId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room collaboration information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roomId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 features:
 *                   type: object
 *                   properties:
 *                     chat:
 *                       type: boolean
 *                     codeSync:
 *                       type: boolean
 *                     cursorTracking:
 *                       type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Collaboration service unavailable
 */
router.get(
  "/collaboration/rooms/:roomId/info",
  verifySupabaseJWT,
  async (req, res) => {
    await serviceProxy.proxyRequest(
      "collaboration",
      `/api/collaboration/rooms/${req.params.roomId}/info`,
      req,
      res
    );
  }
);

/**
 * @swagger
 * /api/collaboration/rooms/{roomId}/stats:
 *   get:
 *     summary: Get room collaboration statistics
 *     description: Get real-time statistics for a collaboration room
 *     tags: [Collaboration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: roomId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roomId:
 *                   type: string
 *                 activeUsers:
 *                   type: integer
 *                 messagesCount:
 *                   type: integer
 *                 codeChanges:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Collaboration service unavailable
 */
router.get(
  "/collaboration/rooms/:roomId/stats",
  verifySupabaseJWT,
  async (req, res) => {
    await serviceProxy.proxyRequest(
      "collaboration",
      `/api/collaboration/rooms/${req.params.roomId}/stats`,
      req,
      res
    );
  }
);

/**
 * @swagger
 * /api/collaboration/rooms/{roomId}/broadcast:
 *   post:
 *     summary: Broadcast event to collaboration room
 *     description: Send custom events to all users in a collaboration room
 *     tags: [Collaboration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: roomId
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
 *               - data
 *             properties:
 *               event:
 *                 type: string
 *                 description: Event name to broadcast
 *                 example: "custom-notification"
 *               data:
 *                 type: object
 *                 description: Event data
 *                 example:
 *                   message: "Session will end soon"
 *     responses:
 *       200:
 *         description: Event broadcasted successfully
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
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Collaboration service unavailable
 */
router.post(
  "/collaboration/rooms/:roomId/broadcast",
  verifySupabaseJWT,
  async (req, res) => {
    await serviceProxy.proxyRequest(
      "collaboration",
      `/api/collaboration/rooms/${req.params.roomId}/broadcast`,
      req,
      res
    );
  }
);

// =============================================================================
// ROOM MANAGEMENT ROUTES
// Proxied to Core Service
// =============================================================================

/**
 * @swagger
 * /api/rooms/{id}/participants:
 *   get:
 *     summary: Get all participants and invited users in a room
 *     description: |
 *       Retrieve list of all users associated with the room including:
 *       - Current members (users who have joined the room)
 *       - Invited users (users with email invitations who haven't joined yet)
 *
 *       Access control:
 *       - Any room member can view participants (members, editors, viewers, admins)
 *       - Room creator can always view participants
 *       - Invited users show status as "invited"
 *       - Room members show status as "member"
 *     tags: [Room Management]
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
 *       403:
 *         description: Access denied - Only room members can view participants
 *       404:
 *         description: Room not found
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

// =============================================================================
// USER PROFILE ROUTES
// =============================================================================

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieve profile information for the authenticated user including ID, email, and display name
 *     tags: [User Profile]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User profile retrieved successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: User ID
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     email:
 *                       type: string
 *                       description: User email address
 *                       example: "user@example.com"
 *                     name:
 *                       type: string
 *                       nullable: true
 *                       description: User display name
 *                       example: "John Doe"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/users/profile", verifySupabaseJWT, async (req, res) => {
  await serviceProxy.proxyRequest("core", "/users/profile", req, res);
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
