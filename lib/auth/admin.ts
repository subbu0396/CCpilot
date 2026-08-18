import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get("x-admin-token") || "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export function requireAdminAuth(req: NextRequest): NextResponse | null {
  if (isAdminAuthorized(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
