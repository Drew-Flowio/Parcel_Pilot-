-- ================================================================
-- Writable parcels view + vacancy overrides + SOS scoring boost
-- ----------------------------------------------------------------
-- 1. Overrides gain vacancy_status / days_vacant / vacancy_noted_at.
-- 2. `parcels` view coalesces overrides so user edits persist across
--    MV refreshes.
-- 3. INSTEAD OF trigger routes INSERT/UPDATE/DELETE on the view to
--    `parcel_pilot_overrides` (previously the view was not writable -
--    drawer/contact edits were failing silently).
-- 4. scoring_v2 takes a `p_sos_resolved` flag (+5 contactability bump
--    once an entity has a resolved registered agent in sos_intel).
-- 5. `sos_agent_portfolios` enriched with parcel_count / total_value
--    so the Agent Intelligence card on the dashboard is useful on day 1.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Vacancy override columns
-- ----------------------------------------------------------------
alter table public.parcel_pilot_overrides
  add column if not exists days_vacant integer,
  add column if not exists vacancy_status text,
  add column if not exists vacancy_noted_at timestamptz;

alter table public.parcel_pilot_overrides
  drop constraint if exists parcel_pilot_overrides_vacancy_status_check;
alter table public.parcel_pilot_overrides
  add constraint parcel_pilot_overrides_vacancy_status_check
  check (
    vacancy_status is null
    or vacancy_status in ('occupied','partially_vacant','vacant_long','unknown')
  );

create index if not exists parcel_pilot_overrides_vacancy_idx
  on public.parcel_pilot_overrides (vacancy_status);
create index if not exists parcel_pilot_overrides_days_vacant_idx
  on public.parcel_pilot_overrides (days_vacant);

-- ----------------------------------------------------------------
-- 2. Rebuild parcels view with vacancy coalesce
-- ----------------------------------------------------------------
drop view if exists public.parcels_intel cascade;
drop view if exists public.parcels cascade;

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
  coalesce(o.vacancy_status, raw.vacancy_status) as vacancy_status,
  coalesce(o.days_vacant, raw.days_vacant) as days_vacant,
  o.vacancy_noted_at,
  raw.management_company_name,
  raw.is_professionally_managed,
  o.last_contacted_at,
  o.contacted_via,
  coalesce(o.contact_status, 'not_contacted'::text) as contact_status,
  o.contact_notes,
  public.calculate_desirability_score(
    raw.is_absentee_owner,
    coalesce(o.vacancy_status, raw.vacancy_status),
    coalesce(o.days_vacant, raw.days_vacant),
    raw.unit_count,
    raw.market_value,
    raw.is_professionally_managed,
    coalesce(o.contact_status, 'not_contacted'::text)
  ) as desirability_score,
  '1970-01-01 00:00:00+00'::timestamptz as created_at,
  coalesce(o.updated_at, '1970-01-01 00:00:00+00'::timestamptz) as updated_at
from public.parcels_raw raw
left join public.parcel_pilot_overrides o on o.parcel_id = raw.id;

grant select on public.parcels to anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- 3. INSTEAD OF triggers — route writes to overrides table
-- ----------------------------------------------------------------
create or replace function public.parcels_view_instead_of_update()
returns trigger language plpgsql as $$
begin
  insert into public.parcel_pilot_overrides (
    parcel_id,
    owner_phone,
    owner_email,
    contact_status,
    contact_notes,
    last_contacted_at,
    contacted_via,
    days_vacant,
    vacancy_status,
    vacancy_noted_at,
    updated_at
  )
  values (
    new.id,
    new.owner_phone,
    new.owner_email,
    new.contact_status,
    new.contact_notes,
    new.last_contacted_at,
    new.contacted_via,
    new.days_vacant,
    new.vacancy_status,
    case
      when (new.days_vacant is distinct from old.days_vacant)
        or (new.vacancy_status is distinct from old.vacancy_status)
      then now()
      else new.vacancy_noted_at
    end,
    now()
  )
  on conflict (parcel_id) do update set
    owner_phone        = excluded.owner_phone,
    owner_email        = excluded.owner_email,
    contact_status     = excluded.contact_status,
    contact_notes      = excluded.contact_notes,
    last_contacted_at  = excluded.last_contacted_at,
    contacted_via      = excluded.contacted_via,
    days_vacant        = excluded.days_vacant,
    vacancy_status     = excluded.vacancy_status,
    vacancy_noted_at   = excluded.vacancy_noted_at,
    updated_at         = now();
  return new;
