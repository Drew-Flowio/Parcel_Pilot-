import crypto from "node:crypto";

/**
 * HMAC SHA-256 verification for inbound Skywalk webhook events.
 *
 * Skywalk POSTs `Content-Type: application/json` to /api/skywalk/webhook.
 * The signature header is one of:
 *
 *   x-skywalk-webhook-signature: sha256=<hex>
 *   x-skywalk-webhook-signature: <hex>          (some providers omit prefix)
 *
 * Computed as `HMAC_SHA256(SKYWALK_WEBHOOK_SECRET, raw_body_bytes)`.
 *
 * Constant-time compare to prevent timing oracles.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Strip optional `sha256=` prefix.
  const m = /^sha256=(.+)$/i.exec(signatureHeader);
  const supplied = (m ? m[1] : signatureHeader).trim().toLowerCase();

  if (supplied.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(supplied, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Recognized webhook events. We dispatch on `event` to the matching
 * resource adapter — same `toRow()` mapping the cron-driven ingest uses,
 * so the dedupe + normalization rules are identical between push and pull.
 */
export type SkywalkWebhookEvent =
  | "message.created"
  | "message.updated"
  | "contact.created"
  | "contact.updated"
  | "property.created"
  | "property.updated";

export interface SkywalkWebhookPayload {
  event: SkywalkWebhookEvent;
  data: Record<string, unknown>;
  occurred_at?: string;
  delivery_id?: string;
}

export function isWebhookEvent(s: string): s is SkywalkWebhookEvent {
  return [
    "message.created",
    "message.updated",
    "contact.created",
    "contact.updated",
    "property.created",
    "property.updated",
  ].includes(s);
}
