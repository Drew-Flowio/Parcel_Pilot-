import type { IntelligenceDashboardSummary } from "./intelligence";

/** Normalized 0–100 for gauge fill, or null when the metric is undefined (no denominator). */
export type GaugeFill = number | null;

export interface DashboardGaugeDerived {
  totalParcels: number;
  topTargetPct: GaugeFill;
  repeatOwnerParcelPct: GaugeFill;
  absenteePct: GaugeFill;
  unitCoveragePct: GaugeFill;
  entityParcelPct: GaugeFill;
  individualParcelPct: GaugeFill;
  institutionalParcelPct: GaugeFill;
  otherParcelPct: GaugeFill;
  /** Resolved / (resolved + pending); null when no SOS rows in those states. */
  sosResolutionPct: GaugeFill;
  /** True when RPC returned no parcel cohort (pipeline empty / error recovery). */
  isEmptyCohort: boolean;
}

function ratioPct(numerator: number, denominator: number): GaugeFill {
  if (denominator <= 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

function roundDisplayPct(pct: GaugeFill): string {
  if (pct == null) return "—";
  return `${Math.round(pct * 10) / 10}%`;
}

/** Single place to derive percentages for all dashboard gauges from the RPC-backed summary. */
export function deriveDashboardGaugeMetrics(s: IntelligenceDashboardSummary): DashboardGaugeDerived {
  const total = s.totalParcels;
  const isEmptyCohort = total <= 0;

  const sosDenom = s.sosResolved + s.sosPending;
  const sosResolutionPct = sosDenom > 0 ? ratioPct(s.sosResolved, sosDenom) : null;

  return {
    totalParcels: total,
    topTargetPct: ratioPct(s.topTargets, total),
    repeatOwnerParcelPct: ratioPct(s.parcelsRepeatOwner, total),
    absenteePct: ratioPct(s.absentee, total),
    unitCoveragePct: ratioPct(s.parcelsWithKnownUnits, total),
    entityParcelPct: ratioPct(s.llcs, total),
    individualParcelPct: ratioPct(s.individuals, total),
    institutionalParcelPct: ratioPct(s.institutions, total),
    otherParcelPct: ratioPct(s.parcels_other, total),
    sosResolutionPct,
    isEmptyCohort,
  };
}

export { roundDisplayPct };
