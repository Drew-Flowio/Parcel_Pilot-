import React from "react";
import Link from "next/link";
import type { IntelligenceDashboardSummary } from "@/lib/intelligence";
import { formatCurrency } from "@/lib/desirability";

type SummaryProps = IntelligenceDashboardSummary & {
  /** Ready-made segment cards below the fold — for a single friendly stat. */
  segmentCount?: number;
};

function IconPulse({ className }: { className?: string }) {
  return (
    <span className={`relative flex h-3 w-3 ${className ?? ""}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
    </span>
  );
}

function InsightPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-ink-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm">
      {children}
    </div>
  );
}

/** Donut ring: 0–100 fill for a quick “mix” read without implying precision. */
function MiniDonut({ pct, tone }: { pct: number; tone: "amber" | "accent" | "ink" }) {
  const p = Math.min(100, Math.max(0, pct));
  const track = tone === "amber" ? "#fcd34d" : tone === "accent" ? "#fdba74" : "#d5dae0";
  const fill = tone === "amber" ? "#d97706" : tone === "accent" ? "#ea580c" : "#414c5d";
  return (
    <div
      className="h-12 w-12 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(${fill} ${p * 3.6}deg, ${track} 0deg)`,
        mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))",
        WebkitMask:
          "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))",
      }}
      aria-hidden
    />
  );
}

