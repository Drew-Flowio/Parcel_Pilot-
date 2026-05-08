import { NextRequest, NextResponse } from "next/server";
import { requirePushSecret } from "@/lib/appfolio/auth";
import { runAppFolioPush } from "@/lib/appfolio/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/appfolio/push/manual
 *
 * Force-push a single thread-day rollup, bypassing the standard policy.
 * Use cases:
 *   - Operator wants to send "now" without waiting for the day to settle.
 *   - Replay a failed push after the receiving side was fixed.
 *   - Smoke-test a new AppFolio destination with one known-good rollup.
 *
 * Headers:
 *   x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET    (required)
 *
 * Body:
 *   { "rollupId": "<uuid>" }
 *
 * Note: even with `force=true`, the worker still PATCHes the existing
 * `appfolio_note_id` if there is one — never creating a duplicate AF note.
 */
export async function POST(req: NextRequest) {
  const denied = requirePushSecret(req);
  if (denied) return denied;

  let body: { rollupId?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const rollupId = (body.rollupId ?? "").trim();
  if (!rollupId) {
    return NextResponse.json(
      { error: "Missing `rollupId` in request body." },
      { status: 400 }
    );
  }

  try {
    const result = await runAppFolioPush({
      rollupId,
      batchSize: 1,
      maxWallMs: 25_000,
      force: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
