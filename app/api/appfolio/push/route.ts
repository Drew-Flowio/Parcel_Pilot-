import { NextRequest, NextResponse } from "next/server";
import { requirePushSecret } from "@/lib/appfolio/auth";
import { runAppFolioPush } from "@/lib/appfolio/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/appfolio/push
 *
 * Drains up to `batchSize` (default 50) unsynced thread-day rollups,
 * applying the push policy:
 *
 *   PUSH  → POST/PATCH the AppFolio note, mark `synced_to_appfolio_at = now()`,
 *           store the AppFolio note id on the rollup row.
 *   SKIP  → mark `synced_to_appfolio_at = now()` with `last_push_reason =
 *           'skip:<reason>'`. Re-evaluation happens only when content
 *           changes (rollup function clears the timestamp).
 *   QUEUE → leave `synced_to_appfolio_at = NULL`, stamp `last_push_reason
 *           = 'queue:<reason>'`. Next cron tick re-evaluates.
 *   RETRY → AppFolio 429 / 5xx / network error: same as queue but with
 *           `last_push_reason = 'retry:<reason>'`. The worker stops the
 *           batch on 429 so we don't burn through retries.
 *
 * Headers:
 *   x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET   (required)
 *
 * Body (all optional):
 *   {
 *     "batchSize"?: number,                  // default 50, max 200
 *     "maxWallMs"?: number,                  // default 30_000
 *     "minSettleMinutes"?: number,           // policy override (default 10)
 *     "minMessages"?: number                 // policy override (default 2)
 *   }
 *
 * This route is the ONLY auto-push entrypoint. Owner records and other
 * static data are pushed only via /api/appfolio/push/owner (manual).
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
