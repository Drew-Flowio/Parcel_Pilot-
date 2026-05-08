/**
 * AppFolio push engine.
 *
 * One tick:
 *   1. Claim a batch of unsynced rollups (oldest last_message_at first).
 *   2. For each, run `decidePush` → push / skip / queue.
 *   3. Push: POST or PATCH the AppFolio note, update the rollup's
 *      `synced_to_appfolio_at`, `appfolio_note_id`, `last_push_reason`.
 *   4. Skip: close the row out (`synced_to_appfolio_at = now()`,
 *      `last_push_reason = 'skip:<reason>'`) so we don't re-evaluate
 *      until content changes (rollup function clears `synced_to_appfolio_at`).
 *   5. Queue: leave `synced_to_appfolio_at = NULL`, just stamp
 *      `last_push_reason = 'queue:<reason>'`. Next tick re-evaluates.
 *   6. Rate limit / network error: same as queue, but `last_push_reason =
 *      'retry:<reason>'`. Wall-clock budget aborts the rest of the batch.
 *
 * Every step appends a row to `appfolio_push_log` (audit trail).
 *
 * Owner records and other static data are NEVER touched here. Use
 * `pushOwnerNow()` for explicit one-off pushes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseClient";

import { AppFolioClient } from "./client";
import { readAppFolioEnv } from "./env";
import { decidePush } from "./policy";
import { resolveLinkedParcel } from "./enrichment";
import {
  rollupToAppFolioPayload,
  ownerToAppFolioPayload,
  type AppFolioNotePayload,
} from "./payload";
import {
  AppFolioRateLimitError,
  FatalAppFolioError,
  type ThreadDayRollupRow,
  type OwnerPushRow,
  type PushDecision,
  type PushPolicyOptions,
  type PushRunOptions,
  type PushRunResult,
} from "./types";

// ---------------------------------------------------------------------------

const RESOURCE = "thread_day_rollup";

/**
 * Run one batch of the push worker.
 *
 * Safe to call from a cron / Vercel scheduler / ops trigger. Multiple
 * concurrent ticks are tolerated — each one independently selects rollups
 * with `synced_to_appfolio_at IS NULL`. Worst case is two workers both
 * notice the same row and one of them no-ops because the audit row already
 * shows it was just pushed; we accept that very rare double-write because
 * the AppFolio side is dedupe-keyed by `external_id`.
 */
