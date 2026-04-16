import type { ScoringMode } from "./types";

/**
 * Max raw points per bucket before scaling to 0–100 via `rawMax`.
 * Mirrors rows in `app_settings` (`key = scoring_weights`).
 */
export interface ModeWeights {
  rawMax: number;
  absenteeMax: number;
  /** PM: days vacant linear ramp (0–365 days → max points). */
  vacancyDaysMax: number;
  /** PM: units in [unitMin, unitMax] → up to this many points. */
  unitSweetSpotMax: number;
  unitMin: number;
  unitMax: number;
  marketValueMin: number;
  marketValueMax: number;
  marketValuePoints: number;
  professionallyManagedPenalty: number;
  /** Flipper: replaces `vacancyDaysMax` for the days ramp when set. */
  distressMax?: number;
  /** Flipper: replaces `unitSweetSpotMax` for 4–80 units when set. */
  smallMultiMax?: number;
}

export interface ScoringWeightsBundle {
  pm: ModeWeights;
  flipper: ModeWeights;
}

/** Matches current Postgres `calculate_desirability_score` (baseline stored on rows). */
export const LEGACY_SQL_WEIGHTS: ModeWeights = {
  rawMax: 70,
  absenteeMax: 25,
  vacancyDaysMax: 20,
  unitSweetSpotMax: 15,
  unitMin: 4,
  unitMax: 80,
  marketValueMin: 150_000,
  marketValueMax: 5_000_000,
  marketValuePoints: 10,
  professionallyManagedPenalty: -20,
};

/** Default bundle if DB is empty or invalid (PM / Flipper presets from product). */
export function getDefaultScoringWeightsBundle(): ScoringWeightsBundle {
  return {
    pm: {
      rawMax: 75,
      absenteeMax: 20,
      vacancyDaysMax: 25,
      unitSweetSpotMax: 20,
      unitMin: 4,
      unitMax: 80,
      marketValueMin: 150_000,
      marketValueMax: 5_000_000,
      marketValuePoints: 10,
      professionallyManagedPenalty: -20,
    },
    flipper: {
      rawMax: 80,
      absenteeMax: 20,
      vacancyDaysMax: 25,
      unitSweetSpotMax: 20,
      distressMax: 30,
      smallMultiMax: 20,
      unitMin: 4,
      unitMax: 80,
      marketValueMin: 150_000,
      marketValueMax: 5_000_000,
      marketValuePoints: 10,
      professionallyManagedPenalty: -20,
    },
  };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pickModeWeights(
  raw: Record<string, unknown>,
  key: "pm" | "flipper",
  fallback: ModeWeights
): ModeWeights {
  const o = raw[key];
  if (!o || typeof o !== "object") return { ...fallback };
  const m = o as Record<string, unknown>;
  const merge: ModeWeights = { ...fallback };
  if (isFiniteNum(m.rawMax)) merge.rawMax = m.rawMax;
  if (isFiniteNum(m.absenteeMax)) merge.absenteeMax = m.absenteeMax;
  if (isFiniteNum(m.vacancyDaysMax)) merge.vacancyDaysMax = m.vacancyDaysMax;
  if (isFiniteNum(m.unitSweetSpotMax)) merge.unitSweetSpotMax = m.unitSweetSpotMax;
  if (isFiniteNum(m.unitMin)) merge.unitMin = m.unitMin;
  if (isFiniteNum(m.unitMax)) merge.unitMax = m.unitMax;
  if (isFiniteNum(m.marketValueMin)) merge.marketValueMin = m.marketValueMin;
  if (isFiniteNum(m.marketValueMax)) merge.marketValueMax = m.marketValueMax;
  if (isFiniteNum(m.marketValuePoints)) merge.marketValuePoints = m.marketValuePoints;
  if (isFiniteNum(m.professionallyManagedPenalty))
    merge.professionallyManagedPenalty = m.professionallyManagedPenalty;
  if ("distressMax" in m) {
    if (m.distressMax == null) delete merge.distressMax;
    else if (isFiniteNum(m.distressMax)) merge.distressMax = m.distressMax;
  }
  if ("smallMultiMax" in m) {
    if (m.smallMultiMax == null) delete merge.smallMultiMax;
    else if (isFiniteNum(m.smallMultiMax)) merge.smallMultiMax = m.smallMultiMax;
  }
  return merge;
}

/** Parse JSON from `app_settings.value` for key `scoring_weights`. */
export function parseScoringWeightsPayload(
  value: unknown
): ScoringWeightsBundle | null {
  if (value == null || typeof value !== "object") return null;
  const base = getDefaultScoringWeightsBundle();
  const raw = value as Record<string, unknown>;
  return {
    pm: pickModeWeights(raw, "pm", base.pm),
    flipper: pickModeWeights(raw, "flipper", base.flipper),
  };
}

export function weightsForMode(
  bundle: ScoringWeightsBundle,
  mode: ScoringMode
): ModeWeights {
  return mode === "flipper" ? bundle.flipper : bundle.pm;
}
