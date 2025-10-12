import { Request, Response, NextFunction } from "express";

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

  // Check for the necessary gateway headers
  const gatewayUserId = req.headers["x-gateway-user-id"];
  const gatewayUserEmail = req.headers["x-gateway-user-email"];
  const originalUrl = req.headers["x-original-url"];

  // If no gateway headers, this is a direct call and should be blocked
  if (!gatewayUserId || !gatewayUserEmail || !originalUrl) {
    console.warn(`🚨 Direct access attempt blocked: ${req.method} ${req.path}`);

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

  console.log(
    `✅ Gateway-authenticated request: ${gatewayUserEmail} -> ${req.method} ${req.path}`
  );

  next();
};
