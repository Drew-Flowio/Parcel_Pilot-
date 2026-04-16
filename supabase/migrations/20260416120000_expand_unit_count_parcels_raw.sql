-- Derive unit_count for more Hennepin PR_TYP_NM1 values (most APARTMENT rows still null until a unit field exists in source).
-- Recreate MV + dependent view.

create extension if not exists "uuid-ossp";

drop view if exists public.parcels;

drop materialized view if exists public.parcels_raw;

create materialized view public.parcels_raw as
select
  uuid_generate_v5(
    '6f9619ff-8b86-d011-b42d-00cf4fc964ff'::uuid,
    'hennepin-parcel:'::text || trim(both from p."PID")
  ) as id,
  trim(both from coalesce(
    nullif(trim(both from p."OWNER_NM"), ''::text),
    nullif(trim(both from p."TAXPAYER_NM"), ''::text),
    'Unknown'::text
  )) as owner_name,
  (
    (trim(both ' '::text from concat_ws(
      ' '::text,
      nullif(trim(both from p."HOUSE_NO"), ''::text),
      nullif(trim(both from p."FRAC_HOUSE_NO"), ''::text),
      nullif(trim(both from p."STREET_NM"), ''::text)
    )) || ', '::text) || trim(both from p."MUNIC_NM")
  ) || ', MN '::text || trim(both from p."ZIP_CD") as property_address,
  (trim(both from p."MAILING_MUNIC_NM") || ', MN '::text) || trim(both from p."ZIP_CD") as mailing_address,
  nullif(trim(both from p."MUNIC_NM"), ''::text) as city,
  'MN'::text as state,
  nullif(trim(both from p."ZIP_CD"), ''::text) as zip,
  nullif(trim(both from p."ABBREV_ADDN_NM"), ''::text) as neighborhood,
  case
    when trim(both from p."BUILD_YR") ~ '^[0-9]{4}$'::text
      and trim(both from p."BUILD_YR")::integer >= 1600
      and trim(both from p."BUILD_YR")::integer <= extract(year from now())::integer
    then trim(both from p."BUILD_YR")::integer
    else null::integer
  end as year_built,
  case
    when nullif(
      trim(both from replace(replace(p."MKT_VAL_TOT", ','::text, ''::text), ' '::text, ''::text)),
      ''::text
    ) ~ '^[0-9]+(\.[0-9]+)?$'::text
    then trim(both from replace(replace(p."MKT_VAL_TOT", ','::text, ''::text), ' '::text, ''::text))::numeric
    else null::numeric
  end as market_value,
  case
    when trim(both from p."SALE_DATE") ~ '^[0-9]{6}$'::text
    then to_date(trim(both from p."SALE_DATE"), 'YYYYMM'::text)
    else null::date
  end as last_sale_date,
  case
    when nullif(trim(both from p."MAILING_MUNIC_NM"), ''::text) is null then null::boolean
    when lower(trim(both from p."MAILING_MUNIC_NM")) <> lower(trim(both from p."MUNIC_NM")) then true
    else false
  end as is_absentee_owner,
  case upper(trim(both from coalesce(p."PR_TYP_NM1", ''::text)))
    when 'TRIPLEX'::text then 3
    when 'RESIDENTIAL-TWO UNIT'::text then 2
    when 'RESIDENTIAL-THREE UNIT'::text then 3
    when 'RESIDENTIAL-FOUR UNIT'::text then 4
    when 'FOUR UNIT'::text then 4
    when 'FOUR-PLEX'::text then 4
    when 'FOUR PLEX'::text then 4
    when '4-PLEX'::text then 4
    when '4 PLEX'::text then 4
    when 'QUADPLEX'::text then 4
    when 'QUAD UNIT'::text then 4
    else null::integer
  end as unit_count,
  'unknown'::text as vacancy_status,
  null::integer as days_vacant,
  null::text as management_company_name,
  null::boolean as is_professionally_managed
from public."Hennepin Parcels" p
where
  (upper(trim(both from coalesce(p."PR_TYP_NM1", ''::text))) = any (array[
    'APARTMENT'::text,
    'LOW INCOME RENTAL'::text,
    'RESIDENTIAL-TWO UNIT'::text,
    'TRIPLEX'::text,
    'COMMERCIAL-PREFERRED'::text,
    'COMMERCIAL-NON PREFERRED'::text,
    'INDUSTRIAL-PREFERRED'::text,
    'INDUSTRIAL-NON PREFERRED'::text,
    'COOPERATIVE HOUSING'::text,
    'MED/CARE FACILITY'::text,
    'MOBILE HOME PARK'::text,
    'VACANT LAND-APARTMENT'::text
  ]))
  and case
    when nullif(
      trim(both from replace(replace(p."MKT_VAL_TOT", ','::text, ''::text), ' '::text, ''::text)),
      ''::text
    ) ~ '^[0-9]+(\.[0-9]+)?$'::text
    then trim(both from replace(replace(p."MKT_VAL_TOT", ','::text, ''::text), ' '::text, ''::text))::numeric
    else 0::numeric
  end >= 150000::numeric
  and not upper(
    (coalesce(trim(both from p."OWNER_NM"), ''::text) || ' '::text)
    || coalesce(trim(both from p."TAXPAYER_NM"), ''::text)
  ) ~ '.*(CITY OF|COUNTY OF|STATE OF|PARK BOARD|SCHOOL DISTRICT|MINNESOTA HOUSING|HOUSING AND REDEVELOPMENT|METROPOLITAN COUNCIL|MET COUNCIL|DEPARTMENT OF NATURAL|UNITED STATES|U\.S\. GOVERNMENT).*'::text;

create unique index parcels_raw_id_uidx on public.parcels_raw (id);
create index parcels_raw_market_value_idx on public.parcels_raw (market_value desc nulls last);
create index parcels_raw_unit_count_idx on public.parcels_raw (unit_count);
create index parcels_raw_absentee_idx on public.parcels_raw (is_absentee_owner);
create index parcels_raw_contact_proxy_idx on public.parcels_raw (vacancy_status);

comment on materialized view public.parcels_raw is
  'Filtered Hennepin multifamily slice. Refresh after GIS import: REFRESH MATERIALIZED VIEW CONCURRENTLY public.parcels_raw;';

revoke all on public.parcels_raw from anon, authenticated;
grant select on public.parcels_raw to service_role;

create view public.parcels as
select
  raw.id,
  raw.owner_name,
  o.owner_phone,
  o.owner_email,
  raw.property_address,
  raw.mailing_address,
  raw.city,
  raw.state,
  raw.zip,
  raw.neighborhood,
  raw.year_built,
  raw.market_value,
  raw.last_sale_date,
  raw.is_absentee_owner,
  raw.unit_count,
  raw.vacancy_status,
  raw.days_vacant,
  raw.management_company_name,
  raw.is_professionally_managed,
  o.last_contacted_at,
  o.contacted_via,
  coalesce(o.contact_status, 'not_contacted'::text) as contact_status,
  o.contact_notes,
  calculate_desirability_score(
    raw.is_absentee_owner,
    raw.vacancy_status,
    raw.days_vacant,
    raw.unit_count,
    raw.market_value,
    raw.is_professionally_managed,
    coalesce(o.contact_status, 'not_contacted'::text)
  ) as desirability_score,
  '1970-01-01 00:00:00+00'::timestamptz as created_at,
  '1970-01-01 00:00:00+00'::timestamptz as updated_at
from public.parcels_raw raw
left join public.parcel_pilot_overrides o on o.parcel_id = raw.id;

grant select on public.parcels to anon, authenticated, service_role;
