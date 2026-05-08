import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret check for `/api/skywalk/*` routes. The caller (cron / Vercel
 * scheduler / ops console) must send `x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET`.
 *
 * Returns `null` if the request is authorized; otherwise a 401 NextResponse
 * the caller should return as-is.
 */
export function requireSyncSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.SKYWALK_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "SKYWALK_SYNC_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  const supplied = req.headers.get("x-skywalk-sync-secret") ?? "";
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
