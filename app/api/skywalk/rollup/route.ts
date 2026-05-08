import { NextRequest, NextResponse } from "next/server";
import {
  requireCronOrSyncSecret,
  requireSyncSecret,
} from "@/lib/skywalk/auth";
import {
  DEFAULT_ROLLUP_TZ,
  rollupConversations,
  rollupThreadDays,
} from "@/lib/skywalk/rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/skywalk/rollup
 *
 * Vercel-cron entrypoint. Always uses an INCREMENTAL watermark so we never
 * re-aggregate the full history per tick.
 *
 * Query params (all optional):
 *   ?target=conversations|thread_days|all   (default "all")
 *   ?lookback_minutes=N                     (default 30; clamps 5..1440)
 *   ?tz=IANA_tz                             (default America/Chicago)
 *
 * The watermark is `now - lookback_minutes`; the rollup function only
 * touches conversations/days with a message ingested after that. With a
 * 5-min cron + 30-min lookback we have 6× redundancy — any single tick
 * failure is recovered by the next.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR `x-skywalk-sync-secret`.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronOrSyncSecret(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;

  const target = (sp.get("target") ?? "all") as
    | "conversations"
    | "thread_days"
    | "all";
  if (!["conversations", "thread_days", "all"].includes(target)) {
    return NextResponse.json({ error: `Invalid target: ${target}` }, { status: 400 });
  }

  const lookbackParam = Number(sp.get("lookback_minutes") ?? "30");
  const lookbackMin = Number.isFinite(lookbackParam)
    ? Math.max(5, Math.min(1440, Math.floor(lookbackParam)))
    : 30;
  const since = new Date(Date.now() - lookbackMin * 60_000);

  const tz = sp.get("tz") ?? DEFAULT_ROLLUP_TZ;

  const result: Record<string, unknown> = {
    target,
    lookback_minutes: lookbackMin,
    since: since.toISOString(),
  };
  try {
    if (target === "conversations" || target === "all") {
      result.conversations = await rollupConversations(since);
    }
    if (target === "thread_days" || target === "all") {
      result.thread_days = await rollupThreadDays({ since, tz });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skywalk/rollup
 *
 * Manual / ops path. Auth: `x-skywalk-sync-secret`.
 *
 * Body (all optional):
 *   {
 *     target?: "conversations" | "thread_days" | "all"   // default "all"
 *     since?: ISOString | null   // null = full re-rollup; omit = no watermark
 *     conversationId?: string    // thread_days only — restrict to one thread
 *     tz?: IANA tz string        // thread_days only — default America/Chicago
 *   }
 *
 * `since: null` triggers a FULL re-rollup of every conversation and is
 * intentionally available only on POST + manual auth — cron can never
 * trigger it.
 */
export async function POST(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  let body: {
    target?: "conversations" | "thread_days" | "all";
    since?: string | null;
    conversationId?: string;
    tz?: string;
  } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const target = body.target ?? "all";
  if (!["conversations", "thread_days", "all"].includes(target)) {
    return NextResponse.json(
      { error: `Invalid target: ${target}. Use "conversations", "thread_days", or "all".` },
      { status: 400 }
    );
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

  const tz = body.tz ?? DEFAULT_ROLLUP_TZ;
  const conversationId = body.conversationId ?? null;

  const result: Record<string, unknown> = { target };

  try {
    if (target === "conversations" || target === "all") {
      result.conversations = await rollupConversations(since);
    }
    if (target === "thread_days" || target === "all") {
      result.thread_days = await rollupThreadDays({
        since,
        conversationId,
        tz,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
