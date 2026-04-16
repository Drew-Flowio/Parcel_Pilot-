import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { fetchScoringWeightsBundle } from "@/lib/scoringSettingsServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServer();
  const bundle = await fetchScoringWeightsBundle(supabase);
  return NextResponse.json(bundle);
}
