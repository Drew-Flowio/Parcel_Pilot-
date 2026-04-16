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

/**
 * Mirrors the SQL `calculate_desirability_score` function exactly.
 * Used for UI breakdowns and any client-side recalculation.
 */
export function computeDesirabilityBreakdown(p: Partial<Parcel>): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  let score = 0;

  // 1. Absentee
  if (p.is_absentee_owner === true) {
    score += 25;
    factors.push({
      label: "Absentee owner",
      points: 25,
      detail: "Mailing address differs from property address.",
    });
  } else {
    factors.push({
      label: "Owner-occupied",
      points: 0,
      detail: "Owner lives at the property — less likely to need management.",
    });
  }

  // 2. Vacancy
  let vacancyPts = 0;
  if (p.vacancy_status === "vacant_long") vacancyPts = 20;
  else if (p.vacancy_status === "partially_vacant") vacancyPts = 12;
  else if (p.vacancy_status === "occupied") vacancyPts = 2;
  if (vacancyPts) {
    score += vacancyPts;
    factors.push({
      label: `Vacancy: ${formatVacancy(p.vacancy_status)}`,
      points: vacancyPts,
      detail: "Vacancy = pain = an opening for a property manager.",
    });
  }

  if (p.days_vacant != null) {
    let dvPts = 0;
    if (p.days_vacant >= 180) dvPts = 5;
    else if (p.days_vacant >= 60) dvPts = 3;
    if (dvPts) {
      score += dvPts;
      factors.push({
        label: `${p.days_vacant} days vacant`,
        points: dvPts,
        detail: "Long-vacant properties bleed cash — owner is motivated.",
      });
    }
  }

  // 3. Unit count
  if (p.unit_count != null) {
    let uPts = 0;
    let detail = "";
    if (p.unit_count >= 4 && p.unit_count <= 80) {
      uPts = 20;
      detail = "Sweet spot for a mid-sized PM company.";
    } else if (p.unit_count >= 2 && p.unit_count <= 3) {
      uPts = 8;
      detail = "Small multifamily — winnable but lower fee revenue.";
    } else if (p.unit_count === 1) {
      uPts = -5;
      detail = "Single-family — usually not worth a PM contract.";
    } else if (p.unit_count >= 81 && p.unit_count <= 150) {
      uPts = 10;
      detail = "Large building — operationally heavier.";
    } else if (p.unit_count > 150) {
      uPts = 2;
      detail = "Institutional-scale, likely already managed.";
    }
    score += uPts;
    factors.push({
      label: `${p.unit_count} unit${p.unit_count === 1 ? "" : "s"}`,
      points: uPts,
      detail,
    });
  }

  // 4. Market value
  if (p.market_value != null) {
    let mvPts = 0;
    let detail = "";
    if (p.market_value >= 500000 && p.market_value <= 8_000_000) {
      mvPts = 15;
      detail = "Ideal value range for sustainable management fees.";
    } else if (p.market_value >= 200000 && p.market_value < 500000) {
      mvPts = 8;
      detail = "Below ideal but workable.";
    } else if (p.market_value > 8_000_000 && p.market_value <= 25_000_000) {
      mvPts = 6;
      detail = "Higher value — strong revenue but more competition.";
    } else if (p.market_value < 200000) {
      mvPts = -5;
      detail = "Probably too small to justify a PM contract.";
    } else {
      mvPts = 1;
      detail = "Institutional-scale; hard to win against incumbent firms.";
    }
    score += mvPts;
    factors.push({
      label: `Market value ${formatCurrency(p.market_value)}`,
      points: mvPts,
      detail,
    });
  }

  // 5. Professionally managed
  if (p.is_professionally_managed === false) {
    score += 15;
    factors.push({
      label: "Not professionally managed",
      points: 15,
      detail: "No incumbent to displace — direct opportunity.",
    });
  } else if (p.is_professionally_managed == null) {
    score += 8;
    factors.push({
      label: "Management status unknown",
      points: 8,
      detail: "Worth investigating before outreach.",
    });
  } else {
    score -= 10;
    factors.push({
      label: "Already professionally managed",
      points: -10,
      detail: "Incumbent in place — uphill battle.",
    });
  }

  // 6. Contact status
  if (p.contact_status === "do_not_contact") {
    factors.push({
      label: "Do not contact",
      points: -score,
      detail: "Marked do-not-contact — score reset to zero.",
    });
    return { total: 0, factors };
  }
  if (p.contact_status === "follow_up") {
    score += 3;
    factors.push({
      label: "Follow-up due",
      points: 3,
      detail: "Small bump — already in motion.",
    });
  }

  const total = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  return { total, factors };
}

export function scoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 55) return "bg-accent-100 text-accent-800 border-accent-200";
  if (score >= 35) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-ink-100 text-ink-600 border-ink-200";
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
