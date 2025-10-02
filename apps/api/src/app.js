"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const swagger_config_1 = require("./config/swagger.config");
const gateway_routes_1 = __importDefault(require("./routes/gateway.routes"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const app = (0, express_1.default)();
const PORT = process.env.API_PORT || 4000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express_1.default.json());
// Security headers
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
    next();
});
// Setup Swagger documentation
(0, swagger_config_1.setupSwagger)(app);
// Root route
app.get("/", (req, res) => {
    res.json({
        message: "🚀 Realtime Code Editor API Gateway",
        version: "1.0.0",
        docs: "/api-docs",
        health: "/health",
    });
});
// Health routes
app.use("/", health_routes_1.default);
// API routes (protected)
app.use("/api", gateway_routes_1.default);
// 404 handler
app.use("*", (req, res) => {
    res.status(404).json({
        error: "Not Found",
        message: `Route ${req.originalUrl} not found`,
        availableRoutes: [
            "GET /",
            "GET /health",
            "GET /health/services",
            "GET /api-docs",
            "POST /api/rooms",
            "GET /api/rooms",
            "PUT /api/rooms/:id",
            "DELETE /api/rooms/:id",
        ],
    });
});
// Error handler
app.use((error, req, res, next) => {
    console.error("❌ Unhandled error:", error);
    res.status(500).json({
        error: "Internal Server Error",
        message: "Something went wrong on the server",
    });
});
app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    console.log(`🔌 Chat WebSocket: Connect directly to ws://localhost:5002`);
});
