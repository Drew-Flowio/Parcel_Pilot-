import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LeadSegment,
  Parcel,
  PortfolioGroupRow,
  SosAgentPortfolio,
} from "./types";

/** Normalize owner name the same way `portfolio_groups.owner_key` does in SQL. */
export function ownerKeyFromName(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Criteria payload for lead segments (stored in `lead_segments.criteria` jsonb). */
export interface LeadSegmentCriteria {
  min_score?: number;
  max_score?: number;
  min_score_v2?: number;
  min_days_vacant?: number;
  min_market_value?: number;
  max_market_value?: number;
  min_units?: number;
  max_units?: number;
  absentee?: "all" | "only" | "owner_occupied";
  owner_types?: Array<"individual" | "entity" | "institutional" | "other">;
  min_portfolio_size?: number;
  max_portfolio_size?: number;
  min_portfolio_value?: number;
  sale_after?: string; // YYYY-MM-DD
  sale_before?: string;
  exclude_professionally_managed?: boolean;
  sort?:
    | "score_v2"
    | "score"
    | "portfolio_value"
    | "portfolio_size"
    | "market_value"
    | "last_sale_date_desc";
  limit?: number;
}

export function parseSegmentCriteria(raw: unknown): LeadSegmentCriteria {
  if (!raw || typeof raw !== "object") return {};
  return raw as LeadSegmentCriteria;
}

/** Apply `LeadSegmentCriteria` to a `parcels_intel` query. */
export function applySegmentCriteria(
  client: SupabaseClient,
  criteria: LeadSegmentCriteria,
  options: { count?: boolean; range?: [number, number] } = {}
) {
  let q = client
    .from("parcels_intel")
    .select("*", options.count ? { count: "estimated" } : undefined);

  if (criteria.min_score_v2 != null) q = q.gte("score_v2", criteria.min_score_v2);
  if (criteria.min_score != null) q = q.gte("desirability_score", criteria.min_score);
  if (criteria.max_score != null) q = q.lte("desirability_score", criteria.max_score);
  if (criteria.min_days_vacant != null) q = q.gte("days_vacant", criteria.min_days_vacant);
  if (criteria.min_market_value != null) q = q.gte("market_value", criteria.min_market_value);
  if (criteria.max_market_value != null) q = q.lte("market_value", criteria.max_market_value);
  if (criteria.min_units != null) q = q.gte("unit_count", criteria.min_units);
  if (criteria.max_units != null) q = q.lte("unit_count", criteria.max_units);
  if (criteria.absentee === "only") q = q.eq("is_absentee_owner", true);
  if (criteria.absentee === "owner_occupied") q = q.eq("is_absentee_owner", false);
  if (criteria.owner_types?.length) q = q.in("owner_type", criteria.owner_types);
  if (criteria.min_portfolio_size != null) q = q.gte("owner_portfolio_size", criteria.min_portfolio_size);
  if (criteria.max_portfolio_size != null) q = q.lte("owner_portfolio_size", criteria.max_portfolio_size);
  if (criteria.min_portfolio_value != null) q = q.gte("owner_portfolio_value", criteria.min_portfolio_value);
  if (criteria.sale_after) q = q.gte("last_sale_date", criteria.sale_after);
  if (criteria.sale_before) q = q.lte("last_sale_date", criteria.sale_before);
  if (criteria.exclude_professionally_managed) {
    q = q.or("is_professionally_managed.is.null,is_professionally_managed.eq.false");
  }

  switch (criteria.sort) {
    case "portfolio_value":
      q = q.order("owner_portfolio_value", { ascending: false, nullsFirst: false });
      break;
    case "portfolio_size":
      q = q.order("owner_portfolio_size", { ascending: false, nullsFirst: false });
      break;
    case "market_value":
      q = q.order("market_value", { ascending: false, nullsFirst: false });
      break;
    case "last_sale_date_desc":
      q = q.order("last_sale_date", { ascending: false, nullsFirst: false });
      break;
    case "score":
      q = q.order("desirability_score", { ascending: false, nullsFirst: false });
      break;
    case "score_v2":
    default:
      q = q.order("score_v2", { ascending: false, nullsFirst: false });
      break;
  }

  if (criteria.limit) {
    const from = options.range?.[0] ?? 0;
    const hardLimit = Math.min(criteria.limit - from, options.range ? options.range[1] - from + 1 : criteria.limit);
    if (options.range) {
      q = q.range(from, Math.min(options.range[1], criteria.limit - 1));
    } else {
      q = q.limit(hardLimit);
    }
  } else if (options.range) {
    q = q.range(options.range[0], options.range[1]);
  }

  return q;
}

export async function fetchSegment(
  client: SupabaseClient,
  slug: string
): Promise<LeadSegment | null> {
  const { data, error } = await client
    .from("lead_segments")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as LeadSegment | null) ?? null;
}

