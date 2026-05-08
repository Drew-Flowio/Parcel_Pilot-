import { NextRequest, NextResponse } from "next/server";
import { requireSyncSecret } from "@/lib/skywalk/auth";
import { runFullIngest } from "@/lib/skywalk/ingest";
import { isSkywalkResource } from "@/lib/skywalk/resources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/skywalk/sync/full/{resource}
 *
 * Triggers an EXPLICIT FULL backfill. Requires both:
 *   1. `x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET`
 *   2. `x-skywalk-confirm-full: yes`
 *
 * The double-confirm prevents accidental full re-pulls (which can be very
 * expensive and rate-limit you out for the rest of the day).
 *
 * The cursor is reset BEFORE the run; if the run is interrupted mid-way,
 * resume by calling POST `/api/skywalk/sync/{resource}` (incremental) — the
 * cursor will pick up from wherever the full run got to.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { resource: string } }
) {
  const denied = requireSyncSecret(req);
  if (denied) return denied;

  if (req.headers.get("x-skywalk-confirm-full") !== "yes") {
    return NextResponse.json(
      {
        error:
          "Full pulls require the header `x-skywalk-confirm-full: yes`. This guard prevents accidental quota burns.",
      },
      { status: 400 }
    );
  }

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
    const result = await runFullIngest(params.resource, body);
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
