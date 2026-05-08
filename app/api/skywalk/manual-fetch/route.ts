import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { processManualFetchQueue } from "@/lib/skywalk/manualFetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/skywalk/manual-fetch
 *
 * Drains pending rows from `manual_fetch_queue`. Idempotent — each row is
 * claimed via UPDATE … WHERE status='pending' so concurrent calls don't
 * double-process. Stops the batch on first 429 (caller should poll again
 * after a short delay, or just wait for the next cron tick).
 *
 * Optional JSON body:
 *   { batchSize?: number = 25, maxAttempts?: number = 5 }
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
