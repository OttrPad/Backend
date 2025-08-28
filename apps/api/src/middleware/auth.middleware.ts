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
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
      console.error("SUPABASE_JWT_SECRET not configured");
      return res.status(500).json({
        error: "Server configuration error",
        message: "JWT verification not properly configured",
      });
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, jwtSecret) as SupabaseJWTPayload;

    // Check if token is expired (extra safety check)
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        error: "Token expired",
        message: "Please login again",
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      aud: decoded.aud,
      exp: decoded.exp,
    };

    // Log successful authentication (for debugging)
    console.log(`✅ User authenticated: ${decoded.email} (${decoded.sub})`);

    next();
  } catch (error) {
    console.error("JWT verification error:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: "Invalid token",
        message: "The provided token is invalid or malformed",
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: "Token expired",
        message: "Please login again",
      });
    }

    return res.status(500).json({
      error: "Authentication error",
      message: "An error occurred during authentication",
    });
  }
};

// Optional middleware for routes that work with or without auth
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // If auth header exists, try to verify it
    return verifySupabaseJWT(req, res, next);
  }

  // No auth header, continue without user info
  next();
};
