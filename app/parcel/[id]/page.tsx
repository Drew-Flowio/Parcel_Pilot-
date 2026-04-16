import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { fetchScoringWeightsBundle } from "@/lib/scoringSettingsServer";
import { ParcelPilotLogo } from "@/components/ui/Logo";
import { ParcelDetailClient } from "./ParcelDetailClient";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParcelPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = getSupabaseServer();
  const scoringWeights = await fetchScoringWeightsBundle(supabase);
  const spMode = Array.isArray(searchParams.scoringMode)
    ? searchParams.scoringMode[0]
    : searchParams.scoringMode;
  const scoringMode = spMode === "flipper" ? "flipper" : "pm";

  const { data, error } = await supabase
    .from("parcels")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <header className="mb-8 flex items-center justify-between border-b border-ink-200 pb-6">
        <Link href="/">
          <ParcelPilotLogo />
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-ink-500 hover:text-accent-600"
        >
          ← Back to cockpit
        </Link>
      </header>

      <ParcelDetailClient
        initial={data as Parcel}
        scoringWeights={scoringWeights}
        scoringMode={scoringMode}
      />
    </div>
  );
}
