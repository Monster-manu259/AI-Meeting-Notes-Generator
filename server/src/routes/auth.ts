// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from "express";
import { body, query as qv, validationResult } from "express-validator";
import * as authService from "../services/authService";
import { requireAuth } from "../middleware/auth";
import { logger } from "../middleware/logger";

const router = Router();

function ok(req: Request, res: Response, next: NextFunction): void {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    res.status(400).json({ success: false, errors: errs.array() });
    return;
  }
  next();
}

router.post(
  "/register",
  [
    body("name").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Name must be 2-100 characters"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;
      const user = await authService.register(name, email, password);
      res.status(201).json({
        success: true,
        message: "Account created successfully.",
        data: {
          user: { id: user.id, name: user.name, email: user.email },
          token: user.sessionToken,
        },
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("already exists")) {
        res.status(409).json({ success: false, error: e.message });
        return;
      }
      next(e);
    }
  }
);

router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const user = await authService.login(email, password);
      res.json({
        success: true,
        message: "Logged in successfully.",
        data: {
          user: { id: user.id, name: user.name, email: user.email },
          token: user.sessionToken,
        },
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Invalid email")) {
        res.status(401).json({ success: false, error: e.message });
        return;
      }
      next(e);
    }
  }
);

router.post("/logout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.sessionToken!);
    res.json({ success: true, message: "Logged out." });
  } catch (e) { next(e); }
});

router.post("/logout-all", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logoutAll(req.user!.id);
    res.json({ success: true, message: "All sessions terminated." });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, data: req.user });
});

router.post(
  "/forgot-password",
  [body("email").isEmail().normalizeEmail().withMessage("Valid email required")],
  ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.requestPasswordReset(req.body.email);
      res.json({
        success: true,
        message: "If an account exists with that email, a reset link has been sent.",
      });
    } catch (e) { next(e); }
  }
);

router.post(
  "/reset-password",
  [
    body("token").isString().trim().notEmpty().withMessage("Reset token required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.json({ success: true, message: "Password reset successfully. Please log in." });
    } catch (e) {
      if (e instanceof Error) {
        res.status(400).json({ success: false, error: e.message });
        return;
      }
      next(e);
    }
  }
);

export default router;