import { Request, Response, NextFunction } from "express";
import { validateSession, PublicUser } from "../services/authService";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      sessionToken?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const user = await validateSession(token);
  if (!user) {
    res.status(401).json({ success: false, error: "Session expired. Please log in again." });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (token) {
    const user = await validateSession(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}