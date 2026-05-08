import { NextRequest, NextResponse } from "next/server";
import {
  requireCronOrSyncSecret,
  requireSyncSecret,
} from "@/lib/skywalk/auth";
import { runIngest } from "@/lib/skywalk/ingest";
import { isSkywalkResource } from "@/lib/skywalk/resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/skywalk/sync/{resource}
 *
 * Vercel-cron entrypoint. Vercel sends `Authorization: Bearer $CRON_SECRET`
 * automatically. The same path also accepts `x-skywalk-sync-secret` for
 * manual triggers (curl / ops console).
 *
 * Always runs an INCREMENTAL tick (no full pulls). Budget defaults are
 * conservative for cron; pass overrides via POST for manual ops.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { resource: string } }
) {
  const denied = requireCronOrSyncSecret(req);
  if (denied) return denied;

  if (!isSkywalkResource(params.resource)) {
    return NextResponse.json(
      { error: `Unknown resource: ${params.resource}` },
      { status: 400 }
    );
  }

  try {
    const result = await runIngest(params.resource, {});
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

/**
 * POST /api/skywalk/sync/{resource}
 *
 * Manual / ops path. Auth: `x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET`.
 *
 * Optional JSON body: { maxWallMs, maxRequests, maxRecords, pageSize }
 *
 * Behavior:
 *   - Incremental only — uses the persisted cursor.
 *   - Returns immediately if another worker holds an active lease.
 *   - Returns a structured result (status: success | partial | error |
 *     skipped). 429 / budget-exhausted runs are reported as `partial` with
 *     `rateLimited` / `budgetExhausted` flags.
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
