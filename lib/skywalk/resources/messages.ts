import { readSkywalkEnv } from "../env";
import {
  createRestAdapter,
  pickDate,
  pickStr,
} from "./_rest";

/**
 * Skywalk message resource — HIGHEST PRIORITY.
 * Body text + metadata is what we care about most; everything else hangs
 * off the message stream (rollups, contacts inferred, properties referenced).
 *
 * Mapping is defensive: we look for the most common field names first and
 * fall back through alternatives, so a single Skywalk schema tweak doesn't
 * break ingestion. The full payload is always kept verbatim in `raw` so
 * nothing is ever lost.
 */
export function messagesAdapter() {
  const env = readSkywalkEnv();
  return createRestAdapter<Record<string, unknown>>({
    resource: "messages",
    tableName: "skywalk_messages",
    conflictColumn: "skywalk_message_id",
    path: env.paths.messages,
    byIdPath: env.paths.messageById,
    defaultPageSize: 100,
    maxPageSize: 200,
    cursorMode: "token_or_timestamp",

    recordTimestamp(rec) {
      return pickDate(rec, "occurred_at", "created_at", "sent_at", "received_at", "timestamp");
    },

    toRow(rec) {
      const id =
        pickStr(rec, "id", "message_id", "skywalk_message_id") ??
        // pathological fallback — never happens, but keeps the row insert valid
        // and surfaces the upstream record in `raw` for forensics
        cryptoLikeId(rec);

      const direction = normalizeDirection(pickStr(rec, "direction", "type"));
      const channel = normalizeChannel(pickStr(rec, "channel", "medium", "kind"));

      return {
        skywalk_message_id: id,
        skywalk_conversation_id: pickStr(rec, "conversation_id", "thread_id"),
        skywalk_contact_id: pickStr(rec, "contact_id", "lead_id", "from_contact_id"),
        skywalk_property_id: pickStr(rec, "property_id", "listing_id", "unit_id"),
        direction,
        channel,
        sender: pickStr(rec, "sender", "from", "from_address"),
        recipient: pickStr(rec, "recipient", "to", "to_address"),
        subject: pickStr(rec, "subject", "title"),
        body: pickStr(rec, "body", "text", "content", "message"),
        occurred_at:
          pickDate(rec, "occurred_at", "created_at", "sent_at", "received_at", "timestamp")
            ?.toISOString() ?? null,
        raw: rec,
      };
    },
  });
}

function normalizeDirection(d: string | null): string | null {
  if (!d) return null;
  const s = d.toLowerCase();
  if (["inbound", "incoming", "in", "received"].includes(s)) return "inbound";
  if (["outbound", "outgoing", "out", "sent"].includes(s)) return "outbound";
  if (["system", "internal", "note"].includes(s)) return "system";
  return null;
}

function normalizeChannel(c: string | null): string | null {
  if (!c) return null;
  const s = c.toLowerCase();
  if (["sms", "text"].includes(s)) return "sms";
  if (["email", "mail"].includes(s)) return "email";
  if (["voice", "call", "phone"].includes(s)) return "voice";
  if (["chat", "im", "dm"].includes(s)) return "chat";
  if (["note", "internal"].includes(s)) return "note";
  return "other";
}

function cryptoLikeId(rec: Record<string, unknown>): string {
  // Last-resort: hash a stable subset so dedupe still works for malformed records.
  const probe = JSON.stringify({
    c: rec.conversation_id,
    s: rec.sender,
    r: rec.recipient,
    t: rec.created_at ?? rec.timestamp,
    b: typeof rec.body === "string" ? rec.body.slice(0, 64) : null,
  });
  let h = 0;
  for (let i = 0; i < probe.length; i++) h = (h * 31 + probe.charCodeAt(i)) | 0;
  return `synthetic:${(h >>> 0).toString(16)}`;
}
