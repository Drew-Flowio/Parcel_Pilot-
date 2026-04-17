import React from "react";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabaseClient";
import {
  fetchAllSegments,
  fetchIntelligenceSummary,
  fetchTopAgents,
  fetchTopPortfolios,
} from "@/lib/intelligence";
import { AgentIntelligence } from "@/components/intel/AgentIntelligence";
import { IntelligenceSummary } from "@/components/intel/IntelligenceSummary";
import { OwnerLeaderboard } from "@/components/intel/OwnerLeaderboard";
import { SegmentCard } from "@/components/intel/SegmentCard";
import { PortfolioCard } from "@/components/intel/PortfolioCard";
import { ParcelPilotLogo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function IntelligenceDashboardPage() {
  const supabase = getSupabaseServer();

  let errorMsg: string | null = null;
  let summary = {
    totalParcels: 0,
    topTargets: 0,
    portfolios: 0,
    llcs: 0,
    individuals: 0,
    institutions: 0,
    absentee: 0,
    aggregateMarketValue: 0,
    sosResolved: 0,
    sosPending: 0,
  };
  let topPortfolios: Awaited<ReturnType<typeof fetchTopPortfolios>> = [];
  let segments: Awaited<ReturnType<typeof fetchAllSegments>> = [];
  let hotPortfolios: Awaited<ReturnType<typeof fetchTopPortfolios>> = [];
  let topAgents: Awaited<ReturnType<typeof fetchTopAgents>> = [];

  try {
    const [s, tp, seg, hp, ta] = await Promise.all([
      fetchIntelligenceSummary(supabase),
      fetchTopPortfolios(supabase, { limit: 10, minParcels: 2, orderBy: "total_market_value" }),
      fetchAllSegments(supabase),
      fetchTopPortfolios(supabase, { limit: 6, minParcels: 3, orderBy: "total_market_value" }),
      fetchTopAgents(supabase, { limit: 8 }),
    ]);
    summary = s;
    topPortfolios = tp;
    segments = seg;
    hotPortfolios = hp;
    topAgents = ta;
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
              className="rounded-lg bg-ink-900 px-3 py-1.5 font-medium text-white shadow-soft"
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
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        {errorMsg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Intelligence engine is not responding.</div>
            <div className="mt-1 text-xs">{errorMsg}</div>
            <div className="mt-2 text-xs text-red-600">
              Re-run the <code>intelligence_engine_v2</code> migration and refresh{" "}
              <code>portfolio_groups</code>.
            </div>
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Hennepin County · Property Management Lead Intelligence
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                The Gold Map
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-ink-500">
                Live intelligence across {summary.totalParcels.toLocaleString()} PM-target parcels.
                Skip tracers are pickaxes — we show exactly where to dig.
              </p>
            </div>
          </div>
          <IntelligenceSummary {...summary} />
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Dynamic Lead Segments
              </div>
              <h2 className="font-display text-xl font-semibold text-ink-900">
                One-click pipelines
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {segments.map((s) => (
              <SegmentCard key={s.slug} segment={s} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Portfolio Intelligence
              </div>
              <h2 className="font-display text-xl font-semibold text-ink-900">Hot portfolios</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-ink-500">
                Owners with 3+ parcels ranked by aggregate market value — each card is a
                one-click drill into the cockpit portfolio view.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/api/portfolio-grouping?format=csv&minParcels=3&limit=2000"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                download
              >
                Export CSV
              </a>
              <Link
                href="/cockpit?portfolio=1"
                className="text-xs font-medium text-accent-700 hover:text-accent-800"
              >
                See all portfolios →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hotPortfolios.map((g) => (
              <PortfolioCard key={g.owner_key} group={g} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <OwnerLeaderboard rows={topPortfolios} />
          <AgentIntelligence rows={topAgents} />
        </section>
      </main>
    </div>
  );
}
