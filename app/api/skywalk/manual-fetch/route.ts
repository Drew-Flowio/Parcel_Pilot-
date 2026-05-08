import { NextRequest, NextResponse } from "next/server";
import {
  requireCronOrSyncSecret,
  requireSyncSecret,
} from "@/lib/skywalk/auth";
import { processManualFetchQueue } from "@/lib/skywalk/manualFetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/skywalk/manual-fetch
 *
 * Vercel-cron entrypoint. Drains the retry queue with default batch size.
 * Auth: `Authorization: Bearer $CRON_SECRET` OR `x-skywalk-sync-secret`.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronOrSyncSecret(req);
  if (denied) return denied;

  try {
    const result = await processManualFetchQueue({});
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skywalk/manual-fetch
 *
 * Manual / ops path. Auth: `x-skywalk-sync-secret`.
 *
 * Drains pending rows from `manual_fetch_queue`. Idempotent — each row is
 * claimed via UPDATE … WHERE status='pending' so concurrent calls don't
 * double-process. Stops the batch on first 429.
 *
 * Optional JSON body: { batchSize?: number = 25, maxAttempts?: number = 5 }
 */
export async function POST(req: NextRequest) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  let body: { batchSize?: number; maxAttempts?: number } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  try {
    const result = await processManualFetchQueue(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
