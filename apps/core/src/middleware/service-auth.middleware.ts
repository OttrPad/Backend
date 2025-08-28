import { Request, Response, NextFunction } from "express";

/**
 * Middleware to ensure requests come from the API Gateway
 * Blocks direct external calls to the Core service
 */
export const requireGatewayAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Allow health checks without gateway
  if (req.path === "/status") {
    return next();
  }

  // Check for gateway headers
  const gatewayUserId = req.headers["x-gateway-user-id"];
  const gatewayUserEmail = req.headers["x-gateway-user-email"];
  const originalUrl = req.headers["x-original-url"];

  // If no gateway headers, this is a direct call
  if (!gatewayUserId || !gatewayUserEmail || !originalUrl) {
    console.warn(`🚨 Direct access attempt blocked: ${req.method} ${req.path}`);

    return res.status(403).json({
      error: "Forbidden",
      message: "Direct access to Core service is not allowed",
      hint: "Please use the API Gateway at http://localhost:4000/api/*",
      gateway: {
        endpoint: "http://localhost:4000/api/rooms",
        documentation: "http://localhost:4000/api-docs",
      },
    });
  }

  // Add user context for easy access in controllers
  (req as any).gatewayUser = {
    id: gatewayUserId,
    email: gatewayUserEmail,
    originalUrl: originalUrl,
  };

  console.log(
    `✅ Gateway-authenticated request: ${gatewayUserEmail} -> ${req.method} ${req.path}`
  );

  next();
};

/**
 * Optional: More strict middleware with shared secret
 */
export const requireSharedSecret = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Allow health checks
  if (req.path === "/status") {
    return next();
  }

  const sharedSecret = req.headers["x-gateway-secret"];
  const expectedSecret = process.env.GATEWAY_SHARED_SECRET;

  if (!expectedSecret) {
    console.error("❌ GATEWAY_SHARED_SECRET not configured");
    return res.status(500).json({
      error: "Service misconfiguration",
      message: "Internal authentication not properly configured",
    });
  }

  if (sharedSecret !== expectedSecret) {
    console.warn(`🚨 Invalid shared secret from: ${req.ip}`);

    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid service authentication",
    });
  }

  next();
};
