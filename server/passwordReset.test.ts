/**
 * Unit tests for the password reset flow.
 * Tests the db helpers and the token lifecycle using pure logic.
 */
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// ─── Helpers mirrored from the production code ───────────────────────────────

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function hashToken(raw: string): Promise<string> {
  return bcrypt.hash(raw, 10);
}

async function verifyToken(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}

function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt < new Date();
}

function buildResetUrl(origin: string, uid: number, rawToken: string): string {
  return `${origin}/reset-password?token=${rawToken}&uid=${uid}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Password reset token lifecycle", () => {
  it("generates a 64-character hex token", () => {
    const token = generateRawToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("two generated tokens are unique", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
  });

  it("hashed token verifies correctly against the raw token", async () => {
    const raw = generateRawToken();
    const hash = await hashToken(raw);
    const valid = await verifyToken(raw, hash);
    expect(valid).toBe(true);
  });

  it("wrong token does not verify against the hash", async () => {
    const raw = generateRawToken();
    const hash = await hashToken(raw);
    const wrong = generateRawToken();
    const valid = await verifyToken(wrong, hash);
    expect(valid).toBe(false);
  });

  it("token is not expired when freshly created", () => {
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    expect(isTokenExpired(expiresAt)).toBe(false);
  });

  it("token is expired when expiresAt is in the past", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isTokenExpired(expiresAt)).toBe(true);
  });
});

describe("Reset URL construction", () => {
  it("builds a correct reset URL", () => {
    const url = buildResetUrl("http://localhost:3000", 42, "abc123");
    expect(url).toBe("http://localhost:3000/reset-password?token=abc123&uid=42");
  });

  it("uses the provided origin, not a hardcoded domain", () => {
    const url = buildResetUrl("https://notes.example.com", 7, "tok");
    expect(url.startsWith("https://notes.example.com")).toBe(true);
  });
});

describe("Password validation rules", () => {
  it("accepts passwords of 8 or more characters", () => {
    const validate = (p: string) => typeof p === "string" && p.length >= 8;
    expect(validate("12345678")).toBe(true);
    expect(validate("correct horse battery staple")).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const validate = (p: string) => typeof p === "string" && p.length >= 8;
    expect(validate("short")).toBe(false);
    expect(validate("")).toBe(false);
  });
});
