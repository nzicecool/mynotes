/**
 * Local authentication REST routes — register, login, logout.
 * These are plain Express routes (not tRPC) so they can set cookies directly.
 */
import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { createLocalSessionToken } from "./localAuth";
import * as db from "../db";

/** Token TTL: 1 hour */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const BCRYPT_ROUNDS = 12;

export function registerLocalAuthRoutes(app: Express) {
  /** POST /api/auth/register — create a new account */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email and password are required" });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    try {
      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.createLocalUser({ name, email, passwordHash });

      const user = await db.getUserByEmail(email);
      if (!user) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }

      const sessionToken = await createLocalSessionToken(user.id, user.email!, {
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Register failed:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  /** POST /api/auth/login — authenticate with email + password */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        // Constant-time response to prevent user enumeration
        await bcrypt.hash("dummy", BCRYPT_ROUNDS);
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const sessionToken = await createLocalSessionToken(user.id, user.email!, {
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  /** POST /api/auth/logout — clear session cookie */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  /**
   * POST /api/auth/forgot-password
   * Body: { email: string, origin: string }
   *
   * Generates a single-use reset token (valid 1 hour) and:
   *  1. If SMTP_HOST is configured, sends an email via nodemailer.
   *  2. Always logs the reset URL to the server console as a fallback
   *     (useful for local deployments without an email server).
   *
   * Always responds 200 to prevent user enumeration.
   */
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const { email, origin } = req.body ?? {};

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }

    // Always respond 200 — never reveal whether the email exists
    res.json({ success: true });

    // Run token generation asynchronously after response is sent
    try {
      const user = await db.getUserByEmail(email);
      if (!user) return; // silently ignore unknown emails

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await db.createPasswordResetToken(user.id, tokenHash, expiresAt);

      // Build the reset URL using the client's origin
      const clientOrigin = typeof origin === "string" && origin.startsWith("http")
        ? origin
        : "http://localhost:3000";
      const resetUrl = `${clientOrigin}/reset-password?token=${rawToken}&uid=${user.id}`;

      // ── Console fallback (always printed for local deployments) ──────────
      console.log("\n" + "=" .repeat(60));
      console.log("[PasswordReset] Reset link for:", email);
      console.log("[PasswordReset] URL:", resetUrl);
      console.log("[PasswordReset] Expires at:", expiresAt.toISOString());
      console.log("=" .repeat(60) + "\n");

      // ── Optional SMTP email ──────────────────────────────────────────────
      if (process.env.SMTP_HOST) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: process.env.SMTP_SECURE === "true",
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM ?? `"MyNotes" <noreply@mynotes.local>`,
            to: email,
            subject: "Reset your MyNotes password",
            text: `Click the link below to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
            html: `<p>Click the link below to reset your password (valid for <strong>1 hour</strong>):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
          });
          console.log("[PasswordReset] Email sent to", email);
        } catch (emailErr) {
          console.error("[PasswordReset] Failed to send email:", emailErr);
        }
      }
    } catch (err) {
      console.error("[PasswordReset] Token generation failed:", err);
    }
  });

  /**
   * POST /api/auth/reset-password
   * Body: { uid: number, token: string, newPassword: string }
   *
   * Verifies the token against the stored hash, updates the password,
   * and deletes all reset tokens for the user.
   */
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const { uid, token, newPassword } = req.body ?? {};

    if (!uid || !token || !newPassword) {
      res.status(400).json({ error: "uid, token and newPassword are required" });
      return;
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    try {
      const userId = Number(uid);
      if (isNaN(userId)) {
        res.status(400).json({ error: "Invalid uid" });
        return;
      }

      const record = await db.getValidResetTokenByUserId(userId);
      if (!record) {
        res.status(400).json({ error: "Reset link is invalid or has expired" });
        return;
      }

      const valid = await bcrypt.compare(String(token), record.tokenHash);
      if (!valid) {
        res.status(400).json({ error: "Reset link is invalid or has expired" });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await db.updateUserPassword(userId, newHash);
      await db.deleteResetTokensByUserId(userId);

      console.log("[PasswordReset] Password updated for userId:", userId);
      res.json({ success: true });
    } catch (err) {
      console.error("[PasswordReset] Reset failed:", err);
      res.status(500).json({ error: "Password reset failed" });
    }
  });
}
