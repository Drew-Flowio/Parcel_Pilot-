-- ================================================================
-- Parcel Pilot — Supabase schema (V1, no auth, no RLS)
-- ================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- parcels table
-- ----------------------------------------------------------------
create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),

  owner_name              text not null,
  owner_phone             text,
  owner_email             text,

  property_address        text not null,
  mailing_address         text,
  city                    text,
  state                   text,
  zip                     text,
  neighborhood            text,
  year_built              integer,

  market_value            numeric,
  last_sale_date          date,

  is_absentee_owner       boolean default false,
  unit_count              integer,

  vacancy_status          text default 'unknown'
    check (vacancy_status in ('occupied','partially_vacant','vacant_long','unknown')),
  days_vacant             integer,

  management_company_name text,
  is_professionally_managed boolean,

  last_contacted_at       timestamptz,
  contacted_via           text check (contacted_via in ('sms','email','call','mail') or contacted_via is null),
  contact_status          text not null default 'not_contacted'
    check (contact_status in ('not_contacted','contacted','follow_up','do_not_contact')),
  contact_notes           text,

  desirability_score      numeric default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists parcels_score_idx          on public.parcels (desirability_score desc);
create index if not exists parcels_market_value_idx   on public.parcels (market_value desc);
create index if not exists parcels_unit_count_idx     on public.parcels (unit_count);
create index if not exists parcels_contact_status_idx on public.parcels (contact_status);
create index if not exists parcels_absentee_idx       on public.parcels (is_absentee_owner);

-- ----------------------------------------------------------------
-- Desirability scoring function (0–100)
-- ----------------------------------------------------------------
-- PM weights (max raw 70, scaled to 100): absentee 25, days_vacant up to 20,
-- units 4–80 +15, market $150k–$5M +10, professionally managed -20.
-- p_vacancy_status kept for signature compatibility with views (unused in formula).
create or replace function public.calculate_desirability_score(
  p_is_absentee_owner       boolean,
  p_vacancy_status          text,
  p_days_vacant             integer,
  p_unit_count              integer,
  p_market_value            numeric,
  p_is_professionally_managed boolean,
  p_contact_status          text
) returns numeric
language plpgsql
immutable
as $$
declare
  raw     numeric := 0;
  abs_pts numeric := 0;
  dv_pts  numeric := 0;
  uc_pts  numeric := 0;
  mv_pts  numeric := 0;
  pm_pts  numeric := 0;
begin
  if p_contact_status = 'do_not_contact' then
    return 0;
  end if;

  if p_is_absentee_owner is true then
    abs_pts := 25;
  end if;

  dv_pts := least(
    20::numeric,
    (greatest(coalesce(p_days_vacant, 0), 0)::numeric / 365.0) * 20
  );

  if p_unit_count is not null and p_unit_count between 4 and 80 then
    uc_pts := 15;
  end if;

  if p_market_value is not null and p_market_value between 150000 and 5000000 then
    mv_pts := 10;
  end if;

  if p_is_professionally_managed is true then
    pm_pts := -20;
  end if;

  raw := abs_pts + dv_pts + uc_pts + mv_pts + pm_pts;
  if raw < 0 then
    raw := 0;
  end if;

  return round(least(100::numeric, (raw / 70.0) * 100), 1);
end;
$$;

-- ----------------------------------------------------------------
-- Trigger: keep desirability_score and updated_at fresh
-- ----------------------------------------------------------------
create or replace function public.parcels_before_write()
returns trigger
language plpgsql
as $$
begin
  -- Auto-derive absentee flag if mailing != property and not explicitly set
  if new.mailing_address is not null
     and new.property_address is not null
     and new.is_absentee_owner is null then
    new.is_absentee_owner := (lower(trim(new.mailing_address)) <> lower(trim(new.property_address)));
  end if;

  new.desirability_score := public.calculate_desirability_score(
    new.is_absentee_owner,
    new.vacancy_status,
    new.days_vacant,
    new.unit_count,
    new.market_value,
    new.is_professionally_managed,
    new.contact_status
  );

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists parcels_before_write_trg on public.parcels;
create trigger parcels_before_write_trg
  before insert or update on public.parcels
  for each row execute function public.parcels_before_write();

-- ----------------------------------------------------------------
-- Optional: a few sample rows so the dashboard isn't empty on first run
-- ----------------------------------------------------------------
insert into public.parcels (owner_name, owner_phone, owner_email, property_address, mailing_address, city, state, zip, market_value, unit_count, vacancy_status, days_vacant, is_professionally_managed)
values
  ('Sterling Holdings LLC', '612-555-0142', 'contact@sterlingholdings.test', '2410 Lyndale Ave S, Minneapolis, MN', '88 Wall St, New York, NY', 'Minneapolis', 'MN', '55405', 3200000, 24, 'partially_vacant', 95, false),
  ('Marta Reyes',          '651-555-0177', null,                              '714 Selby Ave, Saint Paul, MN',     '714 Selby Ave, Saint Paul, MN', 'Saint Paul', 'MN', '55104', 680000, 6, 'vacant_long', 220, null),
  ('NorthLoop Capital',    null,           'invest@northloop.test',          '212 N 1st St, Minneapolis, MN',     '500 Park Ave, Chicago, IL',     'Minneapolis', 'MN', '55401', 12500000, 64, 'occupied', null, false),
  ('Eleanor Quinn',        '612-555-0199', null,                              '1840 Hennepin Ave, Minneapolis, MN','1840 Hennepin Ave, Minneapolis, MN','Minneapolis','MN','55403', 425000, 1, 'occupied', null, true),
  ('Cedar Ridge Trust',    '763-555-0188', 'trust@cedarridge.test',          '99 Cedar Lake Rd, Minneapolis, MN', 'PO Box 4421, Wayzata, MN',      'Minneapolis', 'MN', '55416', 2150000, 18, 'partially_vacant', 60, false)
on conflict do nothing;
