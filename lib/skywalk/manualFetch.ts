import { getSupabaseServer } from "@/lib/supabaseClient";
import { getAdapter, isSkywalkResource } from "./resources";
import { FatalSkywalkError, RateLimitError } from "./types";

/**
 * Drain up to `batchSize` items from `manual_fetch_queue` whose status is
 * `pending`. Each row is claimed atomically (UPDATE … RETURNING) so multiple
 * workers can run in parallel without re-processing the same row.
 *
 * Per-resource rules:
 *   - `message` / `contact` / `property` → call the matching adapter's
 *     `fetchOne(id)`, upsert the resulting row into the matching table,
 *     mark the queue row `done`.
 *   - `conversation` → no `fetchOne` (Skywalk doesn't ship conversation
 *     metadata directly in this schema). We mark it `failed` with an
 *     informative error so the operator can re-route.
 *
 * Errors:
 *   - `RateLimitError`  → re-queue the row (`pending`, attempt_count++)
 *                         and stop draining. The next tick resumes.
 *   - `FatalSkywalkError` (4xx) → `failed`, attempt_count++.
 *   - other errors      → if attempt_count < `maxAttempts`, re-queue;
 *                         else `failed`.
 */
export interface ManualFetchOptions {
  batchSize?: number;
  maxAttempts?: number;
  workerId?: string;
}

export interface ManualFetchResult {
  claimed: number;
  done: number;
  failed: number;
  requeued: number;
  rateLimited: boolean;
  durationMs: number;
}

const RESOURCE_TO_ADAPTER = {
  message: "messages",
  contact: "contacts",
  property: "properties",
} as const;

const RESOURCE_TO_TABLE = {
  message: "skywalk_messages",
  contact: "skywalk_contacts",
  property: "skywalk_properties",
} as const;

const RESOURCE_TO_CONFLICT = {
  message: "skywalk_message_id",
  contact: "skywalk_contact_id",
  property: "skywalk_property_id",
} as const;

type QueueResourceType = keyof typeof RESOURCE_TO_ADAPTER | "conversation";

interface QueueRow {
  id: string;
  resource_type: QueueResourceType;
  skywalk_resource_id: string;
  attempt_count: number;
}

export async function processManualFetchQueue(
  options: ManualFetchOptions = {}
): Promise<ManualFetchResult> {
  const supabase = getSupabaseServer();
  const batchSize = options.batchSize ?? 25;
  const maxAttempts = options.maxAttempts ?? 5;
  const workerId =
    options.workerId ?? `worker-${Math.random().toString(36).slice(2, 10)}`;

  const startedAt = Date.now();
  const result: ManualFetchResult = {
    claimed: 0,
    done: 0,
    failed: 0,
    requeued: 0,
    rateLimited: false,
    durationMs: 0,
  };

  // Atomically claim a batch of pending rows by flipping them to `in_progress`.
  // The partial unique index `manual_fetch_queue_in_flight_uniq` guarantees no
  // duplicate enqueues survive while a row is in flight, so the "select N
  // pending, mark them in_progress" pattern is race-safe across workers
  // because each row's status is mutated by exactly one UPDATE.
  const { data: pending, error: pickErr } = await supabase
    .from("manual_fetch_queue")
    .select("id, resource_type, skywalk_resource_id, attempt_count")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(batchSize);
  if (pickErr) throw pickErr;
  if (!pending || pending.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const ids = pending.map((p) => p.id);
  const { data: claimed, error: claimErr } = await supabase
    .from("manual_fetch_queue")
    .update({
      status: "in_progress",
      claimed_at: new Date().toISOString(),
      claimed_by: workerId,
    })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, resource_type, skywalk_resource_id, attempt_count");
  if (claimErr) throw claimErr;

  result.claimed = claimed?.length ?? 0;

  for (const row of (claimed ?? []) as QueueRow[]) {
    if (result.rateLimited) {
      // Keep remaining claimed rows reserved-for-retry by reverting them to pending.
      await releaseToPending(supabase, row, "Rate limited - will retry");
      result.requeued += 1;
      continue;
    }

    if (row.resource_type === "conversation") {
      await markFailed(
        supabase,
        row,
        "Conversations are computed locally via skywalk_rollup_conversations(); no upstream fetch supported."
      );
      result.failed += 1;
      continue;
    }

    const adapterName = RESOURCE_TO_ADAPTER[row.resource_type];
    if (!isSkywalkResource(adapterName)) {
      await markFailed(supabase, row, `Unknown resource_type: ${row.resource_type}`);
      result.failed += 1;
      continue;
    }

    try {
      const adapter = getAdapter(adapterName);
      const record = await adapter.fetchOne(row.skywalk_resource_id);
      if (!record) {
        await markFailed(supabase, row, "Skywalk returned no record for this id");
        result.failed += 1;
        continue;
      }

      const dbRow = adapter.toRow(record);
      const conflictCol = RESOURCE_TO_CONFLICT[row.resource_type];
      const tableName = RESOURCE_TO_TABLE[row.resource_type];

      const { error: upErr } = await supabase
        .from(tableName)
        .upsert(dbRow, { onConflict: conflictCol, ignoreDuplicates: false });
      if (upErr) throw upErr;

      await markDone(supabase, row, { fetched: true });
      result.done += 1;
    } catch (err) {
      if (err instanceof RateLimitError) {
        result.rateLimited = true;
        await releaseToPending(supabase, row, `429 (retry-after ${err.retryAfterMs}ms)`);
        result.requeued += 1;
        continue;
      }
      if (err instanceof FatalSkywalkError) {
        await markFailed(supabase, row, err.message.slice(0, 1000));
        result.failed += 1;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempt = (row.attempt_count ?? 0) + 1;
      if (nextAttempt < maxAttempts) {
        await releaseToPending(supabase, row, msg.slice(0, 1000));
        result.requeued += 1;
      } else {
        await markFailed(supabase, row, msg.slice(0, 1000));
        result.failed += 1;
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

// ----------------------------------------------------------------------------
// Queue row mutations
// ----------------------------------------------------------------------------

async function markDone(
  client: ReturnType<typeof getSupabaseServer>,
  row: QueueRow,
  result: Record<string, unknown>
) {
  await client
    .from("manual_fetch_queue")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      result,
      error: null,
      attempt_count: (row.attempt_count ?? 0) + 1,
    })
    .eq("id", row.id);
}

async function markFailed(
  client: ReturnType<typeof getSupabaseServer>,
  row: QueueRow,
  errorMessage: string
) {
  await client
    .from("manual_fetch_queue")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: errorMessage,
      attempt_count: (row.attempt_count ?? 0) + 1,
    })
    .eq("id", row.id);
}

async function releaseToPending(
  client: ReturnType<typeof getSupabaseServer>,
  row: QueueRow,
  errorMessage: string
) {
  await client
    .from("manual_fetch_queue")
    .update({
      status: "pending",
      claimed_at: null,
      claimed_by: null,
      error: errorMessage,
      attempt_count: (row.attempt_count ?? 0) + 1,
    })
    .eq("id", row.id);
}
