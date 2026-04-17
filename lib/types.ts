export type VacancyStatus =
  | "occupied"
  | "partially_vacant"
  | "vacant_long"
  | "unknown";

export type ContactStatus =
  | "not_contacted"
  | "contacted"
  | "follow_up"
  | "do_not_contact";

export type ContactedVia = "sms" | "email" | "call" | "mail" | null;

export interface Parcel {
  id: string;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  property_address: string;
  mailing_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  year_built: number | null;
  market_value: number | null;
  last_sale_date: string | null;
  is_absentee_owner: boolean | null;
  unit_count: number | null;
  vacancy_status: VacancyStatus;
  days_vacant: number | null;
  management_company_name: string | null;
  is_professionally_managed: boolean | null;
  last_contacted_at: string | null;
  contacted_via: ContactedVia;
  contact_status: ContactStatus;
  contact_notes: string | null;
  desirability_score: number;
  created_at: string;
  updated_at: string;
  /** Intelligence layer (present when fetched from `parcels_intel`). */
  score_v2?: number | null;
  owner_key?: string | null;
  owner_type?: OwnerType | null;
  owner_portfolio_size?: number | null;
  owner_portfolio_value?: number | null;
  owner_avg_market_value?: number | null;
  owner_vacant_count?: number | null;
  owner_absentee_count?: number | null;
  sos_agent_name?: string | null;
  sos_agent_address?: string | null;
  sos_lookup_status?: SosLookupStatus | null;
}

export type OwnerType = "individual" | "entity" | "institutional" | "other";

export type SosLookupStatus = "pending" | "found" | "not_found" | "error" | "manual";

export interface PortfolioGroupRow {
  owner_key: string;
  owner_name_display: string;
  parcel_count: number;
  total_market_value: number;
  avg_market_value: number;
  total_units: number;
  avg_units: number;
  absentee_count: number;
  vacant_long_count: number;
  most_recent_sale_date: string | null;
  primary_mailing_address: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_zip: string | null;
  owner_type: OwnerType;
}

export interface LeadSegment {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  criteria: Record<string, unknown>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface SosIntelRow {
  id: string;
  owner_key: string;
  business_name: string | null;
  filing_type: string | null;
  status: string | null;
  file_number: string | null;
  registered_agent_name: string | null;
  registered_agent_address: string | null;
  principal_office_address: string | null;
  organizer_name: string | null;
  formation_date: string | null;
  last_renewal_date: string | null;
  jurisdiction: string | null;
  source_url: string | null;
  lookup_status: SosLookupStatus;
  lookup_error: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ViewSlice = "top" | "high_value" | "honorable_mentions";

/** Portfolio tree grouping dimension (URL: `groupBy=owner` | `groupBy=mailing`). */
export type PortfolioGroupBy = "owner" | "mailing";

/** Scoring preset from URL `scoringMode=pm|flipper` (weights in `app_settings`). */
export type ScoringMode = "pm" | "flipper";

/**
 * Workspace mode — maps to `ViewSlice` for list queries (`lib/cockpitMode.ts`).
 *
 * **Product focus:** property-management lead gen (PM companies, portfolios, small multifamily).
 * **`flipper_mode`:** reserved for a future investor/flip workflow; type + mapping stay in place,
 * but the mode is not shown in the UI until we build that slice.
 */
export type CockpitMode =
  | "top_targets"
  | "high_value_pm"
  | "small_buildings"
  | "flipper_mode"
  | "portfolio_view";

export interface ParcelFilters {
  view: ViewSlice;
  /** URL `q` — matches owner, addresses, management company, notes (case-insensitive). */
  search?: string;
  minValue?: number;
  maxValue?: number;
  minUnits?: number;
  maxUnits?: number;
  absentee?: "all" | "only" | "owner_occupied";
  vacancy?: VacancyStatus[];
  minDaysVacant?: number;
  contactStatus?: ContactStatus[];
  sort?:
    | "desirability_score"
    | "market_value"
    | "unit_count"
    | "days_vacant"
    | "last_contacted_at"
    | "created_at";
  page?: number;
  pageSize?: number;
  /** URL: `portfolio=1` — tree layout; does not affect SQL (stripped in `filtersForQuery`). */
  portfolio?: boolean;
  groupBy?: PortfolioGroupBy;
  /** URL: `scoringMode=flipper` — UI score uses flipper weights (DB column stays PM baseline). */
  scoringMode?: ScoringMode;
}
