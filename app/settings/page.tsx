import React from "react";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { ParcelPilotLogo } from "@/components/ui/Logo";
import { SkipTraceSettings } from "@/components/intel/SkipTraceSettings";
import type { ScoringWeightsBundle } from "@/lib/scoringWeights";
import { fetchScoringWeightsBundle } from "@/lib/scoringSettingsServer";

export const dynamic = "force-dynamic";

async function fetchSkipTraceSettings(supabase: ReturnType<typeof getSupabaseServer>): Promise<{
  batchdata_key_configured: boolean;
}> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "skip_trace_keys")
    .maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, unknown>;
  return {
    batchdata_key_configured:
      typeof raw.batchdata_api_key === "string" && raw.batchdata_api_key.length > 0,
  };
}

export default async function SettingsPage() {
  const supabase = getSupabaseServer();
  let weights: ScoringWeightsBundle | null = null;
  let skip = { batchdata_key_configured: false };
  let errorMsg: string | null = null;

  try {
    const [w, st] = await Promise.all([
      fetchScoringWeightsBundle(supabase),
      fetchSkipTraceSettings(supabase),
    ]);
    weights = w;
    skip = st;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200/90 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ParcelPilotLogo />
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/"
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Intelligence
            </Link>
            <Link
              href="/cockpit"
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Cockpit
            </Link>
            <Link
              href="/settings"
              className="rounded-lg bg-ink-900 px-3 py-1.5 font-medium text-white shadow-soft"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Workspace
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Settings
          </h1>
        </div>

        {errorMsg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMsg}
          </div>
        ) : null}

        <SkipTraceSettings initialConfigured={skip.batchdata_key_configured} />

        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Scoring Engine
              </div>
              <h2 className="font-display text-lg font-semibold text-ink-900">
                Desirability weights
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Score v2 (intelligence) uses a fixed 40/30/20/10 blend. Legacy PM / Flipper weights below
                still power the cockpit preview badges.
              </p>
            </div>
          </div>
          {weights ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WeightsCard title="PM weights" mode={weights.pm} />
              <WeightsCard title="Flipper weights" mode={weights.flipper} />
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function WeightsCard({
  title,
  mode,
}: {
  title: string;
  mode: ScoringWeightsBundle["pm"];
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3 text-xs">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {title}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums text-ink-800">
        <dt className="text-ink-500">Absentee</dt>
        <dd className="text-right">+{mode.absenteeMax}</dd>
        <dt className="text-ink-500">Vacancy days</dt>
        <dd className="text-right">+{mode.vacancyDaysMax}</dd>
        <dt className="text-ink-500">Unit band</dt>
        <dd className="text-right">+{mode.unitSweetSpotMax}</dd>
        <dt className="text-ink-500">Market band</dt>
        <dd className="text-right">+{mode.marketValuePoints}</dd>
        <dt className="text-ink-500">Pro-managed</dt>
        <dd className="text-right">{mode.professionallyManagedPenalty}</dd>
      </dl>
    </div>
  );
}
