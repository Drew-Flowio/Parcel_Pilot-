import { getSupabaseServer } from "@/lib/supabaseClient";

/** Default day-boundary timezone — Hennepin County is America/Chicago. */
export const DEFAULT_ROLLUP_TZ = "America/Chicago";

/**
 * Re-aggregate skywalk_messages → skywalk_conversations (per-thread
 * "current state" rollup).
 *
 * @param since  Only re-aggregate conversations with a message ingested
 *               AFTER `since`. Pass `null` for a full re-rollup.
 *
 * Returns the number of conversation rows that were inserted/updated.
 */
export async function rollupConversations(
  since: Date | null = null
): Promise<{ rolledUp: number; durationMs: number }> {
  const startedAt = Date.now();
  const supabase = getSupabaseServer();

  const { data, error } = await supabase.rpc("skywalk_rollup_conversations", {
    p_since: since?.toISOString() ?? null,
  });
  if (error) throw error;

  return {
    rolledUp: typeof data === "number" ? data : 0,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Re-aggregate skywalk_messages → skywalk_thread_day_rollups (per-thread,
 * per-local-tz-day digest). This is the canonical unit for downstream
 * AppFolio sync.
 *
 * @param since           Only refresh days touched by messages ingested AFTER this. Null = full.
 * @param conversationId  Optional — limit to a single thread (manual ops).
 * @param tz              IANA tz used to determine the day boundary. Default America/Chicago.
 *
 * Returns the number of (conversation, day) rollup rows written.
 */
export async function rollupThreadDays(options: {
  since?: Date | null;
  conversationId?: string | null;
  tz?: string;
} = {}): Promise<{ rolledUp: number; durationMs: number }> {
  const startedAt = Date.now();
  const supabase = getSupabaseServer();

  const { data, error } = await supabase.rpc("skywalk_rollup_thread_days", {
    p_since: options.since?.toISOString() ?? null,
    p_conversation_id: options.conversationId ?? null,
    p_tz: options.tz ?? DEFAULT_ROLLUP_TZ,
  });
  if (error) throw error;

  return {
    rolledUp: typeof data === "number" ? data : 0,
    durationMs: Date.now() - startedAt,
  };
}
