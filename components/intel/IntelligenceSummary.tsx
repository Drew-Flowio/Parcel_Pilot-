import React from "react";
import { formatCurrency } from "@/lib/desirability";

interface SummaryProps {
  totalParcels: number;
  topTargets: number;
  portfolios: number;
  llcs: number;
  individuals: number;
  institutions: number;
  absentee: number;
  aggregateMarketValue: number;
  sosResolved: number;
  sosPending: number;
}

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
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${accentClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-ink-500">{sub}</div> : null}
    </div>
  );
}

export function IntelligenceSummary(props: SummaryProps) {
  const llcPct =
    props.totalParcels > 0
      ? Math.round((props.llcs / Math.max(1, props.llcs + props.individuals + props.institutions)) * 100)
      : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Top Targets"
        value={props.topTargets.toLocaleString()}
        sub={`Score v2 ≥ 70 · of ${props.totalParcels.toLocaleString()} parcels`}
        accent="accent"
      />
      <StatCard
        label="Portfolios (2+ parcels)"
        value={props.portfolios.toLocaleString()}
        sub={`${formatCurrency(props.aggregateMarketValue)}+ tracked (top 1,000 owners)`}
        accent="emerald"
      />
      <StatCard
        label="LLC / Entity owners"
        value={props.llcs.toLocaleString()}
        sub={`${llcPct}% of classified owners · ${props.sosPending.toLocaleString()} need SOS lookup`}
        accent="amber"
      />
      <StatCard
        label="Absentee parcels"
        value={props.absentee.toLocaleString()}
        sub={`Mailing address ≠ property · strongest PM signal`}
      />
    </div>
  );
}
