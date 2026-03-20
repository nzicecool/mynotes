/**
 * Local authentication module — fully self-hosted, no external OAuth dependency.
 * Uses bcryptjs for password hashing and jose for JWT session tokens.
 */
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import { ForbiddenError } from "@shared/_core/errors";

export type LocalSessionPayload = {
  userId: number;
  email: string;
};

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret || "local-dev-secret-change-me");
}

/** Sign a JWT session token for a local user */
export async function createLocalSessionToken(
  userId: number,
  email: string,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);

  return new SignJWT({ userId, email, type: "local" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

/** Verify a JWT session token and return the payload */
export async function verifyLocalSessionToken(
  token: string | undefined | null
): Promise<LocalSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const { userId, email, type } = payload as Record<string, unknown>;
    if (type !== "local" || typeof userId !== "number" || typeof email !== "string") {
      return null;
    }
    return { userId, email };
  } catch {
    return null;
  }
}

/** Authenticate an incoming Express request via the session cookie */
export async function authenticateLocalRequest(req: Request): Promise<User> {
  const cookieHeader = req.headers.cookie;
  const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
  const sessionToken = cookies[COOKIE_NAME];

  const session = await verifyLocalSessionToken(sessionToken);
  if (!session) {
    console.warn("[LocalAuth] Missing or invalid session cookie");
    throw ForbiddenError("Invalid session");
  }

  const user = await db.getUserById(session.userId);
  if (!user) {
    throw ForbiddenError("User not found");
  }

  return user;
}
