import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { resetCursor, readCursor } from "@/lib/skywalk/cursors";
import { isSkywalkResource } from "@/lib/skywalk/resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/skywalk/sync/reset/{resource}
 *
 * Recovery endpoint: reset the cursor for a single resource WITHOUT
 * triggering a backfill. After this, the next normal incremental tick
 * (`/api/skywalk/sync/{resource}`) starts from a null watermark.
 *
 * When to use this:
 *   - Skywalk rotated cursor tokens and the existing token now 4xx's.
 *   - A prior crash left `last_run_status='running'` and we want to
 *     clear the lease before its 5-minute auto-expiry.
 *   - Operator wants to "rebuild from scratch" without burning the full
 *     backfill quota — this resets state but lets the normal cron walk
 *     forward incrementally.
 *
 * Headers (required):
 *   x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET
 *   x-skywalk-confirm-reset: yes      (double-confirm guard)
 *
 * Returns:
 *   { ok: true, before: <cursor row>, after: <cursor row> }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { resource: string } }
) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  if (req.headers.get("x-skywalk-confirm-reset") !== "yes") {
    return NextResponse.json(
      {
        error:
          "Cursor reset requires the header `x-skywalk-confirm-reset: yes`. This guard prevents accidental full re-pulls on the next tick.",
      },
      { status: 400 }
    );
  }

  if (!isSkywalkResource(params.resource)) {
    return NextResponse.json(
      { error: `Unknown resource: ${params.resource}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServer();
  try {
    const before = await readCursor(supabase, params.resource);
    await resetCursor(supabase, params.resource);
    const after = await readCursor(supabase, params.resource);
    return NextResponse.json({ ok: true, resource: params.resource, before, after });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
