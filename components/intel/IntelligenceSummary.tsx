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
import { FlowioMarquee } from "@/components/flowio/FlowioMarquee";

const HEADLINE_WORDS = ["Intelligence", "that", "moves", "with", "your", "market"];

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
    <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-md shadow-ink-900/5 ring-1 ring-ink-900/[0.06] transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
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
      <header className="relative isolate overflow-hidden rounded-3xl border border-white/70 bg-white/55 shadow-lift ring-1 ring-ink-900/[0.04] backdrop-blur-xl sm:px-8 sm:py-9">
        <div className="flowio-hero-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute -left-28 top-10 h-[22rem] w-[22rem] rounded-full bg-gradient-to-br from-accent-300/45 via-amber-200/25 to-transparent blur-3xl animate-flowio-float-slow"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-20 bottom-[-20%] h-[26rem] w-[26rem] rounded-full bg-gradient-to-tl from-emerald-400/35 via-accent-400/15 to-transparent blur-3xl animate-flowio-float-slow"
          style={{ animationDelay: "-7s" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute right-[18%] top-8 hidden h-32 w-32 rounded-full bg-violet-400/20 blur-2xl sm:block" aria-hidden />

        <div className="relative px-5 py-8 sm:px-2">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
            <div className="max-w-2xl flex-1 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-900 shadow-sm ring-1 ring-white/70">
                  <IconPulse />
                  Live cohort
                </span>
                <span className="rounded-full bg-gradient-to-r from-ink-900 via-ink-800 to-ink-900 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-50 shadow-inner">
                  Flowio
                </span>
              </div>

              <div>
                <p className="font-display text-sm font-medium uppercase tracking-[0.35em] text-ink-400">
                  Gold map
                </p>
                <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl">
                  <span className="flowio-aurora-text">Flowio</span>
                  <span className="mt-4 block font-medium text-ink-800">
                    {HEADLINE_WORDS.map((word, i) => (
                      <span
                        key={word}
                        className="flowio-rise-word"
                        style={{ animationDelay: `${120 + i * 70}ms` }}
                      >
                        {word}
                        {i < HEADLINE_WORDS.length - 1 ? "\u00a0" : ""}
                      </span>
                    ))}
                  </span>
                </h1>
              </div>

              <p className="max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                <span className="font-semibold text-ink-800">
                  {props.totalParcels.toLocaleString()} county-filtered PM targets,
                </span>{" "}
                scored and clustered so you glide past noise into owners worth the conversation.
              </p>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/cockpit"
                  className="flowio-btn-shine shadow-lift-sm inline-flex items-center justify-center rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white ring-2 ring-ink-800/70 transition duration-300 hover:-translate-y-1 hover:bg-ink-800 hover:shadow-lift hover:ring-accent-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
                >
                  <span className="relative z-[1]">Open Cockpit</span>
                </Link>
                <Link
                  href="/segments/top_500_pm"
                  className="inline-flex items-center justify-center rounded-xl border border-ink-200/90 bg-white/90 px-6 py-3 text-sm font-semibold text-ink-800 shadow-md shadow-ink-900/5 ring-1 ring-white/80 transition duration-300 hover:-translate-y-1 hover:border-accent-300/80 hover:bg-white hover:shadow-lift-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
                >
                  See top scored leads
                </Link>
              </div>
            </div>

            <div className="flowio-glass-panel relative w-full shrink-0 self-stretch rounded-2xl border border-white/80 p-6 shadow-lift-sm ring-1 ring-ink-900/[0.05] transition duration-500 ease-out hover:-translate-y-1 hover:shadow-lift hover:ring-accent-200/35 sm:max-w-md lg:mt-0">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-accent-400/30 to-transparent blur-2xl" aria-hidden />
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-400">
                Today&apos;s highlight
              </div>
              <p className="mt-3 font-display text-2xl font-semibold leading-snug text-ink-900">
                {props.topTargets.toLocaleString()}{" "}
                <span className="text-accent-800">parcels</span> clear your gold bar
              </p>
              <p className="mt-2 text-sm text-ink-600">
                Score v2 ≥ {minScore}&nbsp;&nbsp;·&nbsp;&nbsp;
                <span className="font-semibold text-accent-700">{topPct}%</span> of the live map.
              </p>
              {!d.isEmptyCohort ? (
                <div className="mt-5">
                  <LinearPercentGauge
                    pct={d.topTargetPct}
                    label=""
                    suffix={` (${props.topTargets.toLocaleString()} of ${props.totalParcels.toLocaleString()})`}
                    tone="gold"
                    foot=""
                  />
                </div>
              ) : (
                <p className="mt-5 text-sm italic text-ink-400">Waiting for cohort metrics…</p>
              )}
              <p className="mt-4 border-t border-ink-100/80 pt-4 text-xs leading-relaxed text-ink-500">{sosHint}</p>
            </div>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/50 bg-white/35 shadow-inner">
            <FlowioMarquee />
          </div>
        </div>
      </header>

      <DashboardHeroGaugeStrip summary={props} />

      <div className="grid gap-4 lg:grid-cols-12">
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/70 bg-white/95 p-6 shadow-lift-sm ring-1 ring-ink-900/[0.04] transition duration-300 hover:-translate-y-1 hover:border-accent-200/50 hover:shadow-lift lg:col-span-5">
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
          <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-emerald-50/90 to-white p-5 shadow-lift-sm ring-1 ring-emerald-900/[0.04] transition duration-300 hover:-translate-y-1 hover:border-emerald-200/60 hover:shadow-lift">
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

          <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-amber-50/95 to-white p-5 shadow-lift-sm ring-1 ring-amber-900/[0.05] transition duration-300 hover:-translate-y-1 hover:border-amber-200/70 hover:shadow-lift">
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

          <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-violet-50/70 to-white p-5 shadow-lift-sm ring-1 ring-violet-900/[0.04] transition duration-300 hover:-translate-y-1 hover:border-violet-200/60 hover:shadow-lift">
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

          <article className="rounded-3xl border border-white/80 bg-white/95 p-5 shadow-lift-sm ring-1 ring-ink-900/[0.04] transition duration-300 hover:-translate-y-1 hover:border-accent-200/50 hover:shadow-lift">
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

      <footer className="flex flex-col gap-2 rounded-2xl border border-dashed border-ink-200/80 bg-white/60 px-4 py-3 shadow-md shadow-ink-900/5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-600">Trust mode on.</span> Flowio surfaces live gauges from{" "}
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
