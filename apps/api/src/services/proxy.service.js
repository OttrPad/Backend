"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceProxy = exports.ServiceProxy = void 0;
const axios_1 = __importDefault(require("axios"));
// Available microservices
const services = {
    core: {
        name: "Core Service",
        baseUrl: process.env.CORE_SERVICE_URL || "http://localhost:3001",
        timeout: 30000, // 30 seconds
    },
    collaboration: {
        name: "Collaboration Service",
        baseUrl: process.env.COLLABORATION_SERVICE_URL || "http://localhost:5002",
        timeout: 15000, // 15 seconds for real-time features
    },
    execution: {
        name: "Execution Service",
        baseUrl: process.env.EXECUTION_SERVICE_URL || "http://localhost:4004",
        timeout: 20000,
    },
    // Add more services here as they're created
    // auth: {
    //   name: 'Auth Service',
    //   baseUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:4002',
    //   timeout: 10000
    // }
};
class ServiceProxy {
    constructor() { }
    static getInstance() {
        if (!ServiceProxy.instance) {
            ServiceProxy.instance = new ServiceProxy();
        }
        return ServiceProxy.instance;
    }
    /**
     * Proxy a request to a specific microservice
     */
    async proxyRequest(serviceName, path, req, res) {
        var _a, _b, _c, _d;
        try {
            const service = services[serviceName];
            if (!service) {
                res.status(404).json({
                    error: "Service not found",
                    message: `Service '${serviceName}' is not configured`,
                });
                return;
            }
            // Build the target URL
            const targetUrl = `${service.baseUrl}${path}`;
            // Prepare headers (forward most headers but add some custom ones)
            const headers = Object.assign(Object.assign({}, req.headers), { "x-forwarded-for": req.ip, "x-forwarded-host": req.get("host"), "x-gateway-user-id": (_a = req.user) === null || _a === void 0 ? void 0 : _a.id, "x-gateway-user-email": (_b = req.user) === null || _b === void 0 ? void 0 : _b.email, "x-original-url": req.originalUrl });
            // Remove host header to avoid conflicts
            delete headers.host;
            console.log(`🔄 Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`);
            // Make the request to the microservice
            const response = await (0, axios_1.default)({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers,
                params: req.query,
                timeout: service.timeout,
                validateStatus: () => true, // Don't throw on any status code
            });
            // Forward the response
            res.status(response.status);
            // Forward response headers (except some that might cause issues)
            const excludeHeaders = ["transfer-encoding", "connection", "keep-alive"];
            Object.entries(response.headers).forEach(([key, value]) => {
                if (!excludeHeaders.includes(key.toLowerCase())) {
                    res.set(key, value);
                }
            });
            res.json(response.data);
        }
        catch (error) {
            console.error(`❌ Error proxying to ${serviceName}:`, error.message);
            if (error.code === "ECONNREFUSED") {
                res.status(503).json({
                    error: "Service unavailable",
                    message: `${((_c = services[serviceName]) === null || _c === void 0 ? void 0 : _c.name) || serviceName} is not responding`,
                    service: serviceName,
                });
            }
            else if (error.code === "ECONNABORTED") {
                res.status(504).json({
                    error: "Gateway timeout",
                    message: `Request to ${((_d = services[serviceName]) === null || _d === void 0 ? void 0 : _d.name) || serviceName} timed out`,
                    service: serviceName,
                });
            }
            else {
                res.status(502).json({
                    error: "Bad gateway",
                    message: "An error occurred while communicating with the service",
                    service: serviceName,
                });
            }
        }
    }
    /**
     * Check health of all services
     */
    async checkHealth() {
        const healthChecks = await Promise.allSettled(Object.entries(services).map(async ([name, config]) => {
            try {
                const response = await axios_1.default.get(`${config.baseUrl}/status`, {
                    timeout: 5000,
                });
                return {
                    name,
                    status: "healthy",
                    response: response.data,
                    responseTime: response.headers["x-response-time"] || "unknown",
                };
            }
            catch (error) {
                return {
                    name,
                    status: "unhealthy",
                    error: error.message,
                    lastChecked: new Date().toISOString(),
                };
            }
        }));
        const result = {};
        healthChecks.forEach((check, index) => {
            const serviceName = Object.keys(services)[index];
            result[serviceName] =
                check.status === "fulfilled"
                    ? check.value
                    : {
                        name: serviceName,
                        status: "error",
                        error: "Health check failed",
                    };
        });
        return result;
    }
    /**
     * Get service configuration
     */
    getServices() {
        return services;
    }
}
exports.ServiceProxy = ServiceProxy;
exports.serviceProxy = ServiceProxy.getInstance();