export async function runAppFolioPush(
  options: PushRunOptions = {}
): Promise<PushRunResult> {
  const startedAt = Date.now();
  const supabase = getSupabaseServer();
  const batchSize = options.batchSize ?? 50;
  const maxWallMs = options.maxWallMs ?? 30_000;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), maxWallMs);

  const result: PushRunResult = {
    claimed: 0,
    pushed: 0,
    skipped: 0,
    queued: 0,
    failed: 0,
    durationMs: 0,
    rateLimited: false,
    decisions: [],
  };

  try {
    const rollups = await claimBatch(supabase, batchSize, options.rollupId);
    result.claimed = rollups.length;
    if (rollups.length === 0) {
      result.durationMs = Date.now() - startedAt;
      return result;
    }

    // Lazy-construct the client so /push/manual?force=1 works even if a few
    // pure-skip rollups are evaluated first.
    let client: AppFolioClient | null = null;
    let dryRun = false;
    const ensureClient = () => {
      if (!client) {
        const env = readAppFolioEnv();
        dryRun = env.dryRun;
        client = new AppFolioClient({ signal: ac.signal });
      }
      return client;
    };

    for (const rollup of rollups) {
      if (ac.signal.aborted || result.rateLimited) break;

      const decision = decidePush(rollup, options.policy ?? { force: !!options.force });

      if (decision.kind === "skip") {
        await markSkipped(supabase, rollup, decision.reason);
        result.skipped += 1;
        result.decisions.push({
          id: rollup.id,
          skywalk_conversation_id: rollup.skywalk_conversation_id,
          rollup_date: rollup.rollup_date,
          kind: "skip",
          reason: decision.reason,
        });
        continue;
      }

      if (decision.kind === "queue") {
        await markQueued(supabase, rollup, decision.reason);
        result.queued += 1;
        result.decisions.push({
          id: rollup.id,
          skywalk_conversation_id: rollup.skywalk_conversation_id,
          rollup_date: rollup.rollup_date,
          kind: "queue",
          reason: decision.reason,
        });
        continue;
      }

      // decision.kind === "push"
      try {
        // Best-effort parcel enrichment — never blocks the push.
        let linkedParcel = null;
        try {
          linkedParcel = await resolveLinkedParcel({
            skywalkPropertyId: rollup.skywalk_property_id,
            skywalkContactId: rollup.skywalk_contact_id,
          });
        } catch {
          linkedParcel = null;
        }
        const payload = rollupToAppFolioPayload(rollup, linkedParcel);

        // Honor APPFOLIO_DRY_RUN (preview deploys, smoke tests).
        const c = ensureClient();
        if (dryRun) {
          await markSkipped(supabase, rollup, "dry-run", payload);
          result.skipped += 1;
          result.decisions.push({
            id: rollup.id,
            skywalk_conversation_id: rollup.skywalk_conversation_id,
            rollup_date: rollup.rollup_date,
            kind: "skip",
            reason: "dry-run",
          });
          continue;
        }

        const r = await c.upsertNote(payload, rollup.appfolio_note_id);
        await markPushed(supabase, rollup, r.externalId, r.httpStatus, payload);
        result.pushed += 1;
        result.decisions.push({
          id: rollup.id,
          skywalk_conversation_id: rollup.skywalk_conversation_id,
          rollup_date: rollup.rollup_date,
          kind: "push",
          reason: "action-worthy",
          appfolio_note_id: r.externalId,
        });
      } catch (err) {
        if (err instanceof AppFolioRateLimitError) {
          result.rateLimited = true;
          await markPendingRetry(supabase, rollup, `rate-limit:${err.retryAfterMs}ms`);
          // Stop processing the rest — the cron will pick up next tick.
          break;
        }
        if (err instanceof FatalAppFolioError) {
          await markFailed(supabase, rollup, err.message, err.status ?? null);
          result.failed += 1;
          result.decisions.push({
            id: rollup.id,
            skywalk_conversation_id: rollup.skywalk_conversation_id,
            rollup_date: rollup.rollup_date,
            kind: "fail",
            reason: err.message,
          });
          continue;
        }
        // Network / 5xx exhausted → soft retry.
        const msg = err instanceof Error ? err.message : String(err);
        await markPendingRetry(supabase, rollup, msg);
        result.failed += 1;
        result.decisions.push({
          id: rollup.id,
          skywalk_conversation_id: rollup.skywalk_conversation_id,
          rollup_date: rollup.rollup_date,
          kind: "fail",
          reason: msg,
        });
      }
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// One-off owner push (manual on-demand only — never called from cron)
// ---------------------------------------------------------------------------

export interface OwnerPushOutcome {
  parcelId: string;
  pushed: boolean;
  appfolio_owner_id: string | null;
  http_status: number;
  error?: string;
}

export async function pushOwnerNow(parcelId: string): Promise<OwnerPushOutcome> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("parcels_intel")
    .select(
      "id, owner_name, property_address, mailing_address, owner_phone, owner_email, contact_status, contact_notes, market_value, unit_count, desirability_score, score_v2, sos_agent_name, sos_agent_address"
    )
    .eq("id", parcelId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      parcelId,
      pushed: false,
      appfolio_owner_id: null,
      http_status: 0,
      error: "parcel-not-found",
    };
  }

  const owner = data as OwnerPushRow;
  const env = readAppFolioEnv();
  const payload = ownerToAppFolioPayload(owner);

  // Most recent successful push (so we PATCH the same record).
  const { data: prior } = await supabase
    .from("appfolio_push_log")
    .select("appfolio_resource_id")
    .eq("resource_type", "lead")
    .eq("skywalk_resource_id", parcelId)
    .eq("status", "success")
    .order("attempted_at", { ascending: false })
    .limit(1);
  const existingId = prior?.[0]?.appfolio_resource_id ?? null;

  if (env.dryRun) {
    await supabase.from("appfolio_push_log").insert({
      resource_type: "lead",
      skywalk_resource_id: parcelId,
      request_payload: payload as unknown as Record<string, unknown>,
      status: "skipped",
      error_message: "dry-run",
    });
    return {
      parcelId,
      pushed: false,
      appfolio_owner_id: existingId,
      http_status: 0,
      error: "dry-run",
    };
  }

  const client = new AppFolioClient();
  try {
    const r = await client.upsertOwner(payload, existingId);
    await supabase.from("appfolio_push_log").insert({
      resource_type: "lead",
      skywalk_resource_id: parcelId,
      appfolio_resource_id: r.externalId,
      request_payload: payload as unknown as Record<string, unknown>,
      response_payload: (r.data ?? null) as Record<string, unknown> | null,
      status: "success",
      http_status: r.httpStatus,
      succeeded_at: new Date().toISOString(),
    });
    return {
      parcelId,
      pushed: true,
      appfolio_owner_id: r.externalId,
      http_status: r.httpStatus,
    };
  } catch (err) {
    const status = err instanceof FatalAppFolioError ? err.status ?? null : null;
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("appfolio_push_log").insert({
      resource_type: "lead",
      skywalk_resource_id: parcelId,
      request_payload: payload as unknown as Record<string, unknown>,
      status: err instanceof FatalAppFolioError ? "failure" : "retrying",
      http_status: status,
      error_message: msg,
    });
    return {
      parcelId,
      pushed: false,
      appfolio_owner_id: existingId,
      http_status: status ?? 0,
      error: msg,
    };
  }
}

// ---------------------------------------------------------------------------
// Internals — batch claim + audit log writes
// ---------------------------------------------------------------------------

