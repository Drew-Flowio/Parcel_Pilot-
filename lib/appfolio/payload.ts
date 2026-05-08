/**
 * AppFolio payload mappers.
 *
 * The downstream "AppFolio" endpoint may be:
 *   - real AppFolio REST (partner API),
 *   - a Zapier/Make webhook,
 *   - a custom integration shim.
 *
 * We send a stable, source-agnostic JSON envelope with:
 *   - `external_id`  — deterministic, lets the receiving side dedupe.
 *   - `subject`      — short, human-readable.
 *   - `body`         — concatenated message thread for that day.
 *   - `tags`         — derived from action keywords + status.
 *   - `metadata`     — full structured context (key points, actions, etc).
 *
 * The receiving side maps this envelope onto AppFolio's actual schema
 * (Note / CRM Activity / Task / etc) however it likes.
 *
 * Push semantics (re-pushes vs new pushes) are handled in `client.ts`:
 *   - `appfolio_note_id` IS NULL  → POST  (create new note)
 *   - `appfolio_note_id` not null → PATCH (update existing note)
 */

import type {
  ThreadDayRollupRow,
  OwnerPushRow,
  ParticipantInfo,
  KeyPointEntry,
  ActionEntry,
} from "./types";
import { tagsForParcel, type LinkedParcelIntel } from "./enrichment";

// Re-export so callers can `import { ParticipantInfo } from "@/lib/appfolio/payload"`
// without breaking.
export type { ParticipantInfo, KeyPointEntry, ActionEntry } from "./types";
export type { LinkedParcelIntel } from "./enrichment";

/**
 * Stable envelope shipped to AppFolio for a (conversation, day) rollup.
 *
 * `external_id` is what AppFolio uses to dedupe / upsert on its side. It's
 * generated from the immutable identity of the rollup, not the row's UUID,
 * so re-creating the rollup row never breaks the AppFolio linkage.
 */
export interface AppFolioNotePayload {
  external_id: string;
  subject: string;
  body: string;
  occurred_at: string | null;
  tags: string[];
  contact_external_id: string | null;
  property_external_id: string | null;
  participants: ParticipantInfo[];
  metadata: {
    source: "skywalk-thread-day-rollup";
    skywalk_conversation_id: string;
    rollup_date: string;
    rollup_tz: string;
    summary: string | null;
    key_points: KeyPointEntry[];
    actions: ActionEntry[];
    status: string | null;
    message_count: number;
    inbound_count: number;
    outbound_count: number;
    summary_version: number;
    summarized_by: string | null;
    summarized_at: string | null;
    /**
     * Linked Hennepin parcel — populated when the Skywalk property/contact
     * resolves to a known parcel. `null` when no link exists. Receivers
     * should not assume presence; use it only to enrich routing, never to
     * gate the message itself.
     */
    parcel: LinkedParcelIntel | null;
  };
}

/**
 * One-off owner push payload — sent ONLY by the explicit
 * /api/appfolio/push/owner endpoint, never by the cron worker.
 */
export interface AppFolioOwnerPayload {
  external_id: string;
  display_name: string | null;
  property_address: string | null;
  mailing_address: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  metadata: {
    source: "parcel-pilot-owner";
    contact_status: string | null;
    market_value: number | null;
    unit_count: number | null;
    desirability_score: number | null;
    score_v2?: number | null;
    sos_agent_name?: string | null;
    sos_agent_address?: string | null;
  };
}

/**
 * Build the AppFolio payload for a single thread-day rollup.
 *
 * `external_id` is `skywalk:{conversation}:{YYYY-MM-DD}` — deterministic,
 * URL-safe, and stable across rollup rebuilds. AppFolio (or the webhook
 * shim) should treat this as the dedupe key.
 *
 * If `linkedParcel` is supplied, parcel intelligence (score_v2, owner,
 * vacancy, etc.) is folded into both the tag set and `metadata.parcel`,
 * letting the receiver lane based on Hennepin lead quality.
 */
export function rollupToAppFolioPayload(
  rollup: ThreadDayRollupRow,
  linkedParcel: LinkedParcelIntel | null = null
): AppFolioNotePayload {
  const tags = buildTags(rollup, linkedParcel);
  const subject = buildSubject(rollup);
  const body = rollup.body_concat ?? rollup.summary_text ?? "";

  return {
    external_id: `skywalk:${rollup.skywalk_conversation_id}:${rollup.rollup_date}`,
    subject,
    body,
    occurred_at: rollup.last_message_at,
    tags,
    contact_external_id: rollup.skywalk_contact_id,
    property_external_id: rollup.skywalk_property_id,
    participants: rollup.participants ?? [],
    metadata: {
      source: "skywalk-thread-day-rollup",
      skywalk_conversation_id: rollup.skywalk_conversation_id,
      rollup_date: rollup.rollup_date,
      rollup_tz: rollup.rollup_tz,
      summary: rollup.summary_text,
      key_points: rollup.key_points ?? [],
      actions: rollup.actions ?? [],
      status: rollup.status,
      message_count: rollup.message_count,
      inbound_count: rollup.inbound_count,
      outbound_count: rollup.outbound_count,
      summary_version: rollup.summary_version,
      summarized_by: rollup.summarized_by,
      summarized_at: rollup.summarized_at,
      parcel: linkedParcel,
    },
  };
}

/**
 * Tag set from rollup status + action keywords + linked parcel intel.
 * Receiving side can filter "skywalk + needs_response + parcel:score:high"
 * lanes downstream without re-parsing the body.
 */
function buildTags(
  rollup: ThreadDayRollupRow,
  parcel: LinkedParcelIntel | null
): string[] {
  const set = new Set<string>(["skywalk"]);
  if (rollup.status) set.add(rollup.status);
  for (const a of rollup.actions ?? []) {
    for (const kw of a.keywords ?? []) {
      if (kw) set.add(kw);
    }
  }
  for (const ch of rollup.channels ?? []) {
    if (ch) set.add(`channel:${ch}`);
  }
  for (const t of tagsForParcel(parcel)) set.add(t);
  return [...set].slice(0, 32);
}

/** Short, human-readable subject — leans on the SQL-built summary text. */
function buildSubject(rollup: ThreadDayRollupRow): string {
  const status = rollup.status ?? "active";
  const summary = rollup.summary_text ?? `Conversation update on ${rollup.rollup_date}`;
  return `[${status}] ${summary}`.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Owner / parcel records (manual on-demand only)
// ---------------------------------------------------------------------------

/** Build an owner-record payload for explicit one-off pushes. */
export function ownerToAppFolioPayload(
  owner: OwnerPushRow
): AppFolioOwnerPayload {
  return {
    external_id: `parcel:${owner.id}`,
    display_name: owner.owner_name,
    property_address: owner.property_address,
    mailing_address: owner.mailing_address,
    phone: owner.owner_phone,
    email: owner.owner_email,
    notes: owner.contact_notes,
    metadata: {
      source: "parcel-pilot-owner",
      contact_status: owner.contact_status,
      market_value: owner.market_value,
      unit_count: owner.unit_count,
      desirability_score: owner.desirability_score,
      score_v2: owner.score_v2 ?? null,
      sos_agent_name: owner.sos_agent_name ?? null,
      sos_agent_address: owner.sos_agent_address ?? null,
    },
  };
}
