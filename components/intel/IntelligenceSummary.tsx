import React from "react";
import Link from "next/link";
import type { IntelligenceDashboardSummary } from "@/lib/intelligence";
import { formatCurrency } from "@/lib/desirability";
import { deriveDashboardGaugeMetrics, roundDisplayPct } from "@/lib/dashboardGaugeMetrics";
import {
  DashboardHeroGaugeStrip,
  LinearPercentGauge,
  OwnerMixGauge,
} from "@/components/intel/DashboardGauges";

type SummaryProps = IntelligenceDashboardSummary & {
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

export function IntelligenceSummary(props: SummaryProps) {
  const d = deriveDashboardGaugeMetrics(props);
  const topPct =
    props.totalParcels > 0 ? Math.round((props.topTargets / props.totalParcels) * 1000) / 10 : 0;

  const avgParcelValue =
    props.totalParcels > 0 ? props.aggregateMarketValue / props.totalParcels : 0;

  const minScore = Number.isFinite(props.topTargetMinScoreV2) ? props.topTargetMinScoreV2 : 60;

  const sosHint =
    props.sosPending > 0
      ? `${props.sosPending.toLocaleString()} SOS lookups still in the queue — resolving them boosts contactability scores.`
      : props.sosResolved > 0
        ? `${props.sosResolved.toLocaleString()} Minnesota SOS records on file. Nice — your entity map is warming up.`
        : "Tip: resolve Minnesota SOS data for LLCs to unlock agent-level routing.";

  return (
    <div className="space-y-6">
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
            {!d.isEmptyCohort ? (
              <div className="mt-4">
                <LinearPercentGauge
                  pct={d.topTargetPct}
                  label=""
                  suffix={` (${props.topTargets.toLocaleString()} of ${props.totalParcels.toLocaleString()})`}
                  tone="gold"
                  foot=""
                />
              </div>
            ) : (
              <p className="mt-4 text-xs italic text-ink-400">Waiting for cohort metrics…</p>
            )}
            <p className="mt-3 text-xs leading-snug text-ink-500">{sosHint}</p>
          </div>
        </div>
      </header>

      <DashboardHeroGaugeStrip summary={props} />

      <div className="grid gap-4 lg:grid-cols-12">
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
          <div className="mt-6 space-y-4 border-t border-ink-100 pt-5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-500">Rough avg per parcel</span>
              <span className="font-mono font-semibold tabular-nums text-ink-900">
                {formatCurrency(Math.round(avgParcelValue))}
              </span>
            </div>
            <LinearPercentGauge
              pct={d.unitCoveragePct}
              label="Known unit coverage (assessor-supplied counts)"
              suffix={` · ${props.parcelsWithKnownUnits.toLocaleString()} parcels`}
              foot={`${props.sumUnitCountAssessed.toLocaleString()} assessed units summed where the county provided a figure — blanks are normal.`}
              tone="emerald"
            />
          </div>
        </article>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
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
              Owners juggling <span className="font-semibold">two or more</span> parcels — your portfolio plays
              start here.
            </p>
            <div className="mt-4">
              <LinearPercentGauge
                pct={d.repeatOwnerParcelPct}
                label="Parcel share on repeat-owner books"
                suffix={` (${props.parcelsRepeatOwner.toLocaleString()} parcels)`}
                tone="emerald"
              />
            </div>
          </article>

          <article className="rounded-2xl border border-ink-200 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-soft transition hover:border-amber-200 hover:shadow-pop">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900/75">
              LLC &amp; entity turf
            </div>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-ink-900">
              {props.llcs.toLocaleString()}
            </p>
            <p className="mt-2 text-xs leading-snug text-amber-950/85">
              Parcels flagged as entities in the classifier — donut matches the cohort roll-up ({props.totalParcels.toLocaleString()} total).
            </p>
            <div className="mt-5">
              <OwnerMixGauge summary={props} derived={d} />
            </div>
          </article>

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
              Mailing municipality ≠ property — often the warmest PM conversations.
            </p>
            <div className="mt-4">
              <LinearPercentGauge
                pct={d.absenteePct}
                label="Absentee penetration"
                suffix={` (${props.absentee.toLocaleString()} parcels)`}
                tone="violet"
              />
            </div>
          </article>

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
            <div className="mt-4">
              <LinearPercentGauge
                pct={props.sosResolved + props.sosPending > 0 ? d.sosResolutionPct : null}
                label={props.sosResolved + props.sosPending > 0 ? "Resolved vs active queue" : "SOS queue"}
                tone="gold"
                foot={
                  props.sosResolved + props.sosPending > 0
                    ? `${props.sosResolved.toLocaleString()} resolved ÷ (${props.sosResolved.toLocaleString()} + ${props.sosPending.toLocaleString()} tracked rows).`
                    : undefined
                }
              />
              {props.sosResolved + props.sosPending === 0 ? (
                <p className="mt-2 text-[11px] leading-snug text-ink-400">
                  No pending or resolved SOS rows yet — the bar activates once lookups exist.
                </p>
              ) : null}
            </div>
          </article>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <InsightPill>
          <span aria-hidden className="text-base">
            ✦
          </span>
          <span>
            <span className="font-semibold text-ink-900">{props.topTargets.toLocaleString()}</span> parcels beat
            your scoring floor — start there.
          </span>
        </InsightPill>
        {props.portfolios > 0 && (
          <InsightPill>
            <span aria-hidden>🏆</span>
            <span>
              <span className="font-semibold text-ink-900">{props.portfolios.toLocaleString()}</span> multi-parcel
              owners — bulk outreach wins.
            </span>
          </InsightPill>
        )}
        {props.absentee > 0 && !d.isEmptyCohort && (
          <InsightPill>
            <span aria-hidden>✨</span>
            <span>
              Absentees are <span className="font-semibold text-ink-900">{roundDisplayPct(d.absenteePct)}</span> of
              parcels in this cohort.
            </span>
          </InsightPill>
        )}
      </div>

      <footer className="flex flex-col gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-600">Trust mode on.</span> Gauges &amp; cards read from{" "}
          <code className="rounded bg-white px-1 font-mono text-[10px]">parcel_pilot_dashboard_metrics()</code> on page
          load — assessed values, not rent. Refresh for the newest roll-up.
          {typeof props.segmentCount === "number" ? (
            <>
              {" "}
              <span className="text-ink-400">
                ({props.segmentCount.toLocaleString()} segment{props.segmentCount === 1 ? "" : "s"} in rotation.)
              </span>
            </>
          ) : null}
        </p>
      </footer>
    </div>
  );
}
