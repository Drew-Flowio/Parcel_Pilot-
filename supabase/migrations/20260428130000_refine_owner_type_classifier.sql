-- Refine owner_type classifier: catch LP, COOP, CO-OP, TRUST, APARTMENT, PLAZA, TOWERS,
-- BANK, HOSPITAL, UNIVERSITY, CHURCH and many more so LLCs and institutions aren't
-- being labeled "individual" anymore.
--
-- Recreates portfolio_groups MV + dependent parcels_intel view.

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

revoke all on public.portfolio_groups from anon, authenticated;
grant select on public.portfolio_groups to service_role;

-- Recreate parcels_intel (cascade dropped it when we dropped portfolio_groups)
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

-- Lower Top 500 PM threshold to 60 (live data rarely exceeds 70 until days_vacant is populated)
update public.lead_segments set criteria = jsonb_set(criteria, '{min_score_v2}', '60') where slug = 'top_500_pm';
