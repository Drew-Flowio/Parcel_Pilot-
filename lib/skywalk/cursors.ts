import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkywalkCursorRow, SkywalkResource } from "./types";

/** Lease length: a `running` cursor older than this is considered stale and can be stolen. */
export const CURSOR_LEASE_MS = 5 * 60 * 1000;

/**
 * Try to claim the cursor row for `(source, resource)`.
 *
 * Atomic: a single conditional UPDATE flips status from `success`/`error`/`null`
 * to `running` (or steals the lease if `running` but stale). If the UPDATE
 * affects 0 rows, another worker holds the lease and the caller should bail.
 *
 * Returns the claimed row (already mutated to `running`) or `null` if not claimed.
 */
export async function claimCursor(
  client: SupabaseClient,
  resource: SkywalkResource,
  options: { force?: boolean; source?: string } = {}
): Promise<SkywalkCursorRow | null> {
  const source = options.source ?? "skywalk";
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CURSOR_LEASE_MS).toISOString();

  // First, ensure the row exists. Idempotent.
  await client
    .from("skywalk_sync_cursors")
    .upsert(
      { source, resource },
      { onConflict: "source,resource", ignoreDuplicates: true }
    );

  // If `force` is true, claim unconditionally (used by explicit FULL pulls).
  // Otherwise only claim when the previous run is finished or its lease has expired.
  let q = client
    .from("skywalk_sync_cursors")
    .update({
      last_run_status: "running",
      last_run_started_at: now.toISOString(),
      last_run_error: null,
    })
    .eq("source", source)
    .eq("resource", resource);

  if (!options.force) {
    q = q.or(
      `last_run_status.is.null,last_run_status.eq.success,last_run_status.eq.error,last_run_status.eq.skipped,and(last_run_status.eq.running,last_run_started_at.lt.${staleBefore})`
    );
  }

  const { data, error } = await q.select().maybeSingle();
  if (error) throw error;
  return (data as SkywalkCursorRow | null) ?? null;
}

/** Mark the cursor's run as successful and advance the cursor pointer. */
export async function commitCursor(
  client: SupabaseClient,
  resource: SkywalkResource,
  patch: {
    cursor_token?: string | null;
    cursor_timestamp?: Date | null;
    records_seen?: number;
    status?: "success" | "skipped";
    source?: string;
  }
): Promise<void> {
  const source = patch.source ?? "skywalk";
  const update: Record<string, unknown> = {
    last_run_finished_at: new Date().toISOString(),
    last_run_status: patch.status ?? "success",
    last_run_error: null,
  };
  if (patch.cursor_token !== undefined) update.cursor_token = patch.cursor_token;
  if (patch.cursor_timestamp !== undefined) {
    update.cursor_timestamp = patch.cursor_timestamp?.toISOString() ?? null;
  }
  if (patch.records_seen != null) {
    // Use raw SQL increment via .rpc would be cleaner but adds a function;
    // we read-modify-write under the lease which is single-writer.
    const { data: cur } = await client
      .from("skywalk_sync_cursors")
      .select("records_seen")
      .eq("source", source)
      .eq("resource", resource)
      .maybeSingle();
    const prior = Number((cur as { records_seen?: number } | null)?.records_seen ?? 0);
    update.records_seen = prior + patch.records_seen;
  }

  const { error } = await client
    .from("skywalk_sync_cursors")
    .update(update)
    .eq("source", source)
    .eq("resource", resource);

  if (error) throw error;
}

/** Mark the cursor's run as failed. Cursor pointer is NOT advanced. */
export async function failCursor(
  client: SupabaseClient,
  resource: SkywalkResource,
  errorMessage: string,
  source = "skywalk"
): Promise<void> {
  await client
    .from("skywalk_sync_cursors")
    .update({
      last_run_finished_at: new Date().toISOString(),
      last_run_status: "error",
      last_run_error: errorMessage.slice(0, 4000),
    })
    .eq("source", source)
    .eq("resource", resource);
}

/** Read the current cursor row (without claiming). */
export async function readCursor(
  client: SupabaseClient,
  resource: SkywalkResource,
  source = "skywalk"
): Promise<SkywalkCursorRow | null> {
  const { data, error } = await client
    .from("skywalk_sync_cursors")
    .select("*")
    .eq("source", source)
    .eq("resource", resource)
    .maybeSingle();
  if (error) throw error;
  return (data as SkywalkCursorRow | null) ?? null;
}

/** Hard reset (used by the explicit FULL pull endpoint). */
export async function resetCursor(
  client: SupabaseClient,
  resource: SkywalkResource,
  source = "skywalk"
): Promise<void> {
  await client
    .from("skywalk_sync_cursors")
    .update({
      cursor_token: null,
      cursor_timestamp: null,
      last_run_status: null,
      last_run_started_at: null,
      last_run_finished_at: null,
      last_run_error: null,
      records_seen: 0,
    })
    .eq("source", source)
    .eq("resource", resource);
}
