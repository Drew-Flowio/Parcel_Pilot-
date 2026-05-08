import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret check for manual `/api/appfolio/*` ops:
 *
 *   x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET
 *
 * Returns `null` if authorized; otherwise a 401 NextResponse.
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

/**
 * Auth gate for AppFolio routes hit by both Vercel Cron AND manual ops.
 *
 * Accepts EITHER:
 *   1. `Authorization: Bearer $CRON_SECRET`            (Vercel cron).
 *   2. `x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET` (manual / ops).
 *
 * Either env var being set is sufficient. Returns `null` on success or a
 * 401/500 NextResponse on failure.
 */
export function requireCronOrPushSecret(req: NextRequest): NextResponse | null {
  const cron = process.env.CRON_SECRET ?? "";
  const push = process.env.APPFOLIO_PUSH_SECRET ?? "";

  if (!cron && !push) {
    return NextResponse.json(
      {
        error:
          "Neither CRON_SECRET nor APPFOLIO_PUSH_SECRET is configured on the server",
      },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m && cron && constantTimeEqual(m[1], cron)) return null;

  const supplied = req.headers.get("x-appfolio-push-secret") ?? "";
  if (push && constantTimeEqual(supplied, push)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
