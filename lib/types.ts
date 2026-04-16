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
