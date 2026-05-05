// src/services/authService.ts
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { query } from "../db";
import { logger } from "../middleware/logger";

const SESSION_TTL_DAYS = 7;
const RESET_TTL_MINUTES = 30;
const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface SessionUser extends PublicUser {
  sessionToken: string;
}

function generateToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function expiresAt(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<SessionUser> {
  const normalised = email.toLowerCase().trim();

  const existing = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [normalised]
  );
  if (existing.rows.length > 0) {
    throw new Error("An account with this email already exists.");
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await query<PublicUser>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [name.trim(), normalised, password_hash]
  );

  const user = result.rows[0];
  logger.info(`[auth] New user registered: ${user.email}`);

  const sessionToken = await createSession(user.id);
  return { ...user, sessionToken };
}

export async function login(
  email: string,
  password: string
): Promise<SessionUser> {
  const normalised = email.toLowerCase().trim();

  const result = await query<PublicUser & { password_hash: string }>(
    "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1",
    [normalised]
  );

  const user = result.rows[0];

  const hashToCheck = user?.password_hash ?? "$2b$12$invalidhashpadding000000000000000000000000000000000000";
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !valid) {
    throw new Error("Invalid email or password.");
  }

  const sessionToken = await createSession(user.id);
  logger.info(`[auth] Login: ${user.email}`);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
    sessionToken,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const exp = expiresAt(SESSION_TTL_DAYS * 24 * 60);

  await query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, token, exp]
  );
  return token;
}

export async function validateSession(token: string): Promise<PublicUser | null> {
  const result = await query<PublicUser & { expires_at: string }>(
    `SELECT u.id, u.name, u.email, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1`,
    [token]
  );

  const row = result.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await query("DELETE FROM sessions WHERE token = $1", [token]);
    return null;
  }

  return { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
}

export async function logout(token: string): Promise<void> {
  await query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function logoutAll(userId: string): Promise<void> {
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalised = email.toLowerCase().trim();
  const result = await query<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE email = $1",
    [normalised]
  );

  if (result.rows.length === 0) {
    logger.info(`[auth] Reset requested for unknown email: ${normalised}`);
    return;
  }

  const user = result.rows[0];
  const token = generateToken();
  const exp = expiresAt(RESET_TTL_MINUTES);

  await query(
    "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
    [user.id]
  );

  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, token, exp]
  );

  await sendResetEmail(normalised, user.name, token);
  logger.info(`[auth] Password reset email sent to ${normalised}`);
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  const result = await query<{ id: string; user_id: string; expires_at: string; used: boolean }>(
    "SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = $1",
    [token]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Invalid or expired reset token.");
  if (row.used) throw new Error("This reset link has already been used.");
  if (new Date(row.expires_at) < new Date()) throw new Error("Reset token has expired. Please request a new one.");

  const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [password_hash, row.user_id]);
  await query("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", [row.id]);

  await logoutAll(row.user_id);
  logger.info(`[auth] Password reset complete for user ${row.user_id}`);
}

async function sendResetEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {

  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls:{
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    },
  });

  await transporter.verify();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"MeetingMind" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: "Reset your MeetingMind password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="margin:0 0 8px">Reset your password</h2>
        <p style="color:#666">Hi ${name},</p>
        <p style="color:#666">Someone requested a password reset for your MeetingMind account.
           Click the button below to set a new password.
           This link expires in ${RESET_TTL_MINUTES} minutes.</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#6366f1;
                  color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
        <p style="color:#999;font-size:13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color:#bbb;font-size:12px;">Or copy this link: ${resetUrl}</p>
      </div>
    `,
  });
}