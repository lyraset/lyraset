import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/workspace/db";
import User from "@/models/workspace/User";
import { verifyPassword, getPlaceholderHash } from "@/lib/workspace/passwords";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/workspace/session";
import { logAudit } from "@/lib/workspace/audit";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const LoginSchema = z.object({
  identifier: z.string().trim().min(3).max(120), // email or Employee ID
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

function safeRedirect(next) {
  if (typeof next !== "string") return "/workspace";
  if (!next.startsWith("/workspace") || next.startsWith("//") || next.startsWith("/workspace/login")) {
    return "/workspace";
  }
  return next;
}

const INVALID = { error: "Employee ID/email or password is incorrect." };

export async function POST(req) {
  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your Employee ID or email and password." }, { status: 400 });
  }
  const { identifier, password, next } = parsed.data;

  await connectDB();
  const query = identifier.includes("@")
    ? { email: identifier.toLowerCase() }
    : { employeeId: identifier.toUpperCase() };
  const user = await User.findOne(query).select("+passwordHash +failedLoginAttempts +lockUntil");

  if (!user) {
    await verifyPassword(password, await getPlaceholderHash()); // equalise timing
    await logAudit({ action: "auth.login_failed", meta: { identifier, reason: "unknown_account" }, req });
    return NextResponse.json(INVALID, { status: 401 });
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    await logAudit({ actorId: user._id, action: "auth.login_blocked", meta: { reason: "locked" }, req });
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes or ask the Owner to unlock your account.` },
      { status: 423 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $inc: { failedLoginAttempts: 1 } },
      { new: true }
    ).select("+failedLoginAttempts");
    if (updated.failedLoginAttempts >= MAX_ATTEMPTS) {
      await User.updateOne(
        { _id: user._id },
        { $set: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginAttempts: 0 } }
      );
      await logAudit({ actorId: user._id, action: "auth.account_locked", req });
    }
    await logAudit({ actorId: user._id, action: "auth.login_failed", meta: { reason: "bad_password" }, req });
    return NextResponse.json(INVALID, { status: 401 });
  }

  if (user.status !== "ACTIVE") {
    await logAudit({ actorId: user._id, action: "auth.login_blocked", meta: { reason: "inactive" }, req });
    return NextResponse.json({ error: "This account is deactivated. Contact the Owner." }, { status: 403 });
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } }
  );

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    ok: true,
    user: { name: user.name, role: user.role },
    redirectTo: safeRedirect(next),
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  await logAudit({ actorId: user._id, action: "auth.login", req });
  return res;
}
