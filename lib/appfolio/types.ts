/**
 * AppFolio outbound-push types.
 *
 * Mirrors `lib/skywalk/types.ts` style — engine + policy + adapter contract +
 * custom error classes — but for *outbound* writes to AppFolio, not inbound
 * fetches from Skywalk.
 */

// Embedded JSON shapes inside the rollup row. (Defined here, not in
// payload.ts, to avoid a circular type import.)
export interface ParticipantInfo {
  sender?: string | null;
  recipient?: string | null;
  channel?: string | null;
  direction?: string | null;
}

export interface KeyPointEntry {
  text: string;
  occurred_at: string;
  direction: string | null;
  channel: string | null;
}

export interface ActionEntry {
  text: string;
  occurred_at: string;
  direction: string | null;
  keywords: string[];
}

/** Fields the worker reads from public.skywalk_thread_day_rollups. */
export interface ThreadDayRollupRow {
  id: string;
  skywalk_conversation_id: string;
  rollup_date: string;
  rollup_tz: string;

  skywalk_contact_id: string | null;
  skywalk_property_id: string | null;

  message_count: number;
  inbound_count: number;
  outbound_count: number;

  first_message_at: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;

  participants: ParticipantInfo[];
  channels: string[] | null;
  body_concat: string | null;

  summary_text: string | null;
  key_points: KeyPointEntry[];
  actions: ActionEntry[];
  status:
    | "needs_response"
    | "awaiting_them"
    | "active"
    | "dormant"
    | "resolved"
    | null;

  summary_version: number;
  summarized_at: string | null;
  summarized_by: string | null;

  synced_to_appfolio_at: string | null;
  appfolio_note_id: string | null;
  last_push_reason: string | null;

  inserted_at: string;
  updated_at: string;
}

/** Parcel-pilot owner record we expose for one-off manual pushes. */
export interface OwnerPushRow {
  id: string;
  owner_name: string | null;
  property_address: string | null;
  mailing_address: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  contact_status: string | null;
  contact_notes: string | null;
  market_value: number | null;
  unit_count: number | null;
  desirability_score: number | null;
  score_v2?: number | null;
  sos_agent_name?: string | null;
  sos_agent_address?: string | null;
}

/** Single decision the policy can make about a rollup. */
export type PushDecisionKind = "push" | "skip" | "queue";

export interface PushDecision {
  kind: PushDecisionKind;
  /** Short, machine-friendly reason ("low-signal-single-message"). */
  reason: string;
  /** For `kind === "queue"`, hint about how long to wait before re-eval. */
  delayMs?: number;
}

export interface PushPolicyOptions {
  /** Minutes a day must be settled before we push. Default 10. */
  minSettleMinutes?: number;
  /** Single-message rollups must be action-worthy. Default 2. */
  minMessages?: number;
  /** Bypass policy entirely (manual push endpoint). */
  force?: boolean;
  /** Override "now" for testing. */
  now?: Date;
}

export interface PushRunOptions {
  /** Wall-clock budget for the run (ms). Default 30_000. */
  maxWallMs?: number;
  /** Hard cap on rollups evaluated this tick. Default 50. */
  batchSize?: number;
  /** If true, ignore policy.minSettleMinutes etc. (used by /push/manual?force=1). */
  force?: boolean;
  /** Filter to one rollup id (used by /push/manual). */
  rollupId?: string;
  /** Pass-through to policy. */
  policy?: PushPolicyOptions;
}

export interface PushRunResult {
  /** Number of rollups we considered this tick. */
  claimed: number;
  pushed: number;
  skipped: number;
  queued: number;
  failed: number;
  durationMs: number;
  /** True if AppFolio rate-limited us — caller should back off. */
  rateLimited: boolean;
  /** Per-row trace for debugging / dashboards. */
  decisions: Array<{
    id: string;
    skywalk_conversation_id: string;
    rollup_date: string;
    kind: PushDecisionKind | "fail";
    reason: string;
    appfolio_note_id?: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** AppFolio responded with 429 — engine should checkpoint and back off. */
export class AppFolioRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number, message = "AppFolio rate limited") {
    super(message);
    this.name = "AppFolioRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** AppFolio responded with a non-retryable 4xx. */
export class FatalAppFolioError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FatalAppFolioError";
    this.status = status;
  }
}
