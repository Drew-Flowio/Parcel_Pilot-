import { NextRequest, NextResponse } from "next/server";
import { requirePushSecret } from "@/lib/appfolio/auth";
import { pushOwnerNow } from "@/lib/appfolio/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/appfolio/push/owner
 *
 * Push (or PATCH) a single owner / parcel record to AppFolio. This is
 * intentionally manual-only — owner data is rarely time-sensitive and we
 * don't want to fire-hose 31k records into AppFolio. Operators trigger
 * this from the cockpit drawer ("Push to AppFolio") or a script.
 *
 * Headers:
 *   x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET   (required)
 *
 * Body:
 *   { "parcelId": "<uuid>" }
 *
 * Returns:
 *   { parcelId, pushed, appfolio_owner_id, http_status, error? }
 *
 * Re-pushing the same parcel:
 *   - We look up the most recent successful push in `appfolio_push_log`
 *     and PATCH the existing AppFolio owner row by that id, so duplicate
 *     records can't accumulate even if the operator clicks twice.
 */
export async function POST(req: NextRequest) {
  const denied = requirePushSecret(req);
  if (denied) return denied;

  let body: { parcelId?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const parcelId = (body.parcelId ?? "").trim();
  if (!parcelId) {
    return NextResponse.json(
      { error: "Missing `parcelId` in request body." },
      { status: 400 }
    );
  }

  try {
    const result = await pushOwnerNow(parcelId);
    const ok = result.pushed || result.error === "dry-run";
    return NextResponse.json(result, { status: ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
