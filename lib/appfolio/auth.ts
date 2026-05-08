import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret check for `/api/appfolio/*` routes (cron, manual, owner,
 * health). The caller (Vercel cron / ops console / curl) sends:
 *
 *   x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET
 *
 * Returns `null` if authorized; otherwise a 401 NextResponse to return as-is.
 */
export function requirePushSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.APPFOLIO_PUSH_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "APPFOLIO_PUSH_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  const supplied = req.headers.get("x-appfolio-push-secret") ?? "";
  if (!constantTimeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
