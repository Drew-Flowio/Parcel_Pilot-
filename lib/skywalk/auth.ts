import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret check for `/api/skywalk/*` routes used by manual ops.
 * The caller (ops console / curl) must send:
 *   x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET
 *
 * Returns `null` if authorized; otherwise a 401 NextResponse the caller
 * should return as-is.
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

/**
 * Auth gate for routes hit by both Vercel Cron AND manual ops.
 *
 * Accepts EITHER:
 *   1. `Authorization: Bearer $CRON_SECRET`            (Vercel sends this
 *                                                       automatically when
 *                                                       `CRON_SECRET` is set).
 *   2. `x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET`   (manual / ops).
 *
 * Either env var being set is sufficient — both don't have to be configured
 * (e.g. a hobby deployment may have only one). Returns `null` on success
 * or a 401/500 NextResponse on failure.
 */
export function requireCronOrSyncSecret(req: NextRequest): NextResponse | null {
  const cron = process.env.CRON_SECRET ?? "";
  const sync = process.env.SKYWALK_SYNC_SECRET ?? "";

  if (!cron && !sync) {
    return NextResponse.json(
      {
        error:
          "Neither CRON_SECRET nor SKYWALK_SYNC_SECRET is configured on the server",
      },
      { status: 500 }
    );
  }

  // 1. Vercel cron Bearer.
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m && cron && constantTimeEqual(m[1], cron)) return null;

  // 2. Manual sync header.
  const supplied = req.headers.get("x-skywalk-sync-secret") ?? "";
  if (sync && constantTimeEqual(supplied, sync)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
