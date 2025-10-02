"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.verifySupabaseJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const verifySupabaseJWT = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
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
    }
    catch (error) {
        console.error("JWT verification error:", error);
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                error: "Invalid token",
                message: "The provided token is invalid or malformed",
            });
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
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
exports.verifySupabaseJWT = verifySupabaseJWT;
// Optional middleware for routes that work with or without auth
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        // If auth header exists, try to verify it
        return (0, exports.verifySupabaseJWT)(req, res, next);
    }
    // No auth header, continue without user info
    next();
};
exports.optionalAuth = optionalAuth;
