import { Request, Response, NextFunction } from "express";
import { log } from "@ottrpad/logger";

export const requireInternalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const secret = req.headers["x-internal-secret"] as string | undefined;
  const expected = process.env.VERSION_CONTROL_INTERNAL_SECRET;
  if (!expected || !secret || secret !== expected) {
    log.warn("vcs.internalAuth.invalid", { hasSecret: !!secret });
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid internal secret",
    });
  }
  log.debug("vcs.internalAuth.ok", { path: req.path });
  (req as any).gatewayUser = {
    id: "system-internal",
    email: "system@internal",
    originalUrl: req.originalUrl,
  };
  next();
};
