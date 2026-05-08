import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import {
  isWebhookEvent,
  verifyWebhookSignature,
  type SkywalkWebhookEvent,
  type SkywalkWebhookPayload,
} from "@/lib/skywalk/webhook";
import { getAdapter } from "@/lib/skywalk/resources";
import type { SkywalkResource } from "@/lib/skywalk/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * POST /api/skywalk/webhook
 *
 * Real-time inbound from Skywalk. Cron polls in 5-minute intervals; this
 * endpoint reduces lag to seconds for high-priority events (especially
 * `message.created`).
 *
 * Auth:
 *   x-skywalk-webhook-signature: sha256=<hex of HMAC_SHA256(secret, body)>
 *
 * Body:
 *   {
 *     "event": "message.created" | "message.updated" | ...,
 *     "data":  { ...full upstream record... },
 *     "delivery_id"?: string,    // Skywalk's idempotency token
 *     "occurred_at"?: ISOString
 *   }
 *
 * Idempotency:
 *   - Each upstream record has a unique id (skywalk_*_id) which is the
 *     UNIQUE constraint on the matching table → re-deliveries are no-ops.
 *   - We do NOT trigger downstream rollup synchronously; the next 5-min
 *     rollup cron tick re-aggregates touched conversations. This keeps
 *     the webhook response under Skywalk's signature-deadline threshold.
 *
 * Failure modes:
 *   - Bad signature → 401 (Skywalk should retry).
 *   - Unknown event → 200 with `{ skipped: true }` so Skywalk doesn't
 *     retry forever. We log it for awareness.
 *   - Upstream-shape error → 422 + structured body so Skywalk can stop
 *     retrying on permanent malformed data.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SKYWALK_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json(
      { error: "SKYWALK_WEBHOOK_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  // Read RAW body for HMAC. Don't .json() first — that mutates whitespace.
  const raw = await req.text();
  const sig = req.headers.get("x-skywalk-webhook-signature");
  if (!verifyWebhookSignature(raw, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: SkywalkWebhookPayload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.event || !isWebhookEvent(body.event)) {
    // Don't 4xx unknown-event — Skywalk might add new event types.
    return NextResponse.json({ ok: true, skipped: "unknown-event", event: body.event ?? null });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Missing `data` payload" }, { status: 422 });
  }

  const supabase = getSupabaseServer();
  const startedAt = Date.now();

  try {
    const { table, conflict } = await ingestWebhookRecord(body.event, body.data);

    const ack = {
      ok: true,
      event: body.event,
      table,
      conflict_column: conflict,
      delivery_id: body.delivery_id ?? null,
      duration_ms: Date.now() - startedAt,
    };

    // Touch the cursor so /health reflects "we're getting events".
    // Best-effort — never fail the webhook on this.
    void supabase
      .from("skywalk_sync_cursors")
      .update({ updated_at: new Date().toISOString() })
      .eq("source", "skywalk")
      .eq("resource", resourceForEvent(body.event))
      .then(() => {});

    return NextResponse.json(ack);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        event: body.event,
        delivery_id: body.delivery_id ?? null,
      },
      { status: 422 }
    );
  }
}

// --------------------------------------------------------------------------

const EVENT_TO_RESOURCE: Record<SkywalkWebhookEvent, SkywalkResource> = {
  "message.created": "messages",
  "message.updated": "messages",
  "contact.created": "contacts",
  "contact.updated": "contacts",
  "property.created": "properties",
  "property.updated": "properties",
};

const RESOURCE_TO_TABLE: Record<SkywalkResource, string> = {
  messages: "skywalk_messages",
  contacts: "skywalk_contacts",
  properties: "skywalk_properties",
};

const RESOURCE_TO_CONFLICT: Record<SkywalkResource, string> = {
  messages: "skywalk_message_id",
  contacts: "skywalk_contact_id",
  properties: "skywalk_property_id",
};

function resourceForEvent(event: SkywalkWebhookEvent): SkywalkResource {
  return EVENT_TO_RESOURCE[event];
}

async function ingestWebhookRecord(
  event: SkywalkWebhookEvent,
  data: Record<string, unknown>
): Promise<{ table: string; conflict: string }> {
  const resource = resourceForEvent(event);
  const adapter = getAdapter(resource);
  const row = adapter.toRow(data);

  const table = RESOURCE_TO_TABLE[resource];
  const conflict = RESOURCE_TO_CONFLICT[resource];

  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: conflict, ignoreDuplicates: false });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);

  return { table, conflict };
}