export function IntelligenceSummary(props: SummaryProps) {
  const entityPct =
    props.totalParcels > 0 ? Math.round((props.llcs / props.totalParcels) * 1000) / 10 : 0;
  const topPct =
    props.totalParcels > 0 ? Math.round((props.topTargets / props.totalParcels) * 1000) / 10 : 0;
  const absenteePct =
    props.totalParcels > 0 ? Math.round((props.absentee / props.totalParcels) * 1000) / 10 : 0;
  const unitCoveragePct =
    props.totalParcels > 0
      ? Math.round((props.parcelsWithKnownUnits / props.totalParcels) * 1000) / 10
      : 0;
  const avgParcelValue =
    props.totalParcels > 0 ? props.aggregateMarketValue / props.totalParcels : 0;

  const minScore = Number.isFinite(props.topTargetMinScoreV2) ? props.topTargetMinScoreV2 : 60;

  const sosHint =
    props.sosPending > 0
      ? `${props.sosPending.toLocaleString()} SOS lookups still in the queue — resolving them boosts contactability scores.`
      : props.sosResolved > 0
        ? `${props.sosResolved.toLocaleString()} Minnesota SOS records on file. Nice — your entity map is warming up.`
        : "Tip: resolve Minnesota SOS data for LLCs to unlock agent-level routing.";

  const pipelines = props.segmentCount ?? null;

  return (
    <div className="space-y-6">
      {/* ---- Hero: hierarchy + momentum ---- */}
      <header className="relative overflow-hidden rounded-2xl border border-ink-200/90 bg-gradient-to-br from-white via-accent-50/35 to-white px-5 py-6 shadow-pop sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent-200/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-emerald-200/20 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200/80">
                <IconPulse />
                Live snapshot
              </span>
              <span className="rounded-full bg-ink-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-200">
                Parcel Pilot
              </span>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Your Gold Map is{" "}
              <span className="bg-gradient-to-r from-accent-700 to-amber-600 bg-clip-text text-transparent">
                warming up
              </span>
            </h1>
            <p className="text-base leading-relaxed text-ink-600">
              {props.totalParcels.toLocaleString()} county-filtered PM targets, scored and clustered so
              you skip the noise and head straight to owners worth the conversation.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/cockpit"
                className="inline-flex items-center justify-center rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2"
              >
                Open Cockpit
              </Link>
              <Link
                href="/segments/top_500_pm"
                className="inline-flex items-center justify-center rounded-xl border border-ink-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm transition hover:border-accent-300 hover:bg-accent-50/80 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2"
              >
                See top scored leads
              </Link>
            </div>
          </div>

          {/* Quick win card — gamified but honest */}
          <div className="relative w-full shrink-0 rounded-2xl border border-ink-200 bg-white/95 p-5 shadow-soft sm:max-w-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
              Today&apos;s highlight
            </div>
            <p className="mt-2 font-display text-xl font-semibold text-ink-900">
              {props.topTargets.toLocaleString()} parcels clear your gold bar
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Score v2 ≥ {minScore}&nbsp;&nbsp;·&nbsp;&nbsp;that&apos;s{" "}
              <span className="font-semibold text-accent-700">{topPct}%</span> of everything on the map.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-accent-500 to-amber-500 transition-all duration-700 ${
                  props.topTargets > 0 && topPct < 1 ? "min-w-[6px]" : ""
                }`}
                style={{ width: props.topTargets === 0 ? "0%" : `${Math.min(100, topPct)}%` }}
                title={`${topPct}% of parcels score ${minScore} or higher (${props.topTargets.toLocaleString()} parcels)`}
              />
            </div>
            <p className="mt-3 text-xs leading-snug text-ink-500">{sosHint}</p>
          </div>
        </div>
      </header>

      {/* ---- Bento metrics (live + accurate) ---- */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Featured: market pulse */}
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 shadow-soft transition hover:border-accent-200/70 hover:shadow-pop lg:col-span-5">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-400 via-amber-400 to-emerald-400 opacity-90 transition group-hover:opacity-100"
            aria-hidden
          />
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <span aria-hidden>◆</span> County market pulse
            </div>
            <p className="mt-3 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink-900 sm:text-5xl">
              {formatCurrency(props.aggregateMarketValue)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              Total <span className="font-semibold text-ink-800">assessed market value</span> across all{" "}
              {props.totalParcels.toLocaleString()} parcels — each counted once (Hennepin{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[11px] text-ink-700">
                MKT_VAL_TOT
              </code>
              ).
            </p>
          </div>
          <div className="mt-6 space-y-3 border-t border-ink-100 pt-5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-500">Rough avg per parcel</span>
              <span className="font-mono font-semibold tabular-nums text-ink-900">
                {formatCurrency(Math.round(avgParcelValue))}
              </span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium text-ink-500">
                <span>Known unit coverage</span>
                <span className="tabular-nums text-ink-700">
                  {props.parcelsWithKnownUnits.toLocaleString()} parcels · {unitCoveragePct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  style={{ width: `${Math.min(100, unitCoveragePct)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-400">
                {props.sumUnitCountAssessed.toLocaleString()} assessed units summed where the county gave
                a count — many rows are still blank; that&apos;s normal.
              </p>
            </div>
          </div>
        </article>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {/* Portfolios */}
          <article className="rounded-2xl border border-ink-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-soft transition hover:border-emerald-200 hover:shadow-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/80">
                  Repeat owners
                </div>
                <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-emerald-950">
                  {props.portfolios.toLocaleString()}
                </p>
              </div>
              <span className="text-2xl" aria-hidden>
                🏘️
              </span>
            </div>
            <p className="mt-2 text-sm text-emerald-900/85">
              Owners juggling <span className="font-semibold">two or more</span> parcels — your portfolio
              plays start here.
            </p>
          </article>

          {/* Entity mix */}
          <article className="rounded-2xl border border-ink-200 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-soft transition hover:border-amber-200 hover:shadow-pop">
            <div className="flex gap-4">
              <MiniDonut pct={entityPct} tone="amber" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900/75">
                  LLC &amp; entity turf
                </div>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink-900">
                  {props.llcs.toLocaleString()}
                </p>
                <p className="mt-1 text-xs leading-snug text-amber-950/80">
                  <span className="font-semibold">{entityPct}%</span> entity-classified · plus{" "}
                  {props.individuals.toLocaleString()} individual ·{" "}
                  {props.institutions.toLocaleString()} institutional parcels.
                </p>
              </div>
            </div>
          </article>

          {/* Absentee */}
          <article className="rounded-2xl border border-ink-200 bg-gradient-to-br from-violet-50/60 to-white p-5 shadow-soft transition hover:border-violet-200 hover:shadow-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-violet-900/75">
                  Absentee signal
                </div>
                <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-ink-900">
                  {props.absentee.toLocaleString()}
                </p>
              </div>
              <span className="text-2xl" aria-hidden>
                📍
              </span>
            </div>
            <p className="mt-2 text-sm text-violet-950/85">
              Mailing municipality ≠ property — often the warmest PM conversations. That&apos;s{" "}
              <span className="font-semibold">{absenteePct}%</span> of your map.
            </p>
          </article>

          {/* SOS + pipelines teaser */}
          <article className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft transition hover:border-accent-200 hover:shadow-pop">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
              Entity intelligence
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Resolved</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-emerald-700">
                  {props.sosResolved.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-xl bg-accent-50/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-accent-800">Queued</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-accent-800">
                  {props.sosPending.toLocaleString()}
                </dd>
              </div>
            </dl>
            {pipelines != null && pipelines > 0 ? (
              <p className="mt-3 text-xs leading-snug text-ink-500">
                Below: <span className="font-semibold text-ink-700">{pipelines} ready-made pipelines</span>{" "}
                — pick one and go hunting.
              </p>
            ) : (
              <p className="mt-3 text-xs text-ink-500">Scroll down for one-click lead pipelines.</p>
            )}
          </article>
        </div>
      </div>

      {/* Insight strip — derived, no fake metrics */}
      <div className="flex flex-wrap gap-2">
        <InsightPill>
          <span aria-hidden className="text-base">
            ✦
          </span>
          <span>
            <span className="font-semibold text-ink-900">{props.topTargets.toLocaleString()}</span> parcels
            beat your scoring floor — start there.
          </span>
        </InsightPill>
        {props.portfolios > 0 && (
          <InsightPill>
            <span aria-hidden>🏆</span>
            <span>
              <span className="font-semibold text-ink-900">{props.portfolios.toLocaleString()}</span>{" "}
              multi-parcel owners — bulk outreach wins.
            </span>
          </InsightPill>
        )}
        {props.absentee > 0 && (
          <InsightPill>
            <span aria-hidden>✨</span>
            <span>
              Absentees are <span className="font-semibold text-ink-900">{absenteePct}%</span> of the
              dataset — filter them in Cockpit for a focused day.
            </span>
          </InsightPill>
        )}
      </div>

      {/* Trust rail */}
      <footer className="flex flex-col gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-600">Trust mode on.</span> Every number above comes from{" "}
          <code className="rounded bg-white px-1 font-mono text-[10px]">parcel_pilot_dashboard_metrics()</code>{" "}
          on page load — assessed values, not rent. Refresh the page for the latest roll-up.
        </p>
      </footer>
    </div>
  );
}
