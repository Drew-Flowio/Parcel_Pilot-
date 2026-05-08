import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { requireSyncSecret } from "@/lib/skywalk/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/skywalk/health
 *
 * Returns cursor state, queue depths, and the last few errors per resource —
 * enough for a status page or for debugging a stalled pipeline. Auth-gated
 * by the same shared secret as the sync routes.
 */
export async function GET(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();

  const [cursors, queueCounts, pushPending, rollupCounts] = await Promise.all([
    supabase.from("skywalk_sync_cursors").select("*").order("resource"),
    Promise.all([
      supabase
        .from("manual_fetch_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("manual_fetch_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_progress"),
      supabase
        .from("manual_fetch_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed"),
    ]),
    supabase
      .from("appfolio_push_log")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "retrying"]),
    Promise.all([
      supabase
        .from("skywalk_thread_day_rollups")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("skywalk_thread_day_rollups")
        .select("*", { count: "exact", head: true })
        .is("synced_to_appfolio_at", null),
      supabase
        .from("skywalk_thread_day_rollups")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_response"),
    ]),
  ]);

  if (cursors.error) {
    return NextResponse.json({ error: cursors.error.message }, { status: 500 });
  }

  const [pending, inProgress, failed] = queueCounts;
  const [rollupTotal, rollupUnsynced, rollupNeedsResponse] = rollupCounts;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    cursors: cursors.data,
    manual_fetch_queue: {
      pending: pending.count ?? 0,
      in_progress: inProgress.count ?? 0,
      failed: failed.count ?? 0,
    },
    appfolio_push_log: {
      pending_or_retrying: pushPending.count ?? 0,
    },
    thread_day_rollups: {
      total: rollupTotal.count ?? 0,
      unsynced_to_appfolio: rollupUnsynced.count ?? 0,
      needs_response: rollupNeedsResponse.count ?? 0,
    },
  });
}
