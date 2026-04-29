import type { CookieOptions, Request } from "express";

/**
 * Determines whether the request arrived over a secure (HTTPS) connection.
 * Checks both the Express `req.protocol` and the `X-Forwarded-Proto` header
 * so it works correctly behind reverse proxies (nginx, Traefik, Caddy).
 */
function isSecureRequest(req: Request): boolean {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Returns cookie options appropriate for the current transport:
 *
 * - HTTPS (production / reverse-proxy): SameSite=None + Secure=true
 *   Allows the cookie to be sent in cross-origin requests (e.g. when the
 *   Vite dev server and the API server run on different origins).
 *
 * - HTTP (local network / Raspberry Pi / development): SameSite=Lax + Secure=false
 *   Browsers refuse to set SameSite=None cookies over plain HTTP, so we
 *   fall back to Lax which still works for same-site navigation and form POSTs.
 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    // SameSite=None REQUIRES Secure=true — browsers silently drop the cookie
    // if SameSite=None is set without Secure on an HTTP connection.
    // Use Lax for plain-HTTP deployments (local network, Raspberry Pi, etc.).
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
