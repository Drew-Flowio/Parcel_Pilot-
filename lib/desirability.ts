import type { ModeWeights, ScoringWeightsBundle } from "./scoringWeights";
import { LEGACY_SQL_WEIGHTS, weightsForMode } from "./scoringWeights";
import type { Parcel, ScoringMode } from "./types";

export interface ScoreFactor {
  label: string;
  points: number;
  detail: string;
}

export interface ScoreBreakdown {
  /** Normalized 0–100 from the raw sum (mirrors SQL `round(least(100, raw/70*100), 1)`). */
  computedTotal: number;
  /** Sum of raw components before scaling (max 70 before penalties). */
  rawSum: number;
  factors: ScoreFactor[];
}

/** Coerce PostgREST / JSON numbers (sometimes strings) to finite number or null. */
export function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stored score from the database (Postgres trigger). Prefer this for display;
 * use `computeDesirabilityBreakdown` to explain how the formula works.
 */
export function parseDesirabilityScore(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  return Math.round(Math.min(100, n) * 10) / 10;
}

/** Scale raw sum to 0–100 using mode-specific `rawMax` (same role as SQL’s ÷70×100). */
function normalizeRawToScore(raw: number, rawMax: number): number {
  const clampedRaw = Math.max(0, raw);
  if (rawMax <= 0) return 0;
  const scaled = (clampedRaw / rawMax) * 100;
  return Math.round(Math.min(100, scaled) * 10) / 10;
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Desirability breakdown for UI. Without `opts`, matches Postgres `calculate_desirability_score`.
 * With `opts`, uses `app_settings` weights (PM vs Flipper).
 */
export function computeDesirabilityBreakdown(
  p: Partial<Parcel>,
  opts?: { mode: ScoringMode; weights: ModeWeights }
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const legacy = opts == null;
  const mode = opts?.mode ?? "pm";
  const w = opts?.weights ?? LEGACY_SQL_WEIGHTS;

  if (p.contact_status === "do_not_contact") {
    factors.push({
      label: "Do not contact",
      points: 0,
      detail: "contact_status is do_not_contact — score forced to 0 in the database.",
    });
    return { computedTotal: 0, rawSum: 0, factors };
  }

  const vacantLabel = legacy
    ? "Days vacant"
    : mode === "flipper"
      ? "Distress"
      : "Vacancy";
  const unitLabel = legacy
    ? "Unit count"
    : mode === "flipper"
      ? "Small multi"
      : "Unit sweet spot";

  const distressCap =
    mode === "flipper" && !legacy
      ? w.distressMax ?? w.vacancyDaysMax
      : w.vacancyDaysMax;

  const unitCap =
    mode === "flipper" && !legacy
      ? w.smallMultiMax ?? w.unitSweetSpotMax
      : w.unitSweetSpotMax;

  let absPts = 0;
  if (p.is_absentee_owner === true) {
    absPts = w.absenteeMax;
    factors.push({
      label: "Absentee owner",
      points: Math.round(absPts * 10) / 10,
      detail: `is_absentee_owner is true → +${w.absenteeMax} (absentee max for this mode).`,
    });
  } else {
    factors.push({
      label: "Absentee owner",
      points: 0,
      detail: `is_absentee_owner is ${p.is_absentee_owner == null ? "null" : "false"} — no absentee points.`,
    });
  }

  const daysRaw = toFiniteNumber(p.days_vacant);
  const days = Math.max(0, daysRaw ?? 0);
  const dvPts = Math.min(distressCap, (days / 365) * distressCap);
  factors.push({
    label: vacantLabel,
    points: Math.round(dvPts * 10) / 10,
    detail:
      daysRaw == null
        ? "days_vacant is null — treated as 0 days; linear ramp to max over 365 days."
        : `days_vacant=${days}; up to ${distressCap} pts linear to 365 days.`,
  });

  factors.push({
    label: "Vacancy status (recorded)",
    points: 0,
    detail: `vacancy_status="${p.vacancy_status ?? "unknown"}" — recorded for context; scoring uses days_vacant (and mode weights).`,
  });

  const units = toFiniteNumber(p.unit_count);
  let ucPts = 0;
  const inUnitBand =
    units != null && units >= w.unitMin && units <= w.unitMax;
  if (inUnitBand) {
    ucPts = unitCap;
    factors.push({
      label: unitLabel,
      points: Math.round(ucPts * 10) / 10,
      detail: `unit_count=${units} — within ${w.unitMin}–${w.unitMax} → +${unitCap}.`,
    });
  } else {
    factors.push({
      label: unitLabel,
      points: 0,
      detail:
        units == null
          ? `unit_count is null — outside ${w.unitMin}–${w.unitMax} band.`
          : `unit_count=${units} — outside ${w.unitMin}–${w.unitMax} — no unit bonus.`,
    });
  }

  const mv = toFiniteNumber(p.market_value);
  let mvPts = 0;
  if (mv != null && mv >= w.marketValueMin && mv <= w.marketValueMax) {
    mvPts = w.marketValuePoints;
    factors.push({
      label: "Market value",
      points: Math.round(mvPts * 10) / 10,
      detail: `market_value=${formatCurrency(mv)} — within range → +${w.marketValuePoints}.`,
    });
  } else {
    factors.push({
      label: "Market value",
      points: 0,
      detail:
        mv == null
          ? "market_value is null — no MV bonus."
          : `market_value=${formatCurrency(mv)} — outside configured range — no MV bonus.`,
    });
  }

  let pmPts = 0;
  const pen = w.professionallyManagedPenalty;
  if (p.is_professionally_managed === true) {
    pmPts = pen;
    factors.push({
      label: "Professionally managed",
      points: Math.round(pmPts * 10) / 10,
      detail: `is_professionally_managed is true — penalty ${pen}.`,
    });
  } else {
    factors.push({
      label: "Professionally managed",
      points: 0,
      detail:
        p.is_professionally_managed === false
          ? "is_professionally_managed is false — no penalty."
          : "is_professionally_managed is null/unknown — no penalty (SQL only penalizes IS TRUE).",
    });
  }

  const raw = absPts + dvPts + ucPts + mvPts + pmPts;
  const rawSum = Math.round(Math.max(0, raw) * 10) / 10;
  const computedTotal = normalizeRawToScore(raw, w.rawMax);

  return { computedTotal, rawSum, factors };
}

/** Mode-adjusted 0–100 score (DB column remains Postgres baseline). */
export function getDisplayScore(
  p: Partial<Parcel>,
  mode: ScoringMode,
  bundle: ScoringWeightsBundle
): number {
  const weights = weightsForMode(bundle, mode);
  return computeDesirabilityBreakdown(p, { mode, weights }).computedTotal;
}

/**
 * Compact one-line summary for drawers and tooltips, e.g.
 * "+25 absentee, +14.2 vacancy, +15 units, +10 value, −20 PM".
 */
export function formatScoreSummaryLine(factors: ScoreFactor[]): string {
  if (factors.some((f) => f.label === "Do not contact")) {
    return "Score set to 0 (do not contact)";
  }

  const short = (label: string) => {
    switch (label) {
      case "Absentee owner":
        return "absentee";
      case "Days vacant":
      case "Vacancy":
        return "vacancy";
      case "Distress":
        return "distress";
      case "Unit count":
      case "Unit sweet spot":
        return "units";
      case "Small multi":
        return "small multi";
      case "Market value":
        return "value";
      case "Professionally managed":
        return "PM";
      default:
        return label;
    }
  };

  const parts = factors
    .filter((f) => {
      if (f.label === "Vacancy status (recorded)") return false;
      return Math.abs(f.points) > 0.0001;
    })
    .map((f) => {
      const p = f.points;
      const rounded =
        Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p) : Math.round(p * 10) / 10;
      const sign = rounded > 0 ? "+" : "";
      return `${sign}${rounded} ${short(f.label)}`;
    });

  return parts.length ? parts.join(", ") : "No scoring points applied (see breakdown below)";
}

/** Table / badge styling: 🟢 85+, 🟡 60–84, 🔴 &lt;60 */
export function scoreColor(score: number): string {
  if (score >= 85) return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (score >= 60) return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-red-100 text-red-900 border-red-300";
}

export function desirabilityTierEmoji(score: number): "🟢" | "🟡" | "🔴" {
  if (score >= 85) return "🟢";
  if (score >= 60) return "🟡";
  return "🔴";
}

export function formatVacancy(v: string | null | undefined): string {
  switch (v) {
    case "occupied":
      return "Occupied";
    case "partially_vacant":
      return "Partially vacant";
    case "vacant_long":
      return "Long vacant";
    default:
      return "Unknown";
  }
}

export function formatContactStatus(s: string | null | undefined): string {
  switch (s) {
    case "not_contacted":
      return "Not contacted";
    case "contacted":
      return "Contacted";
    case "follow_up":
      return "Follow up";
    case "do_not_contact":
      return "Do not contact";
    default:
      return "—";
  }
}
