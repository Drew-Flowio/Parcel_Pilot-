import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { requireCronOrSyncSecret } from "@/lib/skywalk/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/preflight
 *
 * Production-readiness check. Inspects:
 *   1. Env vars — required vs optional, present/absent (no values).
 *   2. Supabase connection — pings each table the pipeline depends on.
 *   3. Skywalk cursors — flags any cursor `running` for >10 minutes
 *      (real lease is 5 min; a 10-min running cursor likely lost a writer).
 *   4. Backlogs — manual_fetch_queue, appfolio_push_log retrying/failed,
 *      thread-day-rollups unsynced.
 *
 * Returns a structured report. Caller maps `overall` to HTTP color codes.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR `x-skywalk-sync-secret`.
 *       (Use the same auth as the rest of /api/skywalk/* — preflight is
 *        operationally part of the same surface.)
 */
export async function GET(req: NextRequest) {
  const denied = requireCronOrSyncSecret(req);
  if (denied) return denied;

  const env = checkEnv();
  const dbResult = await checkDb();
  const cursorResult = await checkCursors();
  const backlogResult = await checkBacklogs();

  const issues: string[] = [
    ...env.issues,
    ...dbResult.issues,
    ...cursorResult.issues,
    ...backlogResult.issues,
  ];

  const overall: "ok" | "warn" | "fail" =
    env.fatal || dbResult.fatal
      ? "fail"
      : issues.length > 0
        ? "warn"
        : "ok";

  return NextResponse.json({
    overall,
    now: new Date().toISOString(),
    env: env.report,
    db: dbResult.report,
    cursors: cursorResult.report,
    backlogs: backlogResult.report,
    issues,
  });
}

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

interface EnvReport {
  required: Record<string, "set" | "missing">;
  optional: Record<string, "set" | "default">;
  fatal: boolean;
  issues: string[];
  report: { required_missing: string[]; optional_unset: string[] };
}

const REQUIRED_ENVS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  // Skywalk inbound
  "SKYWALK_BASE_URL",
  "SKYWALK_API_KEY",
  "SKYWALK_SYNC_SECRET",
  // AppFolio outbound
  "APPFOLIO_BASE_URL",
  "APPFOLIO_API_KEY",
  "APPFOLIO_PUSH_SECRET",
];

const OPTIONAL_ENVS = [
  // Vercel cron (recommended for prod)
  "CRON_SECRET",
  // Webhook (recommended; if absent, the route returns 500)
  "SKYWALK_WEBHOOK_SECRET",
  // Skywalk tuning
  "SKYWALK_AUTH_HEADER",
  "SKYWALK_AUTH_SCHEME",
  "SKYWALK_TIMEOUT_MS",
  "SKYWALK_MAX_RETRIES",
  "SKYWALK_USER_AGENT",
  "SKYWALK_MESSAGES_PATH",
  "SKYWALK_CONTACTS_PATH",
  "SKYWALK_PROPERTIES_PATH",
  // AppFolio tuning
  "APPFOLIO_AUTH_HEADER",
  "APPFOLIO_AUTH_SCHEME",
  "APPFOLIO_TIMEOUT_MS",
  "APPFOLIO_MAX_RETRIES",
  "APPFOLIO_USER_AGENT",
  "APPFOLIO_NOTE_PATH",
  "APPFOLIO_OWNER_PATH",
  "APPFOLIO_DRY_RUN",
];

function checkEnv(): EnvReport {
  const required: Record<string, "set" | "missing"> = {};
  const optional: Record<string, "set" | "default"> = {};
  const required_missing: string[] = [];
  const optional_unset: string[] = [];

  for (const k of REQUIRED_ENVS) {
    const v = process.env[k];
    if (v && v.length > 0) required[k] = "set";
    else {
      required[k] = "missing";
      required_missing.push(k);
    }
  }
  for (const k of OPTIONAL_ENVS) {
    const v = process.env[k];
    if (v && v.length > 0) optional[k] = "set";
    else {
      optional[k] = "default";
      optional_unset.push(k);
    }
  }

  const fatal = required_missing.length > 0;
  const issues = required_missing.map((k) => `Missing required env: ${k}`);

  // Soft warnings for high-impact optional envs.
  if (!process.env.CRON_SECRET) {
    issues.push(
      "CRON_SECRET is not set — Vercel cron jobs will be unable to authenticate via Bearer."
    );
  }
  if (!process.env.SKYWALK_WEBHOOK_SECRET) {
    issues.push(
      "SKYWALK_WEBHOOK_SECRET is not set — /api/skywalk/webhook will reject all events."
    );
  }

  return {
    required,
    optional,
    fatal,
    issues,
    report: { required_missing, optional_unset },
  };
}

// ---------------------------------------------------------------------------
// Supabase / table connectivity
// ---------------------------------------------------------------------------

interface DbReport {
  fatal: boolean;
  issues: string[];
  report: Record<string, { ok: boolean; error?: string }>;
}