export async function fetchAllSegments(
  client: SupabaseClient
): Promise<LeadSegment[]> {
  const { data, error } = await client
    .from("lead_segments")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LeadSegment[];
}

export async function fetchTopPortfolios(
  client: SupabaseClient,
  {
    limit = 20,
    minParcels = 2,
    orderBy = "total_market_value",
  }: { limit?: number; minParcels?: number; orderBy?: "total_market_value" | "parcel_count" } = {}
): Promise<PortfolioGroupRow[]> {
  const { data, error } = await client
    .from("portfolio_groups")
    .select("*")
    .gte("parcel_count", minParcels)
    .order(orderBy, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PortfolioGroupRow[];
}

function numFromJson(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Homepage / intelligence dashboard aggregate stats (all parcel-grain where noted). */
export interface IntelligenceDashboardSummary {
  totalParcels: number;
  topTargets: number;
  /** Mirrors `lead_segments.top_500_pm.criteria.min_score_v2` (fallback 60). */
  topTargetMinScoreV2: number;
  portfolios: number;
  /** Parcels whose owner is classified `entity` (shown as “LLC / Entity”). */
  llcs: number;
  /** Parcels whose owner is classified `individual`. */
  individuals: number;
  institutions: number;
  absentee: number;
  /** Sum of Hennepin `MKT_VAL_TOT` across all rows in `parcels_raw` — full cohort, each parcel once. */
  aggregateMarketValue: number;
  sosResolved: number;
  sosPending: number;
  /** Sum of non-null `unit_count` on assessor-derived rows (many parcels still null). */
  sumUnitCountAssessed: number;
  parcelsWithKnownUnits: number;
  /** Parcels with owner_type not in entity/individual/institutional or null PG join. */
  parcels_other: number;
}

export async function fetchIntelligenceSummary(
  client: SupabaseClient
): Promise<IntelligenceDashboardSummary> {
  const { data, error } = await client.rpc("parcel_pilot_dashboard_metrics");
  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    throw new Error(
      "parcel_pilot_dashboard_metrics returned no data — apply migration 20260509120000_dashboard_metrics_source_of_truth.sql"
    );
  }

  return {
    totalParcels: Math.trunc(numFromJson(row.total_parcels)),
    topTargets: Math.trunc(numFromJson(row.top_targets)),
    topTargetMinScoreV2: numFromJson(row.top_target_min_score_v2),
    portfolios: Math.trunc(numFromJson(row.portfolios_2plus)),
    llcs: Math.trunc(numFromJson(row.parcels_entity)),
    individuals: Math.trunc(numFromJson(row.parcels_individual)),
    institutions: Math.trunc(numFromJson(row.parcels_institutional)),
    absentee: Math.trunc(numFromJson(row.absentee_parcels)),
    aggregateMarketValue: numFromJson(row.sum_assessed_market_value),
    sosResolved: Math.trunc(numFromJson(row.sos_resolved)),
    sosPending: Math.trunc(numFromJson(row.sos_pending)),
    sumUnitCountAssessed: Math.trunc(numFromJson(row.sum_unit_count_assessed)),
    parcelsWithKnownUnits: Math.trunc(numFromJson(row.parcels_with_known_units)),
    parcels_other: Math.trunc(numFromJson(row.parcels_other)),
  };
}

export async function fetchTopAgents(
  client: SupabaseClient,
  { limit = 8 }: { limit?: number } = {}
): Promise<SosAgentPortfolio[]> {
  const { data, error } = await client
    .from("sos_agent_portfolios")
    .select("*")
    .order("parcel_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SosAgentPortfolio[];
}

/** Pretty label for owner_type; used across cards and leaderboards. */
export function ownerTypeLabel(t: Parcel["owner_type"] | null | undefined): string {
  switch (t) {
    case "individual":
      return "Individual";
    case "entity":
      return "LLC / Entity";
    case "institutional":
      return "Institutional";
    default:
      return "Other";
  }
}
