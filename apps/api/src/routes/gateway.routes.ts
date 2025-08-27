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
 *     description: Join a room using a shareable 9-digit room code (format xxx-xxx-xxx). Users who join are assigned 'editor' role by default.
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
 *     description: Join a room using room ID as the authenticated user. Users who join are assigned 'editor' role by default.
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