end;
$$;

create or replace function public.parcels_view_instead_of_insert()
returns trigger language plpgsql as $$
begin
  -- Inserts are treated as upserts on overrides (source of truth for raw
  -- parcel rows is the MV, which is populated from "Hennepin Parcels").
  insert into public.parcel_pilot_overrides (
    parcel_id, owner_phone, owner_email, contact_status, contact_notes,
    last_contacted_at, contacted_via, days_vacant, vacancy_status,
    vacancy_noted_at, updated_at
  )
  values (
    new.id, new.owner_phone, new.owner_email, new.contact_status,
    new.contact_notes, new.last_contacted_at, new.contacted_via,
    new.days_vacant, new.vacancy_status,
    case
      when new.days_vacant is not null or new.vacancy_status is not null
      then now() else null
    end,
    now()
  )
  on conflict (parcel_id) do update set
    owner_phone        = excluded.owner_phone,
    owner_email        = excluded.owner_email,
    contact_status     = excluded.contact_status,
    contact_notes      = excluded.contact_notes,
    last_contacted_at  = excluded.last_contacted_at,
    contacted_via      = excluded.contacted_via,
    days_vacant        = excluded.days_vacant,
    vacancy_status     = excluded.vacancy_status,
    vacancy_noted_at   = excluded.vacancy_noted_at,
    updated_at         = now();
  return new;
end;
$$;

create or replace function public.parcels_view_instead_of_delete()
returns trigger language plpgsql as $$
begin
  delete from public.parcel_pilot_overrides where parcel_id = old.id;
  return old;
end;
$$;

drop trigger if exists parcels_view_update on public.parcels;
drop trigger if exists parcels_view_insert on public.parcels;
drop trigger if exists parcels_view_delete on public.parcels;

create trigger parcels_view_update
  instead of update on public.parcels
  for each row execute function public.parcels_view_instead_of_update();

create trigger parcels_view_insert
  instead of insert on public.parcels
  for each row execute function public.parcels_view_instead_of_insert();

create trigger parcels_view_delete
  instead of delete on public.parcels
  for each row execute function public.parcels_view_instead_of_delete();

-- ----------------------------------------------------------------
-- 4. Scoring v2 — add SOS resolved flag
-- ----------------------------------------------------------------
drop function if exists public.calculate_desirability_score_v2(
  boolean, text, integer, integer, numeric, boolean, text, text, integer, numeric, date
);

create or replace function public.calculate_desirability_score_v2(
  p_is_absentee_owner         boolean,
  p_vacancy_status            text,
  p_days_vacant               integer,
  p_unit_count                integer,
  p_market_value              numeric,
  p_is_professionally_managed boolean,
  p_contact_status            text,
  p_owner_type                text,
  p_portfolio_size            integer,
  p_avg_portfolio_value       numeric,
  p_last_sale_date            date,
  p_sos_resolved              boolean default false
) returns numeric
language plpgsql
immutable
as $$
declare
  pm_pts numeric := 0;
  ct_pts numeric := 0;
  pv_pts numeric := 0;
  ur_pts numeric := 0;
  total  numeric := 0;
  days   integer;
