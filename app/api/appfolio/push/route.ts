import { NextRequest, NextResponse } from "next/server";
import {
  requireCronOrPushSecret,
  requirePushSecret,
} from "@/lib/appfolio/auth";
import { runAppFolioPush } from "@/lib/appfolio/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/appfolio/push
 *
 * Vercel-cron entrypoint. Drains the unsynced-rollup backlog with default
 * policy (10-min settle window, ≥2 msgs OR action-worthy).
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR `x-appfolio-push-secret`.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronOrPushSecret(req);
  if (denied) return denied;

  try {
    const result = await runAppFolioPush({
      batchSize: 50,
      maxWallMs: 30_000,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/appfolio/push
 *
 * Manual / ops path. Auth: `x-appfolio-push-secret`.
 *
 * Drains up to `batchSize` (default 50) unsynced thread-day rollups,
 * applying the push policy (PUSH / SKIP / QUEUE / RETRY) — see
 * `lib/appfolio/policy.ts` for rule details. This is the ONLY auto-push
 * surface; owner records go through /api/appfolio/push/owner.
 *
 * Body (all optional):
 *   {
 *     "batchSize"?: number,                 // default 50, max 200
 *     "maxWallMs"?: number,                 // default 30_000
 *     "minSettleMinutes"?: number,          // policy override (default 10)
 *     "minMessages"?: number                // policy override (default 2)
 *   }
 */
export async function POST(req: NextRequest) {
  const denied = requirePushSecret(req);
  if (denied) return denied;

  let body: {
    batchSize?: number;
    maxWallMs?: number;
    minSettleMinutes?: number;
    minMessages?: number;
  } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const batchSize = clampInt(body.batchSize, 1, 200, 50);
  const maxWallMs = clampInt(body.maxWallMs, 1_000, 60_000, 30_000);

  try {
    const result = await runAppFolioPush({
      batchSize,
      maxWallMs,
      policy: {
        minSettleMinutes: body.minSettleMinutes,
        minMessages: body.minMessages,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
