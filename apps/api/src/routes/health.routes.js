"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const proxy_service_1 = require("../services/proxy.service");
const router = (0, express_1.Router)();
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API Gateway health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API Gateway is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 */
router.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        service: "API Gateway",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
        node_version: process.version,
    });
});
/**
 * @swagger
 * /health/services:
 *   get:
 *     summary: Check health of all microservices
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Health status of all services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gateway:
 *                   type: object
 *                 services:
 *                   type: object
 *       503:
 *         description: Some services are unhealthy
 */
router.get("/health/services", async (req, res) => {
    try {
        const serviceHealth = await proxy_service_1.serviceProxy.checkHealth();
        // Check if any service is unhealthy
        const hasUnhealthyServices = Object.values(serviceHealth).some((service) => service.status !== "healthy");
        const response = {
            gateway: {
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            },
            services: serviceHealth,
            overall_status: hasUnhealthyServices ? "degraded" : "healthy",
        };
        res.status(hasUnhealthyServices ? 503 : 200).json(response);
    }
    catch (error) {
        res.status(500).json({
            gateway: {
                status: "healthy",
                timestamp: new Date().toISOString(),
            },
            services: {},
            overall_status: "error",
            error: "Failed to check service health",
        });
    }
});
exports.default = router;
