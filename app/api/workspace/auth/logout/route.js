import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/workspace/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/workspace/session";
import { logAudit } from "@/lib/workspace/audit";

export async function POST(req) {
  const user = await getCurrentUser();
  const res = NextResponse.redirect(new URL("/workspace/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  if (user) await logAudit({ actorId: user.id, action: "auth.logout", req });
  return res;
}
