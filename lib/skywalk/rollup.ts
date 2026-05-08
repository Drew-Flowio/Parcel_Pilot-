import { getSupabaseServer } from "@/lib/supabaseClient";

/**
 * Re-aggregate skywalk_messages → skywalk_conversations.
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
