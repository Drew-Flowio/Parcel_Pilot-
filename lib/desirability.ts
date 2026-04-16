import type { Parcel } from "./types";

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

const RAW_MAX = 70;

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

/** Matches SQL `calculate_desirability_score`: raw points sum to ≤70, then ÷70×100, capped at 100. */
function normalizeRawToScore(raw: number): number {
  const clampedRaw = Math.max(0, raw);
  const scaled = (clampedRaw / RAW_MAX) * 100;
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
 * Mirrors Postgres `calculate_desirability_score` for UI breakdowns.
 * Weights: absentee 25, days_vacant up to 20, units 4–80 +15, MV $150k–$5M +10, professionally managed -20.
 * Note: `vacancy_status` is passed in SQL but not used in the formula — only `days_vacant` affects the vacancy term.
 */
export function computeDesirabilityBreakdown(p: Partial<Parcel>): ScoreBreakdown {
  const factors: ScoreFactor[] = [];

  if (p.contact_status === "do_not_contact") {
    factors.push({
      label: "Do not contact",
      points: 0,
      detail: "contact_status is do_not_contact — score forced to 0 in the database.",
    });
    return { computedTotal: 0, rawSum: 0, factors };
  }

  let absPts = 0;
  if (p.is_absentee_owner === true) {
    absPts = 25;
    factors.push({
      label: "Absentee owner",
      points: 25,
      detail: "is_absentee_owner is true → +25 (full weight toward PM opportunity).",
    });
  } else {
    factors.push({
      label: "Absentee owner",
      points: 0,
      detail: `is_absentee_owner is ${p.is_absentee_owner == null ? "null" : "false"} — no +25 (same as SQL IS TRUE check).`,
    });
  }

  const daysRaw = toFiniteNumber(p.days_vacant);
  const days = Math.max(0, daysRaw ?? 0);
  const dvPts = Math.min(20, (days / 365) * 20);
  factors.push({
    label: "Days vacant",
    points: Math.round(dvPts * 10) / 10,
    detail:
      daysRaw == null
        ? "days_vacant is null — treated as 0 days; linear ramp to 20 pts at 365+ days."
        : `days_vacant=${days}; up to 20 pts linear to 365 days (min(coalesce(days,0)/365×20, 20)).`,
  });

  factors.push({
    label: "Vacancy status (recorded)",
    points: 0,
    detail: `vacancy_status="${p.vacancy_status ?? "unknown"}" — not used in the current SQL formula (only days_vacant affects this bucket).`,
  });

  const units = toFiniteNumber(p.unit_count);
  let ucPts = 0;
  if (units != null && units >= 4 && units <= 80) {
    ucPts = 15;
    factors.push({
      label: "Unit count",
      points: 15,
      detail: `unit_count=${units} — within 4–80 (sweet spot) → +15.`,
    });
  } else {
    factors.push({
      label: "Unit count",
      points: 0,
      detail:
        units == null
          ? "unit_count is null — outside the 4–80 band for scoring."
          : `unit_count=${units} — outside 4–80 — no unit bonus.`,
    });
  }

  const mv = toFiniteNumber(p.market_value);
  let mvPts = 0;
  if (mv != null && mv >= 150_000 && mv <= 5_000_000) {
    mvPts = 10;
    factors.push({
      label: "Market value",
      points: 10,
      detail: `market_value=${formatCurrency(mv)} — within $150k–$5M → +10.`,
    });
  } else {
    factors.push({
      label: "Market value",
      points: 0,
      detail:
        mv == null
          ? "market_value is null — no MV bonus."
          : `market_value=${formatCurrency(mv)} — outside $150k–$5M — no MV bonus.`,
    });
  }

  let pmPts = 0;
  if (p.is_professionally_managed === true) {
    pmPts = -20;
    factors.push({
      label: "Professionally managed",
      points: -20,
      detail: "is_professionally_managed is true — incumbent PM penalty −20.",
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
  const computedTotal = normalizeRawToScore(raw);

  return { computedTotal, rawSum, factors };
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
