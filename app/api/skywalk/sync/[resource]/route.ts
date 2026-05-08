import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { runIngest } from "@/lib/skywalk/ingest";
import { isSkywalkResource } from "@/lib/skywalk/resources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/skywalk/sync/{resource}
 *
 * Auth:
 *   x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET
 *
 * Optional JSON body:
 *   { maxWallMs, maxRequests, maxRecords, pageSize }
 *
 * Behavior:
 *   - Incremental only — uses the persisted cursor.
 *   - Returns immediately if another worker holds an active lease.
 *   - Always returns a structured result (status: success | partial | error |
 *     skipped). 429 / budget-exhausted runs are reported as `partial` with
 *     `rateLimited` or `budgetExhausted` flags so the caller (cron) knows
 *     to call again immediately rather than waiting for the next tick.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { resource: string } }
) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  if (!isSkywalkResource(params.resource)) {
    return NextResponse.json(
      { error: `Unknown resource: ${params.resource}` },
      { status: 400 }
    );
  }

  let body: {
    maxWallMs?: number;
    maxRequests?: number;
    maxRecords?: number;
    pageSize?: number;
  } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  try {
    const result = await runIngest(params.resource, body);
    return NextResponse.json(result, {
      status: result.status === "error" ? 500 : 200,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
