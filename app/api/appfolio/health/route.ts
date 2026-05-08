import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { requireCronOrPushSecret } from "@/lib/appfolio/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/appfolio/health
 *
 * Snapshot of the AppFolio outbound pipeline:
 *   - rollup backlog: total / unsynced / queued / skipped / pushed / failed
 *   - audit log:      successful pushes vs retrying / failed in the last 24h
 *   - recent errors:  last 10 failure rows for triage
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR `x-appfolio-push-secret`.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronOrPushSecret(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    rollupTotal,
    rollupUnsynced,
    rollupQueued,
    rollupRetrying,
    rollupPushed,
    rollupFailed,
    pushSuccess24h,
    pushRetrying24h,
    pushFailed24h,
    pushSkipped24h,
    recentErrors,
  ] = await Promise.all([
    supabase.from("skywalk_thread_day_rollups").select("*", { count: "exact", head: true }),
    supabase
      .from("skywalk_thread_day_rollups")
      .select("*", { count: "exact", head: true })
      .is("synced_to_appfolio_at", null),
    supabase
      .from("skywalk_thread_day_rollups")
      .select("*", { count: "exact", head: true })
      .like("last_push_reason", "queue:%"),
    supabase
      .from("skywalk_thread_day_rollups")
      .select("*", { count: "exact", head: true })
      .like("last_push_reason", "retry:%"),
    supabase
      .from("skywalk_thread_day_rollups")
      .select("*", { count: "exact", head: true })
      .eq("last_push_reason", "pushed"),
    supabase
      .from("skywalk_thread_day_rollups")
      .select("*", { count: "exact", head: true })
      .like("last_push_reason", "failed:%"),
    supabase
      .from("appfolio_push_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "success")
      .gte("attempted_at", since24h),
    supabase
      .from("appfolio_push_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "retrying")
      .gte("attempted_at", since24h),
    supabase
      .from("appfolio_push_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "failure")
      .gte("attempted_at", since24h),
    supabase
      .from("appfolio_push_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "skipped")
      .gte("attempted_at", since24h),
    supabase
      .from("appfolio_push_log")
      .select("resource_type, skywalk_resource_id, status, http_status, error_message, attempted_at")
      .in("status", ["failure", "retrying"])
      .order("attempted_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    rollups: {
      total: rollupTotal.count ?? 0,
      unsynced: rollupUnsynced.count ?? 0,
      queued: rollupQueued.count ?? 0,
      retrying: rollupRetrying.count ?? 0,
      pushed: rollupPushed.count ?? 0,
      failed: rollupFailed.count ?? 0,
    },
    last_24h: {
      success: pushSuccess24h.count ?? 0,
      retrying: pushRetrying24h.count ?? 0,
      failed: pushFailed24h.count ?? 0,
      skipped: pushSkipped24h.count ?? 0,
    },
    recent_errors: recentErrors.data ?? [],
  });
}
