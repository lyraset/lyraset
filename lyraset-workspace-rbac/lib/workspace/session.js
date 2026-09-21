/**
 * Signed session token (JWT, HS256) in an httpOnly cookie. Edge-safe (jose only).
 * The token is a hint for middleware; server guards re-validate against the DB
 * (active status, current role, tokenVersion) on every request.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lyr_ws_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const ISSUER = "lyraset-workspace";
const AUDIENCE = "lyraset-workspace";

function getSecret() {
  const secret = process.env.WORKSPACE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("WORKSPACE_JWT_SECRET must be set and at least 32 characters long");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user) {
  return new SignJWT({
    role: user.role,
    ra: user.requiresAttendance !== false,
    tv: user.tokenVersion ?? 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user._id ?? user.id))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Returns { id, role, requiresAttendance, tokenVersion } or null. Throws only on misconfiguration. */
export async function verifySessionToken(token) {
  const secret = getSecret();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    return {
      id: payload.sub,
      role: payload.role,
      requiresAttendance: payload.ra !== false,
      tokenVersion: payload.tv ?? 0,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}
