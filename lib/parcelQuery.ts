import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePageSize } from "./pagination";
import { buildParcelSearchOrClause, normalizeParcelSearch } from "./parcelSearch";
import { PARCEL_SORT_KEYS } from "./parcelSortOptions";
import type {
  ContactStatus,
  ParcelFilters,
  PortfolioGroupBy,
  ScoringMode,
  VacancyStatus,
  ViewSlice,
} from "./types";

const VACANCY_VALUES: VacancyStatus[] = [
  "occupied",
  "partially_vacant",
  "vacant_long",
  "unknown",
];
const CONTACT_VALUES: ContactStatus[] = [
  "not_contacted",
  "contacted",
  "follow_up",
  "do_not_contact",
];

export function parseFilters(
  sp: URLSearchParams | Record<string, string | string[] | undefined>
): ParcelFilters {
  const get = (k: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const getAll = (k: string): string[] => {
    if (sp instanceof URLSearchParams) return sp.getAll(k);
    const v = sp[k];
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  };

  const rawView = get("view") || "top";
  const view =
    rawView === "small_juicy"
      ? "honorable_mentions"
      : ((rawView as ViewSlice) || "top");
  const num = (k: string) => {
    const v = get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const vacancy = getAll("vacancy").filter((v): v is VacancyStatus =>
    (VACANCY_VALUES as string[]).includes(v)
  );
  const contactStatus = getAll("contact").filter((v): v is ContactStatus =>
    (CONTACT_VALUES as string[]).includes(v)
  );

  const rawSort = get("sort");
  const sort: ParcelFilters["sort"] =
    rawSort != null &&
    (PARCEL_SORT_KEYS as string[]).includes(rawSort)
      ? (rawSort as ParcelFilters["sort"])
      : "desirability_score";

  const rawGroupBy = get("groupBy");
  const groupBy: PortfolioGroupBy =
    rawGroupBy === "mailing" ? "mailing" : "owner";

  const scoringMode: ScoringMode =
    get("scoringMode") === "flipper" ? "flipper" : "pm";

  return {
    view: (
      ["top", "high_value", "honorable_mentions"] as ViewSlice[]
    ).includes(view)
      ? view
      : "top",
    search: normalizeParcelSearch(get("q")),
    portfolio: get("portfolio") === "1",
    groupBy,
    scoringMode,
    minValue: num("minValue"),
    maxValue: num("maxValue"),
    minUnits: num("minUnits"),
    maxUnits: num("maxUnits"),
    absentee: (get("absentee") as ParcelFilters["absentee"]) || "all",
    vacancy: vacancy.length ? vacancy : undefined,
    minDaysVacant: num("minDaysVacant"),
    contactStatus: contactStatus.length ? contactStatus : undefined,
    sort,
    page: num("page") ?? 1,
    pageSize: resolvePageSize(num("pageSize")),
  };
}

/** Strip UI-only fields before SQL (`applyFilters`). */
export function filtersForQuery(f: ParcelFilters): ParcelFilters {
  const { portfolio: _po, groupBy: _gb, scoringMode: _sm, ...rest } = f;
  return rest;
}

/** Apply filters + view slice to a Supabase query. */
export function applyFilters(
  client: SupabaseClient,
  filters: ParcelFilters,
  options: { count?: boolean; range?: [number, number] } = {}
) {
  filters = filtersForQuery(filters);
  let q = client
    .from("parcels")
    .select(
      "*",
      options.count ? { count: "estimated" } : undefined
    );

  // View slice presets
  if (filters.view === "high_value") {
    q = q
      .gte("market_value", filters.minValue ?? 750_000)
      .eq("is_absentee_owner", true)
      .or("is_professionally_managed.is.null,is_professionally_managed.eq.false");
  }

  if (filters.view === "honorable_mentions") {
    q = q.gte("unit_count", 4).lte("unit_count", 80);
  }

  // Generic filters (also applied on top of the slice)
  if (filters.minValue != null && filters.view !== "high_value") {
    q = q.gte("market_value", filters.minValue);
  }
  if (filters.maxValue != null) q = q.lte("market_value", filters.maxValue);
  // Unit min/max only when the user sets them — no implicit cap on any view (incl. Small Buildings).
  if (filters.minUnits != null) {
    q = q.gte("unit_count", filters.minUnits);
  }
  if (filters.maxUnits != null) {
    q = q.lte("unit_count", filters.maxUnits);
  }

  if (filters.absentee === "only" && filters.view !== "high_value") {
    q = q.eq("is_absentee_owner", true);
  } else if (filters.absentee === "owner_occupied") {
    q = q.eq("is_absentee_owner", false);
  }

  if (filters.vacancy && filters.vacancy.length) {
    q = q.in("vacancy_status", filters.vacancy);
  }
  if (filters.minDaysVacant != null) {
    q = q.gte("days_vacant", filters.minDaysVacant);
  }
  if (filters.contactStatus && filters.contactStatus.length) {
    q = q.in("contact_status", filters.contactStatus);
  }

  const searchOr = filters.search
    ? buildParcelSearchOrClause(filters.search)
    : null;
  if (searchOr) {
    q = q.or(searchOr);
  }

  // Sort
  const sortKey = filters.sort ?? "desirability_score";
  q = q.order(sortKey, { ascending: false, nullsFirst: false });
  if (sortKey !== "desirability_score") {
    q = q.order("desirability_score", { ascending: false, nullsFirst: false });
  }

  if (options.range) q = q.range(options.range[0], options.range[1]);

  return q;
}
