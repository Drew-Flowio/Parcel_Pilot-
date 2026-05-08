import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { claimCursor, commitCursor, failCursor, resetCursor } from "./cursors";
import { getAdapter } from "./resources";
import {
  FatalSkywalkError,
  IngestRunOptions,
  IngestRunResult,
  RateLimitError,
  type ResourceAdapter,
  type SkywalkResource,
} from "./types";

/**
 * Run a single ingestion tick for `resource`.
 *
 * Guarantees:
 *   1. **Cursor never advances unless its page write succeeded.** If the
 *      Supabase upsert fails or the run dies, the cursor stays at the prior
 *      checkpoint and the next tick re-fetches the same page (idempotent
 *      because of `ON CONFLICT (skywalk_*_id) DO UPDATE`).
 *   2. **Single writer per (source, resource).** A `running` cursor whose
 *      lease (5 min) hasn't expired blocks new claims; stale leases are
 *      stolen automatically (so a crashed worker doesn't deadlock the
 *      pipeline forever).
 *   3. **Quota-aware.** A 429 with `Retry-After` either sleeps in-flight
 *      (if the budget allows) or stops the run cleanly with the cursor
 *      checkpointed. The next tick resumes exactly where we stopped.
 *   4. **No full pulls unless `resetCursor: true` is set explicitly** (see
 *      `runFullIngest` and the dedicated `/api/skywalk/sync/full/[resource]`
 *      route — neither fires from the standard cron path).
 */
export async function runIngest(
  resource: SkywalkResource,
  options: IngestRunOptions = {}
): Promise<IngestRunResult> {
  const supabase = getSupabaseServer();

  const maxWallMs = options.maxWallMs ?? 30_000;
  const maxRequests = options.maxRequests ?? 200;
  const maxRecords = options.maxRecords ?? 5_000;

  const startedAt = Date.now();
  const ac = new AbortController();
  const wallClock = setTimeout(() => ac.abort(), maxWallMs);

  let claimed: Awaited<ReturnType<typeof claimCursor>> = null;

  try {
    if (options.resetCursor) {
      await resetCursor(supabase, resource);
    }

    claimed = await claimCursor(supabase, resource, { force: options.resetCursor });
    if (!claimed) {
      return baseResult(resource, startedAt, {
        status: "skipped",
        leaseHeld: true,
      });
    }

    const adapter = getAdapter(resource);
    const pageSize = clamp(
      options.pageSize ?? adapter.defaultPageSize,
      1,
      adapter.maxPageSize
    );

    let cursor: string | null =
      options.startCursor !== undefined
        ? options.startCursor
        : (claimed.cursor_token ?? null);
    let since: Date | null =
      options.startSince ??
      (claimed.cursor_timestamp ? new Date(claimed.cursor_timestamp) : null);

    let pages = 0;
    let recordsIngested = 0;
    let lastWatermark: Date | null = null;
    let rateLimited = false;
    let budgetExhausted = false;
    let requestsUsed = 0;

    while (!ac.signal.aborted) {
      if (requestsUsed >= maxRequests) {
        budgetExhausted = true;
        break;
      }
      if (recordsIngested >= maxRecords) {
        budgetExhausted = true;
        break;
      }

      requestsUsed += 1;
      let page;
      try {
        page = await adapter.fetchPage({
          cursor,
          since,
          limit: pageSize,
          signal: ac.signal,
        });
      } catch (err) {
        if (err instanceof RateLimitError) {
          // Persist what we have so far and stop cleanly.
          rateLimited = true;
          break;
        }
        if (err instanceof FatalSkywalkError) {
          await failCursor(supabase, resource, err.message);
          throw err;
        }
        // Network / other — let it bubble so the catch below records the failure.
        throw err;
      }

      pages += 1;

      if (page.records.length > 0) {
        const rows = page.records.map((r) => adapter.toRow(r));
        await upsertRows(supabase, adapter, rows);
        recordsIngested += rows.length;

        if (page.watermark && (!lastWatermark || page.watermark > lastWatermark)) {
          lastWatermark = page.watermark;
        }
      }

      // ---- Advance cursor ONLY after a successful write ----
      cursor = page.nextCursor;

      // Pre-emptive backoff: if the API tells us we're nearly out of budget, stop.
      const rl = page.rateLimit;
      if (rl?.remaining != null && rl.remaining <= 1) {
        rateLimited = true;
        break;
      }

      if (!page.hasMore || !cursor) break;
    }

    // Persist final cursor state. Records-seen is incremented (single-writer).
    await commitCursor(supabase, resource, {
      cursor_token: cursor,
      cursor_timestamp: lastWatermark ?? since,
      records_seen: recordsIngested,
      status: rateLimited || budgetExhausted ? "skipped" : "success",
    });

    return baseResult(resource, startedAt, {
      status: rateLimited || budgetExhausted ? "partial" : "success",
      pages,
      recordsIngested,
      finalCursor: cursor,
      finalWatermark: lastWatermark?.toISOString() ?? null,
      rateLimited,
      budgetExhausted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (claimed) {
      await failCursor(supabase, resource, msg);
    }
    return baseResult(resource, startedAt, {
      status: "error",
      error: msg,
    });
  } finally {
    clearTimeout(wallClock);
  }
}

/**
 * Explicitly reset the cursor and re-pull the entire resource. **Only** call
 * this from the dedicated `/api/skywalk/sync/full/[resource]` endpoint — never
 * from the regular cron path.
 */
export async function runFullIngest(
  resource: SkywalkResource,
  options: Omit<IngestRunOptions, "resetCursor"> = {}
): Promise<IngestRunResult> {
  return runIngest(resource, {
    ...options,
    resetCursor: true,
    // Full pulls are usually long; default budget is generous but still bounded.
    maxWallMs: options.maxWallMs ?? 60_000,
    maxRequests: options.maxRequests ?? 1_000,
    maxRecords: options.maxRecords ?? 50_000,
  });
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

async function upsertRows(
  client: SupabaseClient,
  adapter: ResourceAdapter,
  rows: ReturnType<ResourceAdapter["toRow"]>[]
): Promise<void> {
  // Defensive de-dupe within the page itself — same id can appear twice
  // if Skywalk is racing two writers, and PG would error on the same upsert
  // touching the same key twice.
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const k = String(r[adapter.conflictColumn] ?? "");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (deduped.length === 0) return;

  const { error } = await client
    .from(adapter.tableName)
    .upsert(deduped, { onConflict: adapter.conflictColumn, ignoreDuplicates: false });

  if (error) throw error;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function baseResult(
  resource: SkywalkResource,
  startedAt: number,
  patch: Partial<IngestRunResult> & { status: IngestRunResult["status"] }
): IngestRunResult {
  return {
    resource,
    status: patch.status,
    pages: patch.pages ?? 0,
    recordsIngested: patch.recordsIngested ?? 0,
    durationMs: Date.now() - startedAt,
    finalCursor: patch.finalCursor ?? null,
    finalWatermark: patch.finalWatermark ?? null,
    error: patch.error,
    rateLimited: patch.rateLimited,
    budgetExhausted: patch.budgetExhausted,
    leaseHeld: patch.leaseHeld,
  };
}
