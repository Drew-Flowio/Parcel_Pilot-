-- ================================================================
-- Parcel Pilot — Intelligence Engine v2
-- Portfolio grouping, SOS intel, lead segments, scoring v2
-- Layered on top of parcels_raw (MV) + parcel_pilot_overrides + parcels (view).
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Portfolio groups (materialized view of owner-level aggregates)
-- ----------------------------------------------------------------
drop materialized view if exists public.portfolio_groups cascade;

create materialized view public.portfolio_groups as
with base as (
  select
    upper(regexp_replace(trim(coalesce(owner_name, '')), '\s+', ' ', 'g')) as owner_key,
    trim(coalesce(owner_name, '')) as owner_name,
    id,
    market_value,
    unit_count,
    is_absentee_owner,
    days_vacant,
    vacancy_status,
    last_sale_date,
    mailing_address,
    city,
    state,
    zip
  from public.parcels_raw
  where owner_name is not null and owner_name <> ''
)
select
  owner_key,
  (array_agg(owner_name order by market_value desc nulls last))[1] as owner_name_display,
  count(*)::integer as parcel_count,
  coalesce(sum(market_value), 0)::numeric as total_market_value,
  coalesce(avg(market_value), 0)::numeric as avg_market_value,
  coalesce(sum(unit_count), 0)::integer as total_units,
  coalesce(avg(unit_count), 0)::numeric as avg_units,
  count(*) filter (where is_absentee_owner is true)::integer as absentee_count,
  count(*) filter (where vacancy_status = 'vacant_long' or coalesce(days_vacant, 0) >= 90)::integer as vacant_long_count,
  max(last_sale_date) as most_recent_sale_date,
  (array_agg(mailing_address order by market_value desc nulls last) filter (where mailing_address is not null))[1] as primary_mailing_address,
  (array_agg(city order by market_value desc nulls last) filter (where city is not null))[1] as primary_city,
  (array_agg(state order by market_value desc nulls last) filter (where state is not null))[1] as primary_state,
  (array_agg(zip order by market_value desc nulls last) filter (where zip is not null))[1] as primary_zip,
  -- Owner type heuristic (refined in refine_owner_type_classifier migration)
  case
    when owner_key ~ '\y(CITY|COUNTY|SCHOOL|HRA|DEPARTMENT|GOVERNMENT|STATE OF|USA|UNITED STATES|BOARD OF|UNIVERSITY|COLLEGE|HOSPITAL|CHURCH|MINISTRY|DIOCESE|PARISH|TEMPLE|MOSQUE|SYNAGOGUE|HOUSING AUTHORITY|TRANSIT|METRO|METROPOLITAN|PUBLIC|PARK BOARD|LIBRARY|FOUNDATION|NONPROFIT|NON-PROFIT)\y' then 'institutional'
    when owner_key ~ '\y(LLC|LLP|L\.L\.C|LP|L\.P|INC|CORP|CORPORATION|COMPANY|CO\.|TRUST|PARTNERS|PARTNERSHIP|HOLDINGS|PROPERTIES|CAPITAL|EQUITY|GROUP|ASSOC(IATION)?|ASSN|INVESTMENTS|VENTURES|COOP(ERATIVE)?|CO-OP|REALTY|REAL ESTATE|BANK|RENTAL|RENTALS|MANAGEMENT|MGMT|LAND|APARTMENTS|APARTMENT|PLAZA|TOWERS|HOMES|HOUSING|FUND|FAMILY LIMITED|LTD|LIMITED|ENTERPRISES|DEVELOPMENT|LEASING|TELEPHONE|TELECOM|RAILROAD|RAILWAY|COUNTRY CLUB|CLUB)\y' then 'entity'
    when owner_key ~ '\s' then 'individual'
    else 'other'
  end as owner_type
from base
group by owner_key;

