import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { rollupConversations } from "@/lib/skywalk/rollup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/skywalk/rollup
 *
 * Re-aggregates `skywalk_messages` → `skywalk_conversations`. Idempotent —
 * safe to call after every messages tick (or on a slower cron).
 *
 * Optional JSON body:
 *   { since?: ISOString | null }
 *     - omit (or null) → re-rollup any conversation with new messages since
 *       the last rollup (uses the cron's natural cadence as the watermark)
 *     - "1970-01-01"   → full re-rollup of every conversation
 *
 * If you don't pass `since`, the route reads the highest `rolled_up_at`
 * from `skywalk_conversations` and uses that as the watermark.
 */
export async function POST(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  let body: { since?: string | null } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  let since: Date | null = null;
  if (body.since === null) {
    since = null;
  } else if (typeof body.since === "string") {
    const ts = Date.parse(body.since);
    if (!Number.isFinite(ts)) {
      return NextResponse.json(
        { error: "Invalid `since` (expected ISO timestamp)" },
        { status: 400 }
      );
    }
    since = new Date(ts);
  }

  try {
    const result = await rollupConversations(since);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
