import type { ParcelFilters } from "./types";

/** Server-side `order()` keys — must match `public.parcels` columns. */
export const PARCEL_SORT_OPTIONS: {
  value: NonNullable<ParcelFilters["sort"]>;
  label: string;
}[] = [
  { value: "desirability_score", label: "Desirability Score" },
  { value: "market_value", label: "Market Value" },
  { value: "unit_count", label: "Unit Count" },
  { value: "days_vacant", label: "Days Vacant" },
  { value: "last_contacted_at", label: "Last Contacted" },
  { value: "created_at", label: "Created Date" },
];

export const PARCEL_SORT_KEYS = PARCEL_SORT_OPTIONS.map((o) => o.value);