create unique index portfolio_groups_owner_key_uidx on public.portfolio_groups (owner_key);
create index portfolio_groups_parcel_count_idx on public.portfolio_groups (parcel_count desc);
create index portfolio_groups_total_value_idx on public.portfolio_groups (total_market_value desc);
create index portfolio_groups_owner_type_idx on public.portfolio_groups (owner_type);

comment on materialized view public.portfolio_groups is
  'Owner-level portfolio aggregates over parcels_raw. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY public.portfolio_groups;';

revoke all on public.portfolio_groups from anon, authenticated;
grant select on public.portfolio_groups to service_role;

-- ----------------------------------------------------------------
-- 2. SOS intel (Minnesota Secretary of State lookups per LLC/entity)
-- ----------------------------------------------------------------
create table if not exists public.sos_intel (
  id uuid primary key default gen_random_uuid(),
  owner_key text unique not null,           -- normalized owner name, matches portfolio_groups.owner_key
  business_name text,                       -- verbatim from SOS
  filing_type text,                         -- LLC, LLP, NONPROFIT, etc.
  status text,                              -- ACTIVE | INACTIVE | DISSOLVED | UNKNOWN
  file_number text,                         -- MN SOS file #
  registered_agent_name text,
  registered_agent_address text,
  principal_office_address text,
  organizer_name text,
  formation_date date,
  last_renewal_date date,
  jurisdiction text default 'MN',
  source_url text,
  lookup_status text not null default 'pending'
    check (lookup_status in ('pending','found','not_found','error','manual')),
  lookup_error text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sos_intel_agent_name_idx on public.sos_intel (lower(registered_agent_name));
create index if not exists sos_intel_agent_address_idx on public.sos_intel (lower(registered_agent_address));
create index if not exists sos_intel_lookup_status_idx on public.sos_intel (lookup_status);

comment on table public.sos_intel is
  'Minnesota SOS business filings data per owner entity. Agent name/address unlocks cross-portfolio discovery.';

create or replace function public.sos_intel_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_intel_touch on public.sos_intel;
create trigger sos_intel_touch
  before update on public.sos_intel
  for each row execute function public.sos_intel_set_updated_at();

revoke all on public.sos_intel from anon, authenticated;
grant select, insert, update on public.sos_intel to service_role;

-- Cross-reference view: agents linked to multiple entities → multi-portfolio discovery
create or replace view public.sos_agent_portfolios as
select
  lower(trim(s.registered_agent_name)) as agent_key,
  s.registered_agent_name,
  s.registered_agent_address,
  count(distinct s.owner_key)::integer as entity_count,
  array_agg(distinct s.owner_key) as owner_keys
from public.sos_intel s
where s.registered_agent_name is not null and trim(s.registered_agent_name) <> ''
group by 1, s.registered_agent_name, s.registered_agent_address
having count(distinct s.owner_key) >= 1;

revoke all on public.sos_agent_portfolios from anon, authenticated;
grant select on public.sos_agent_portfolios to service_role;

-- ----------------------------------------------------------------
-- 3. Lead segments (dynamic filter presets)
-- ----------------------------------------------------------------
create table if not exists public.lead_segments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  description text,
  icon text,
  sort_order integer not null default 100,
  -- Criteria JSON keys (all optional, treated as AND):
  --   min_score, max_score, min_score_v2, min_days_vacant, min_market_value,
  --   max_market_value, min_units, max_units, absentee, owner_types[],
  --   min_portfolio_size, max_portfolio_size, min_portfolio_value,
  --   sale_after, sale_before, sort, limit
  criteria jsonb not null default '{}'::jsonb,
  is_builtin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_segments_sort_idx on public.lead_segments (sort_order);

create or replace function public.lead_segments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lead_segments_touch on public.lead_segments;
create trigger lead_segments_touch
  before update on public.lead_segments
  for each row execute function public.lead_segments_set_updated_at();

revoke all on public.lead_segments from anon, authenticated;
grant select on public.lead_segments to service_role;

insert into public.lead_segments (slug, label, description, icon, sort_order, criteria, is_builtin)
values
  ('top_500_pm', 'Top 500 PM Targets',
   'Highest desirability parcels matched to PM lead-gen criteria.',
   'target', 10,
   jsonb_build_object('min_score_v2', 60, 'sort', 'score_v2', 'limit', 500),
   true),
  ('hot_portfolios', 'Hot Portfolios',
   'Owners with multiple parcels and strong PM signals across their portfolio.',
   'layers', 20,
   jsonb_build_object('min_portfolio_size', 3, 'min_portfolio_value', 1500000, 'sort', 'portfolio_value', 'limit', 200),
   true),
  ('vacant_90_plus', 'Vacant 90+ Days',
   'Parcels sitting vacant long enough to be urgent PM conversations.',
   'clock', 30,
   jsonb_build_object('min_days_vacant', 90, 'sort', 'score_v2', 'limit', 1000),
   true),
  ('new_owners_2025_2026', 'New Owners 2025–2026',
   'Recently transferred parcels — likely in transition, open to new management.',
   'sparkle', 40,
   jsonb_build_object('sale_after', '2025-01-01', 'sort', 'last_sale_date_desc', 'limit', 1000),
   true),
  ('distressed_small_multi', 'Distressed Small Multi',
   '4–20 unit multifamily with vacancy or absentee signals and no pro manager.',
   'fire', 50,
   jsonb_build_object('min_units', 4, 'max_units', 20, 'absentee', 'only', 'min_days_vacant', 30, 'exclude_professionally_managed', true, 'sort', 'score_v2', 'limit', 500),
   true)
on conflict (slug) do update set
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  criteria = excluded.criteria,
  is_builtin = excluded.is_builtin;

-- ----------------------------------------------------------------
-- 4. Scoring v2 — 0..100
-- 40% PM Propensity + 30% Contactability + 20% Portfolio Value + 10% Urgency
-- ----------------------------------------------------------------
create or replace function public.calculate_desirability_score_v2(
  p_is_absentee_owner         boolean,
  p_vacancy_status            text,
  p_days_vacant               integer,
  p_unit_count                integer,
  p_market_value              numeric,
  p_is_professionally_managed boolean,
  p_contact_status            text,
  p_owner_type                text,       -- individual | entity | institutional | other
  p_portfolio_size            integer,    -- # parcels for this owner (>=1)
  p_avg_portfolio_value       numeric,    -- avg MV across the owner's portfolio
  p_last_sale_date            date
) returns numeric
language plpgsql
immutable
as $$
declare
  -- component accumulators (already scaled to their max weight)
  pm_pts    numeric := 0;   -- 0..40
  ct_pts    numeric := 0;   -- 0..30
  pv_pts    numeric := 0;   -- 0..20
  ur_pts    numeric := 0;   -- 0..10
  total     numeric := 0;
  days      integer;
begin
  if p_contact_status = 'do_not_contact' then
    return 0;
  end if;

  -- --- PM Propensity (40%) -----------------------------------------------
  -- vacancy_days (up to 15) × absentee (10) × unit_sweet_spot 4–80 (10) × !pro_mgr (5) = 40
  days := greatest(coalesce(p_days_vacant, 0), 0);
  pm_pts := pm_pts + least(15::numeric, (days::numeric / 365.0) * 15.0);
  if p_is_absentee_owner is true then
    pm_pts := pm_pts + 10;
  end if;
  if p_unit_count is not null and p_unit_count between 4 and 80 then
    pm_pts := pm_pts + 10;
  end if;
  if p_is_professionally_managed is not true then
    pm_pts := pm_pts + 5;
  end if;

  -- --- Contactability (30%) ----------------------------------------------
  -- Individual > simple LLC > nested LLC > institutional
  if p_owner_type = 'individual' then
    ct_pts := 30;
  elsif p_owner_type = 'entity' then
    -- If we already have SOS data (agent resolved) we'd boost; baseline 20.
    ct_pts := 20;
  elsif p_owner_type = 'other' then
    ct_pts := 10;
  else
    ct_pts := 0;  -- institutional
  end if;

  -- --- Portfolio Value (20%) ---------------------------------------------
  -- Scale by portfolio size and avg value.
  if p_portfolio_size is not null and p_portfolio_size >= 2 then
    if p_portfolio_size >= 10 then
      pv_pts := 12;
    elsif p_portfolio_size >= 5 then
      pv_pts := 8;
    else
      pv_pts := 4;
    end if;
    if coalesce(p_avg_portfolio_value, 0) >= 1000000 then
      pv_pts := pv_pts + 8;
    elsif coalesce(p_avg_portfolio_value, 0) >= 400000 then
      pv_pts := pv_pts + 4;
    end if;
  else
    if coalesce(p_market_value, 0) >= 1000000 then
      pv_pts := 4;
    end if;
  end if;
  pv_pts := least(pv_pts, 20);

  -- --- Urgency (10%) -----------------------------------------------------
  -- days_since_last_sale + distress (vacancy signal already in PM)
  if p_last_sale_date is null then
    ur_pts := 5;     -- unknown = mid-urgency
  else
    if p_last_sale_date < (current_date - interval '10 years') then
      ur_pts := 10;
    elsif p_last_sale_date < (current_date - interval '5 years') then
      ur_pts := 6;
    elsif p_last_sale_date < (current_date - interval '2 years') then
      ur_pts := 3;
    else
      ur_pts := 1;
    end if;
  end if;
  -- distress bump: vacant_long or 180+ days vacant
  if p_vacancy_status = 'vacant_long' or days >= 180 then
    ur_pts := least(10, ur_pts + 2);
  end if;

  total := pm_pts + ct_pts + pv_pts + ur_pts;
  if total < 0 then total := 0; end if;
  return round(least(100::numeric, total), 1);
end;
$$;

comment on function public.calculate_desirability_score_v2 is
  'Intelligence score 0–100: 40% PM propensity + 30% contactability + 20% portfolio value + 10% urgency.';

-- ----------------------------------------------------------------
-- 5. parcels_intel view — parcels + portfolio context + score_v2
-- ----------------------------------------------------------------
drop view if exists public.parcels_intel;

create view public.parcels_intel as
select
  p.*,
  pg.owner_key,
  pg.parcel_count as owner_portfolio_size,
  pg.total_market_value as owner_portfolio_value,
  pg.avg_market_value as owner_avg_market_value,
  pg.owner_type as owner_type,
  pg.vacant_long_count as owner_vacant_count,
  pg.absentee_count as owner_absentee_count,
  si.registered_agent_name as sos_agent_name,
  si.registered_agent_address as sos_agent_address,
  si.lookup_status as sos_lookup_status,
  public.calculate_desirability_score_v2(
    p.is_absentee_owner,
    p.vacancy_status,
    p.days_vacant,
    p.unit_count,
    p.market_value,
    p.is_professionally_managed,
    p.contact_status,
    coalesce(pg.owner_type, 'other'),
    coalesce(pg.parcel_count, 1),
    coalesce(pg.avg_market_value, p.market_value),
    p.last_sale_date
  ) as score_v2
from public.parcels p
left join public.portfolio_groups pg
  on pg.owner_key = upper(regexp_replace(trim(coalesce(p.owner_name, '')), '\s+', ' ', 'g'))
left join public.sos_intel si
  on si.owner_key = pg.owner_key;

revoke all on public.parcels_intel from anon, authenticated;
grant select on public.parcels_intel to service_role;

comment on view public.parcels_intel is
  'Parcels + owner portfolio context + SOS agent + score_v2. Source of truth for the Intelligence Dashboard and APIs.';

-- ----------------------------------------------------------------
-- 6. Refresh helper
-- ----------------------------------------------------------------
create or replace function public.refresh_intelligence_views()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.parcels_raw;
  refresh materialized view concurrently public.portfolio_groups;
end;
$$;

revoke all on function public.refresh_intelligence_views() from anon, authenticated;
grant execute on function public.refresh_intelligence_views() to service_role;