async function checkDb(): Promise<DbReport> {
  const supabase = getSupabaseServer();
  const tables = [
    "parcels",
    "skywalk_messages",
    "skywalk_conversations",
    "skywalk_thread_day_rollups",
    "skywalk_sync_cursors",
    "manual_fetch_queue",
    "appfolio_push_log",
  ];

  const report: Record<string, { ok: boolean; error?: string }> = {};
  const issues: string[] = [];
  let fatal = false;

  await Promise.all(
    tables.map(async (t) => {
      const { error } = await supabase.from(t).select("*", { count: "exact", head: true });
      if (error) {
        report[t] = { ok: false, error: error.message };
        issues.push(`Cannot query table ${t}: ${error.message}`);
        // RLS / auth issues are fatal — the worker can't function.
        if (/permission|denied|not authorized|RLS/i.test(error.message)) fatal = true;
      } else {
        report[t] = { ok: true };
      }
    })
  );

  return { fatal, issues, report };
}

// ---------------------------------------------------------------------------
// Cursor staleness
// ---------------------------------------------------------------------------

interface CursorReport {
  fatal: boolean;
  issues: string[];
  report: Array<{
    resource: string;
    last_run_status: string | null;
    last_run_started_at: string | null;
    last_run_finished_at: string | null;
    minutes_since_last_run: number | null;
    stuck: boolean;
  }>;
}

async function checkCursors(): Promise<CursorReport> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("skywalk_sync_cursors")
    .select("resource, last_run_status, last_run_started_at, last_run_finished_at")
    .order("resource");

  if (error) {
    return {
      fatal: false,
      issues: [`cursors lookup failed: ${error.message}`],
      report: [],
    };
  }

  const issues: string[] = [];
  const now = Date.now();
  const report = (data ?? []).map((r) => {
    const startedAt = r.last_run_started_at ? Date.parse(r.last_run_started_at) : null;
    const minutesSince =
      startedAt != null && Number.isFinite(startedAt)
        ? (now - startedAt) / 60_000
        : null;
    const stuck =
      r.last_run_status === "running" &&
      minutesSince != null &&
      minutesSince > 10;
    if (stuck) {
      issues.push(
        `cursor for ${r.resource} stuck running ${minutesSince!.toFixed(1)}min — POST /api/skywalk/sync/reset/${r.resource} with x-skywalk-confirm-reset: yes`
      );
    }
    if (r.last_run_status === "error") {
      issues.push(`cursor for ${r.resource} last_run_status=error`);
    }
    return {
      resource: r.resource,
      last_run_status: r.last_run_status,
      last_run_started_at: r.last_run_started_at,
      last_run_finished_at: r.last_run_finished_at,
      minutes_since_last_run: minutesSince != null ? Math.round(minutesSince * 10) / 10 : null,
      stuck,
    };
  });

  return { fatal: false, issues, report };
}

// ---------------------------------------------------------------------------
// Backlogs
// ---------------------------------------------------------------------------

interface BacklogReport {
  fatal: boolean;
  issues: string[];
  report: {
    manual_fetch_queue: { pending: number; failed: number };
    appfolio_push_log_24h: { retrying: number; failure: number };
    thread_day_rollups_unsynced: number;
  };
}

async function checkBacklogs(): Promise<BacklogReport> {
  const supabase = getSupabaseServer();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [mfPending, mfFailed, apRetrying, apFailure, rolUnsynced] = await Promise.all([
    supabase.from("manual_fetch_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("manual_fetch_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("appfolio_push_log").select("*", { count: "exact", head: true }).eq("status", "retrying").gte("attempted_at", since24h),
    supabase.from("appfolio_push_log").select("*", { count: "exact", head: true }).eq("status", "failure").gte("attempted_at", since24h),
    supabase.from("skywalk_thread_day_rollups").select("*", { count: "exact", head: true }).is("synced_to_appfolio_at", null),
  ]);

  const issues: string[] = [];
  if ((mfPending.count ?? 0) > 100) {
    issues.push(`manual_fetch_queue pending=${mfPending.count} (>100 — cron may be off)`);
  }
  if ((apFailure.count ?? 0) > 10) {
    issues.push(`appfolio push failures in last 24h: ${apFailure.count}`);
  }
  if ((rolUnsynced.count ?? 0) > 1000) {
    issues.push(`thread_day_rollups unsynced=${rolUnsynced.count} (>1000 — push cron may be off)`);
  }

  return {
    fatal: false,
    issues,
    report: {
      manual_fetch_queue: {
        pending: mfPending.count ?? 0,
        failed: mfFailed.count ?? 0,
      },
      appfolio_push_log_24h: {
        retrying: apRetrying.count ?? 0,
        failure: apFailure.count ?? 0,
      },
      thread_day_rollups_unsynced: rolUnsynced.count ?? 0,
    },
  };
}
