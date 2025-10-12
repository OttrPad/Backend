import { Request, Response, NextFunction } from "express";
import { log } from "@ottrpad/logger";

/**
 * Middleware to ensure requests come from the API Gateway
 * Blocks direct external calls to the Version Control service
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

  // Allow internal calls with shared secret
  const internalSecret = req.headers["x-internal-secret"] as string | undefined;
  const expected = process.env.VERSION_CONTROL_INTERNAL_SECRET;
  if (expected && internalSecret === expected) {
    (req as any).gatewayUser = {
      id: "system-internal",
      email: "system@internal",
      originalUrl: req.originalUrl,
    };
    log.debug("vcs.gateway.internal", { path: req.path });
    return next();
  }

  // Check for the necessary gateway headers
  const gatewayUserId = req.headers["x-gateway-user-id"];
  const gatewayUserEmail = req.headers["x-gateway-user-email"];
  const originalUrl = req.headers["x-original-url"];

  // If no gateway headers, this is a direct call and should be blocked
  if (!gatewayUserId || !gatewayUserEmail || !originalUrl) {
    log.warn("vcs.gateway.blocked", { method: req.method, path: req.path });

    return res.status(403).json({
      error: "Forbidden",
      message: "Direct access to Version Control service is not allowed",
      hint: "Please use the API Gateway at http://localhost:4000/api/*",
      gateway: {
        endpoint: "http://localhost:4000/api/version-control",
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

  log.info("vcs.gateway.request", {
    email: gatewayUserEmail,
    method: req.method,
    path: req.path,
  });

  next();
};