begin
  if p_contact_status = 'do_not_contact' then return 0; end if;

  days := greatest(coalesce(p_days_vacant, 0), 0);
  pm_pts := pm_pts + least(15::numeric, (days::numeric / 365.0) * 15.0);
  if p_is_absentee_owner is true then pm_pts := pm_pts + 10; end if;
  if p_unit_count is not null and p_unit_count between 4 and 80 then pm_pts := pm_pts + 10; end if;
  if p_is_professionally_managed is not true then pm_pts := pm_pts + 5; end if;

  if p_owner_type = 'individual' then ct_pts := 30;
  elsif p_owner_type = 'entity' then
    ct_pts := 20;
    if p_sos_resolved is true then ct_pts := ct_pts + 5; end if;
  elsif p_owner_type = 'other' then ct_pts := 10;
  else ct_pts := 0;
  end if;
  ct_pts := least(ct_pts, 30);

  if p_portfolio_size is not null and p_portfolio_size >= 2 then
    if p_portfolio_size >= 10 then pv_pts := 12;
    elsif p_portfolio_size >= 5 then pv_pts := 8;
    else pv_pts := 4;
    end if;
    if coalesce(p_avg_portfolio_value, 0) >= 1000000 then pv_pts := pv_pts + 8;
    elsif coalesce(p_avg_portfolio_value, 0) >= 400000 then pv_pts := pv_pts + 4;
    end if;
  else
    if coalesce(p_market_value, 0) >= 1000000 then pv_pts := 4; end if;
  end if;
  pv_pts := least(pv_pts, 20);

  if p_last_sale_date is null then ur_pts := 5;
  else
    if p_last_sale_date < (current_date - interval '10 years') then ur_pts := 10;
    elsif p_last_sale_date < (current_date - interval '5 years') then ur_pts := 6;
    elsif p_last_sale_date < (current_date - interval '2 years') then ur_pts := 3;
    else ur_pts := 1;
    end if;
  end if;
  if p_vacancy_status = 'vacant_long' or days >= 180 then ur_pts := least(10, ur_pts + 2); end if;

  total := pm_pts + ct_pts + pv_pts + ur_pts;
  if total < 0 then total := 0; end if;
  return round(least(100::numeric, total), 1);
end;
$$;

comment on function public.calculate_desirability_score_v2 is
  'Intelligence score 0-100 (40 PM + 30 contactability + 20 portfolio + 10 urgency). SOS-resolved entities get +5 contactability.';

-- ----------------------------------------------------------------
-- 5. parcels_intel — uses coalesced vacancy + SOS flag
-- ----------------------------------------------------------------
create view public.parcels_intel as
select
  p.*,
  pg.owner_key,
  pg.parcel_count          as owner_portfolio_size,
  pg.total_market_value    as owner_portfolio_value,
  pg.avg_market_value      as owner_avg_market_value,
  pg.owner_type            as owner_type,
  pg.vacant_long_count     as owner_vacant_count,
  pg.absentee_count        as owner_absentee_count,
  si.registered_agent_name as sos_agent_name,
  si.registered_agent_address as sos_agent_address,
  si.lookup_status         as sos_lookup_status,
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
    p.last_sale_date,
    coalesce(si.lookup_status in ('found','manual'), false)
  ) as score_v2
from public.parcels p
left join public.portfolio_groups pg
  on pg.owner_key = upper(regexp_replace(trim(coalesce(p.owner_name, '')), '\s+', ' ', 'g'))
left join public.sos_intel si
  on si.owner_key = pg.owner_key;

revoke all on public.parcels_intel from anon, authenticated;
grant select on public.parcels_intel to service_role;

-- ----------------------------------------------------------------
-- 6. Agent Intelligence view (enriched with portfolio stats)
-- ----------------------------------------------------------------
drop view if exists public.sos_agent_portfolios;

create view public.sos_agent_portfolios as
select
  lower(trim(s.registered_agent_name))     as agent_key,
  s.registered_agent_name,
  s.registered_agent_address,
  count(distinct s.owner_key)::integer     as entity_count,
  coalesce(sum(pg.parcel_count), 0)::integer     as parcel_count,
  coalesce(sum(pg.total_market_value), 0)::numeric as total_market_value,
  coalesce(sum(pg.total_units), 0)::integer      as total_units,
  array_agg(distinct s.owner_key)          as owner_keys
from public.sos_intel s
left join public.portfolio_groups pg on pg.owner_key = s.owner_key
where s.registered_agent_name is not null
  and trim(s.registered_agent_name) <> ''
  and s.lookup_status in ('found', 'manual')
group by 1, s.registered_agent_name, s.registered_agent_address;

revoke all on public.sos_agent_portfolios from anon, authenticated;
grant select on public.sos_agent_portfolios to service_role;
