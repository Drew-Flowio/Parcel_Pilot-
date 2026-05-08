import React from "react";
import type { IntelligenceDashboardSummary } from "@/lib/intelligence";
import { formatCurrency } from "@/lib/desirability";

type SummaryProps = IntelligenceDashboardSummary;

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "ink" | "accent" | "emerald" | "amber" | "red";
}) {
  const accentClass =
    accent === "accent"
      ? "text-accent-600"
      : accent === "emerald"
        ? "text-emerald-600"
        : accent === "amber"
          ? "text-amber-600"
          : accent === "red"
            ? "text-red-600"
            : "text-ink-900";
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-4 shadow-soft">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${accentClass}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-ink-500">{sub}</div> : null}
    </div>
  );
}

export function IntelligenceSummary(props: SummaryProps) {
  const entityPctParcel =
    props.totalParcels > 0 ? Math.round((props.llcs / props.totalParcels) * 1000) / 10 : 0;

  const minScore = Number.isFinite(props.topTargetMinScoreV2)
    ? props.topTargetMinScoreV2
    : 60;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Top targets"
          value={props.topTargets.toLocaleString()}
          sub={`Score v2 ≥ ${minScore} (same floor as segment “top_500_pm”) · of ${props.totalParcels.toLocaleString()} parcels`}
          accent="accent"
        />
        <StatCard
          label="Portfolios (2+ parcels)"
          value={props.portfolios.toLocaleString()}
          sub={`${formatCurrency(props.aggregateMarketValue)} total assessed value — all ${props.totalParcels.toLocaleString()} parcels, each counted once (Hennepin MKT_VAL_TOT — not rent or income)`}
          accent="emerald"
        />
        <StatCard
          label="LLC / Entity parcels"
          value={props.llcs.toLocaleString()}
          sub={`${entityPctParcel}% of all parcels · ${props.sosPending.toLocaleString()} SOS lookups still pending`}
          accent="amber"
        />
        <StatCard
          label="Absentee parcels"
          value={props.absentee.toLocaleString()}
          sub="Mailing municipality ≠ property · strongest PM signal"
        />
      </div>
      <p className="text-[11px] leading-relaxed text-ink-400">
        Property metrics are sourced from <code className="rounded bg-ink-100 px-1">public.parcel_pilot_dashboard_metrics()</code>{" "}
        (one roll-up per page load). Assessed unit sum:{" "}
        <span className="font-mono tabular-nums text-ink-600">
          {props.sumUnitCountAssessed.toLocaleString()} units
        </span>{" "}
        across{" "}
        <span className="font-mono tabular-nums text-ink-600">
          {props.parcelsWithKnownUnits.toLocaleString()}
        </span>{" "}
        parcels with a non-null unit count; many assessor rows omit units — this is not annualized or monthly rent.
      </p>
    </div>
  );
}