async function claimBatch(
  supabase: SupabaseClient,
  batchSize: number,
  rollupId?: string
): Promise<ThreadDayRollupRow[]> {
  if (rollupId) {
    const { data, error } = await supabase
      .from("skywalk_thread_day_rollups")
      .select("*")
      .eq("id", rollupId);
    if (error) throw error;
    return (data ?? []) as ThreadDayRollupRow[];
  }

  // Priority order:
  //   1. needs_response   — operator-facing, push these first
  //   2. active           — engaged conversations
  //   3. awaiting_them    — we've replied, waiting on them (low urgency)
  //   4. dormant/resolved — last (and policy may skip them entirely)
  // Within each tier, sort by last_message_at DESC so freshest moves first.
  // We split the work into two batched queries and merge — keeps the SQL
  // dialect-agnostic and lets us preserve PostgREST-friendly filters.
  const halfBatch = Math.max(1, Math.floor(batchSize / 2));

  const urgent = await supabase
    .from("skywalk_thread_day_rollups")
    .select("*")
    .is("synced_to_appfolio_at", null)
    .in("status", ["needs_response", "active"])
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (urgent.error) throw urgent.error;
  const urgentRows = (urgent.data ?? []) as ThreadDayRollupRow[];
  if (urgentRows.length >= batchSize) return urgentRows;

  const remaining = batchSize - urgentRows.length;
  const others = await supabase
    .from("skywalk_thread_day_rollups")
    .select("*")
    .is("synced_to_appfolio_at", null)
    .or(
      "status.is.null,status.eq.awaiting_them,status.eq.dormant,status.eq.resolved"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(remaining, halfBatch));

  if (others.error) throw others.error;
  const otherRows = (others.data ?? []) as ThreadDayRollupRow[];

  return [...urgentRows, ...otherRows].slice(0, batchSize);
}

async function markPushed(
  supabase: SupabaseClient,
  rollup: ThreadDayRollupRow,
  appfolioNoteId: string | null,
  httpStatus: number,
  payload: AppFolioNotePayload
): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from("appfolio_push_log").insert({
    resource_type: RESOURCE,
    skywalk_resource_id: rollup.id,
    appfolio_resource_id: appfolioNoteId,
    request_payload: payload as unknown as Record<string, unknown>,
    status: "success",
    http_status: httpStatus,
    succeeded_at: now,
  });
  await supabase
    .from("skywalk_thread_day_rollups")
    .update({
      synced_to_appfolio_at: now,
      appfolio_note_id: appfolioNoteId ?? rollup.appfolio_note_id ?? null,
      last_push_reason: "pushed",
    })
    .eq("id", rollup.id);
}

async function markSkipped(
  supabase: SupabaseClient,
  rollup: ThreadDayRollupRow,
  reason: string,
  payload?: AppFolioNotePayload
): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from("appfolio_push_log").insert({
    resource_type: RESOURCE,
    skywalk_resource_id: rollup.id,
    request_payload: payload ? (payload as unknown as Record<string, unknown>) : null,
    status: "skipped",
    error_message: reason,
  });
  // Closing the row out — re-evaluation only when content changes.
  await supabase
    .from("skywalk_thread_day_rollups")
    .update({
      synced_to_appfolio_at: now,
      last_push_reason: `skip:${reason}`,
    })
    .eq("id", rollup.id);
}

async function markQueued(
  supabase: SupabaseClient,
  rollup: ThreadDayRollupRow,
  reason: string
): Promise<void> {
  await supabase.from("appfolio_push_log").insert({
    resource_type: RESOURCE,
    skywalk_resource_id: rollup.id,
    status: "pending",
    error_message: reason,
  });
  // Leave synced_to_appfolio_at NULL so next tick re-evaluates.
  await supabase
    .from("skywalk_thread_day_rollups")
    .update({ last_push_reason: `queue:${reason}` })
    .eq("id", rollup.id);
}

async function markPendingRetry(
  supabase: SupabaseClient,
  rollup: ThreadDayRollupRow,
  reason: string
): Promise<void> {
  await supabase.from("appfolio_push_log").insert({
    resource_type: RESOURCE,
    skywalk_resource_id: rollup.id,
    status: "retrying",
    error_message: reason,
  });
  await supabase
    .from("skywalk_thread_day_rollups")
    .update({ last_push_reason: `retry:${truncateReason(reason)}` })
    .eq("id", rollup.id);
}

async function markFailed(
  supabase: SupabaseClient,
  rollup: ThreadDayRollupRow,
  reason: string,
  httpStatus: number | null
): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from("appfolio_push_log").insert({
    resource_type: RESOURCE,
    skywalk_resource_id: rollup.id,
    status: "failure",
    http_status: httpStatus,
    error_message: reason,
  });
  // Close the row — operator must edit / replay if needed.
  await supabase
    .from("skywalk_thread_day_rollups")
    .update({
      synced_to_appfolio_at: now,
      last_push_reason: `failed:${truncateReason(reason)}`,
    })
    .eq("id", rollup.id);
}

function truncateReason(s: string): string {
  return s.length <= 200 ? s : s.slice(0, 200) + "…";
}

// Re-export so callers can import from `@/lib/appfolio/push`.
export { decidePush } from "./policy";
export type { PushDecision };
