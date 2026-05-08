import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import {
  DEFAULT_ROLLUP_TZ,
  rollupConversations,
  rollupThreadDays,
} from "@/lib/skywalk/rollup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/skywalk/rollup
 *
 * Re-aggregates raw messages into one or both rollup tables.
 *
 * Body (all optional):
 *   {
 *     target?: "conversations" | "thread_days" | "all"   // default "all"
 *     since?: ISOString | null   // null = full re-rollup; omit = no watermark passed
 *     conversationId?: string    // thread_days only — restrict to one thread
 *     tz?: IANA tz string        // thread_days only — default America/Chicago
 *   }
 *
 * Returns each step's `{ rolledUp, durationMs }` keyed by target.
 *
 * The thread_day rollup is the **canonical unit for downstream AppFolio
 * sync** — running this after every messages tick keeps that pipeline
 * fresh.
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
