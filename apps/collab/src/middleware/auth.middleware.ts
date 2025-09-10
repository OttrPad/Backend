import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const verifyToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ error: "JWT secret not configured" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};
