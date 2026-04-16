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
-- Weighting philosophy:
--   Absentee ownership ............. up to +25  (out-of-area owners need management)
--   Vacancy signal ................. up to +25  (long-vacant = pain = opportunity)
--   Unit-count sweet spot .......... up to +20  (4–80 units ideal for mid-sized PMs)
--   Market value band .............. up to +15  (avoid trivial AND institutional)
--   Not professionally managed ..... up to +15  (already-managed = wasted outreach)
--   Contact status modifier ........ -100..+0   (DNC zeroes the score)
-- Maximum theoretical raw score = 100. We clamp to [0, 100].
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
  score numeric := 0;
begin
  -- 1. Absentee ownership (up to +25)
  if p_is_absentee_owner is true then
    score := score + 25;
  end if;

  -- 2. Vacancy signal (up to +25)
  if p_vacancy_status = 'vacant_long' then
    score := score + 20;
  elsif p_vacancy_status = 'partially_vacant' then
    score := score + 12;
  elsif p_vacancy_status = 'occupied' then
    score := score + 2;
  end if;

  if p_days_vacant is not null then
    if p_days_vacant >= 180 then
      score := score + 5;
    elsif p_days_vacant >= 60 then
      score := score + 3;
    end if;
  end if;

  -- 3. Unit count sweet spot (up to +20)
  if p_unit_count is not null then
    if p_unit_count between 4 and 80 then
      score := score + 20;
    elsif p_unit_count between 2 and 3 then
      score := score + 8;
    elsif p_unit_count = 1 then
      score := score - 5;
    elsif p_unit_count between 81 and 150 then
      score := score + 10;
    elsif p_unit_count > 150 then
      score := score + 2;
    end if;
  end if;

  -- 4. Market value band (up to +15)
  if p_market_value is not null then
    if p_market_value between 500000 and 8000000 then
      score := score + 15;
    elsif p_market_value between 200000 and 499999 then
      score := score + 8;
    elsif p_market_value between 8000001 and 25000000 then
      score := score + 6;
    elsif p_market_value < 200000 then
      score := score - 5;
    else
      -- > 25M: institutional, hard to win
      score := score + 1;
    end if;
  end if;

  -- 5. Professionally managed penalty / bonus (up to +15)
  if p_is_professionally_managed is false then
    score := score + 15;
  elsif p_is_professionally_managed is null then
    score := score + 8;
  else
    score := score - 10;
  end if;

  -- 6. Contact status modifier
  if p_contact_status = 'do_not_contact' then
    return 0;
  elsif p_contact_status = 'follow_up' then
    score := score + 3;
  end if;

  -- Clamp 0..100
  if score < 0 then score := 0; end if;
  if score > 100 then score := 100; end if;

  return round(score, 1);
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
