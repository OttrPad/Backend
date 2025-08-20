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
 *     description: Create a new room. The authenticated user becomes the room creator.
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
 *                 room:
 *                   type: object
 *                 creator:
 *                   type: object
 *       400:
 *         description: Bad request (missing name or room already exists)
 *       401:
 *         description: Unauthorized
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
 *     summary: Join a room
 *     description: Join a room as the authenticated user
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
 *         description: Successfully joined room
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
 *     description: Delete a room (typically only room creator or admin)
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
 *                 room:
 *                   type: object
 *                 deletedBy:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (insufficient permissions)
 *       404:
 *         description: Room not found
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
