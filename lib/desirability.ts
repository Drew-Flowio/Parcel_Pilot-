import type { Parcel } from "./types";

export interface ScoreFactor {
  label: string;
  points: number;
  detail: string;
}

export interface ScoreBreakdown {
  total: number;
  factors: ScoreFactor[];
}

const RAW_MAX = 70;

/** Matches SQL `calculate_desirability_score`: raw points sum to ≤70, then ÷70×100, capped at 100. */
function normalizeRawToScore(raw: number): number {
  const clampedRaw = Math.max(0, raw);
  const scaled = (clampedRaw / RAW_MAX) * 100;
  return Math.round(Math.min(100, scaled) * 10) / 10;
}

/**
 * Mirrors Postgres `calculate_desirability_score` for UI breakdowns.
 * Weights: absentee 25, days_vacant up to 20, units 4–80 +15, MV $150k–$5M +10, professionally managed -20.
 */
export function computeDesirabilityBreakdown(p: Partial<Parcel>): ScoreBreakdown {
  const factors: ScoreFactor[] = [];

  if (p.contact_status === "do_not_contact") {
    factors.push({
      label: "Do not contact",
      points: 0,
      detail: "Score forced to 0.",
    });
    return { total: 0, factors };
  }

  let absPts = 0;
  if (p.is_absentee_owner === true) {
    absPts = 25;
    factors.push({
      label: "Absentee owner",
      points: 25,
      detail: "Full weight toward PM opportunity.",
    });
  } else {
    factors.push({
      label: "Absentee owner",
      points: 0,
      detail: "Not absentee — no +25.",
    });
  }

  const days = Math.max(0, p.days_vacant ?? 0);
  const dvPts = Math.min(20, (days / 365) * 20);
  factors.push({
    label: "Days vacant",
    points: Math.round(dvPts * 10) / 10,
    detail: `Up to 20 pts; linear to 365 days (${days} days).`,
  });

  let ucPts = 0;
  if (p.unit_count != null && p.unit_count >= 4 && p.unit_count <= 80) {
    ucPts = 15;
    factors.push({
      label: "Unit count",
      points: 15,
      detail: "4–80 units (sweet spot).",
    });
  } else {
    factors.push({
      label: "Unit count",
      points: 0,
      detail: "Outside 4–80 — no unit bonus.",
    });
  }

  let mvPts = 0;
  if (p.market_value != null && p.market_value >= 150_000 && p.market_value <= 5_000_000) {
    mvPts = 10;
    factors.push({
      label: "Market value",
      points: 10,
      detail: "$150k–$5M band.",
    });
  } else {
    factors.push({
      label: "Market value",
      points: 0,
      detail: "Outside $150k–$5M — no MV bonus.",
    });
  }

  let pmPts = 0;
  if (p.is_professionally_managed === true) {
    pmPts = -20;
    factors.push({
      label: "Professionally managed",
      points: -20,
      detail: "Incumbent PM — penalty.",
    });
  } else {
    factors.push({
      label: "Professionally managed",
      points: 0,
      detail: "Not flagged as professionally managed.",
    });
  }

  const raw = absPts + dvPts + ucPts + mvPts + pmPts;
  const total = normalizeRawToScore(raw);

  return { total, factors };
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

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
