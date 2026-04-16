import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultScoringWeightsBundle,
  parseScoringWeightsPayload,
  type ScoringWeightsBundle,
} from "./scoringWeights";

export async function fetchScoringWeightsBundle(
  supabase: SupabaseClient
): Promise<ScoringWeightsBundle> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "scoring_weights")
    .maybeSingle();
  if (error) {
    return getDefaultScoringWeightsBundle();
  }
  if (data?.value == null) {
    return getDefaultScoringWeightsBundle();
  }
  return parseScoringWeightsPayload(data.value) ?? getDefaultScoringWeightsBundle();
}
