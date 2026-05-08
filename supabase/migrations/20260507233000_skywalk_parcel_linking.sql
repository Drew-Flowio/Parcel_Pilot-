-- ===========================================================================
-- Skywalk ↔ Hennepin Parcels linkage (the actual "last mile")
-- ---------------------------------------------------------------------------
-- Skywalk gives us conversation/operational data, parcels_raw gives us deep
-- intelligence (score_v2, owner_name, vacancy, sos_intel, contact_status).
-- Until these are linked, the AppFolio push side has no way to act on the
-- parcel intelligence we built.
--
-- This migration installs:
--   1. parcel_address_norm()  – uppercase + strip punctuation + collapse ws
--   2. match_parcel_by_address(text) → uuid     (exact normalized)
--   3. match_parcel_by_contact(phone, email) → (parcel_id, match_field)
--   4. skywalk_contacts.parcel_id + parcel_match_field columns
--   5. BEFORE-trigger on skywalk_properties to auto-link by address
--   6. BEFORE-trigger on skywalk_contacts   to auto-link by phone/email
--   7. Indexes on parcels_raw to make the matchers fast
--   8. Backfill of existing rows
--
-- Design choices:
--   - Auto-link is EXACT-match only to prevent silent bad joins. A future
--     fuzzy reconcile pass can promote candidates manually.
--   - Triggers only fire when the link column is NULL — manual overrides
--     are never overwritten.
--   - Triggers ignore source rows that have no signal (NULL phone+email,
--     or empty normalized_address) so the work stays cheap.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. parcel_address_norm()
-- ---------------------------------------------------------------------------
create or replace function public.parcel_address_norm(p_addr text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_addr is null or btrim(p_addr) = '' then null
    else
      -- uppercase, strip non-alphanumeric (incl. commas, dots), collapse whitespace
      btrim(
        regexp_replace(
          regexp_replace(upper(p_addr), '[^A-Z0-9]+', ' ', 'g'),
          '\s+', ' ', 'g'
        )
      )
  end;
$$;

comment on function public.parcel_address_norm(text) is
  'Canonical address form: uppercase, alphanumeric+single-space, trimmed. Used for cross-system address matching.';

-- ---------------------------------------------------------------------------
-- 2. Indexes on the underlying address & contact stores
-- ---------------------------------------------------------------------------
-- parcels_raw is the source of truth for property_address (Hennepin export).
-- parcel_pilot_overrides is where we store editable owner_phone / owner_email.
-- Both indexes make the per-row trigger work in O(log n) over 31k parcels.
create index if not exists idx_parcels_raw_address_norm
  on public.parcels_raw (parcel_address_norm(property_address));

create index if not exists idx_parcel_overrides_owner_phone_digits
  on public.parcel_pilot_overrides (regexp_replace(coalesce(owner_phone, ''), '\D', '', 'g'))
  where owner_phone is not null;

create index if not exists idx_parcel_overrides_owner_email_lower
  on public.parcel_pilot_overrides (lower(owner_email))
  where owner_email is not null;

-- ---------------------------------------------------------------------------
-- 3. match_parcel_by_address()
-- ---------------------------------------------------------------------------
create or replace function public.match_parcel_by_address(p_normalized_address text)
returns uuid
language sql
stable
parallel safe
as $$
  -- Caller passes us a Skywalk normalized_address. Re-normalize to be safe
  -- (Skywalk side may use a different normalizer). Compare against the
  -- index expression on parcels_raw for an exact O(log n) lookup.
  select id
  from public.parcels_raw
  where parcel_address_norm(property_address) = parcel_address_norm(p_normalized_address)
  limit 1;
$$;

comment on function public.match_parcel_by_address(text) is
  'Returns the parcels_raw.id whose property_address matches (after normalization) the given address. Exact-only — safe for auto-link.';

-- ---------------------------------------------------------------------------
-- 4. match_parcel_by_contact()
-- ---------------------------------------------------------------------------
create or replace function public.match_parcel_by_contact(
  p_phone text,
  p_email text
)
returns table(parcel_id uuid, match_field text)
language sql
stable
parallel safe
as $$
  -- Owner phone/email overrides live in parcel_pilot_overrides, not parcels_raw.
  -- We query that table directly so the indexes below are usable.
  with phone_match as (
    select o.parcel_id as parcel_id, 'phone'::text as match_field
    from public.parcel_pilot_overrides o
    where p_phone is not null
      and length(regexp_replace(p_phone, '\D', '', 'g')) >= 7
      and regexp_replace(coalesce(o.owner_phone, ''), '\D', '', 'g')
          = regexp_replace(p_phone, '\D', '', 'g')
    limit 1
  ),
  email_match as (
    select o.parcel_id as parcel_id, 'email'::text as match_field
    from public.parcel_pilot_overrides o
    where p_email is not null
      and lower(o.owner_email) = lower(btrim(p_email))
    limit 1
  )
  select * from phone_match
  union all
  select * from email_match
  where not exists (select 1 from phone_match)
  limit 1;
$$;

comment on function public.match_parcel_by_contact(text, text) is
  'Match a Skywalk contact (phone first, email fallback) to a Hennepin parcel owner. Returns null when no match.';

-- ---------------------------------------------------------------------------
-- 5. skywalk_contacts: add link columns + index
-- ---------------------------------------------------------------------------
alter table public.skywalk_contacts
  add column if not exists parcel_id uuid,
  add column if not exists parcel_match_field text
    check (parcel_match_field in ('phone', 'email') or parcel_match_field is null);

create index if not exists idx_skywalk_contacts_parcel_id
  on public.skywalk_contacts (parcel_id)
  where parcel_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Auto-link triggers
-- ---------------------------------------------------------------------------
create or replace function public.skywalk_link_property()
returns trigger
language plpgsql
as $$
begin
  -- Only run when no manual link exists. Triggers are BEFORE so we modify
  -- NEW in place; no extra UPDATE required.
  if NEW.parcel_id is null and NEW.normalized_address is not null then
    NEW.parcel_id := public.match_parcel_by_address(NEW.normalized_address);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_skywalk_property_autolink on public.skywalk_properties;
create trigger trg_skywalk_property_autolink
  before insert or update of normalized_address, parcel_id
  on public.skywalk_properties
  for each row execute function public.skywalk_link_property();

create or replace function public.skywalk_link_contact()
returns trigger
language plpgsql
as $$
declare
  m record;
begin
  if NEW.parcel_id is null then
    select parcel_id, match_field
      into m
      from public.match_parcel_by_contact(NEW.phone, NEW.email);

    if m.parcel_id is not null then
      NEW.parcel_id := m.parcel_id;
      NEW.parcel_match_field := m.match_field;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_skywalk_contact_autolink on public.skywalk_contacts;
create trigger trg_skywalk_contact_autolink
  before insert or update of phone, email, parcel_id
  on public.skywalk_contacts
  for each row execute function public.skywalk_link_contact();

-- ---------------------------------------------------------------------------
-- 7. Backfill existing rows
-- ---------------------------------------------------------------------------
update public.skywalk_properties p
   set parcel_id = public.match_parcel_by_address(p.normalized_address)
 where p.parcel_id is null
   and p.normalized_address is not null;

with matches as (
  select c.id,
         m.parcel_id,
         m.match_field
    from public.skywalk_contacts c
    left join lateral public.match_parcel_by_contact(c.phone, c.email) m on true
   where c.parcel_id is null
)
update public.skywalk_contacts c
   set parcel_id = m.parcel_id,
       parcel_match_field = m.match_field
  from matches m
 where c.id = m.id
   and m.parcel_id is not null;
