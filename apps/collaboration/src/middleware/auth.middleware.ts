import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        aud?: string;
        exp?: number;
      };
    }
  }
}

interface SupabaseJWTPayload {
  sub: string; // user id
  email: string;
  role?: string;
  aud: string;
  exp: number;
  iss: string;
}

export const verifySupabaseJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid authorization header",
        message: "Please provide a valid Bearer token",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return res.status(401).json({
        error: "No token provided",
        message: "Authorization token is required",
      });
    }

    // Get Supabase JWT secret from environment
    const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!supabaseJwtSecret) {
      console.error("❌ SUPABASE_JWT_SECRET not configured");
      return res.status(500).json({
        error: "Server configuration error",
        message: "JWT secret not configured",
      });
    }

    // Verify and decode the JWT
    const decoded = jwt.verify(token, supabaseJwtSecret) as SupabaseJWTPayload;

    // Add user info to request object for downstream use
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      aud: decoded.aud,
      exp: decoded.exp,
    };

    // Add headers that match the API gateway pattern
    req.headers["x-gateway-user-id"] = decoded.sub;
    req.headers["x-gateway-user-email"] = decoded.email;

    console.log(`✅ User authenticated: ${decoded.email} (${decoded.sub})`);
    next();
  } catch (error: any) {
    console.warn("🔒 JWT verification failed:", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
        message: "Your session has expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token",
        message: "The provided token is invalid",
      });
    }

    return res.status(401).json({
      error: "Authentication failed",
      message: "Unable to verify token",
    });
  }
};
