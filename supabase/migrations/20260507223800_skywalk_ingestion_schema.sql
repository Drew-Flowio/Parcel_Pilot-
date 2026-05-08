-- ================================================================
-- Skywalk ingestion schema (production-ready, sync logic NOT included)
-- ----------------------------------------------------------------
-- Tables:
--   skywalk_messages       raw conversation events (append-only)
--   skywalk_conversations  per-conversation rollup (idempotent upsert)
--   skywalk_sync_cursors   per-(source, resource) checkpoint
--   skywalk_properties     property records from Skywalk
--   skywalk_contacts       contact records from Skywalk
--   appfolio_push_log      every outbound push attempt to AppFolio
--   manual_fetch_queue     ad-hoc / retry fetch requests
--
-- Design rules:
--   - One UNIQUE on the upstream id (`skywalk_*_id`) per entity table.
--     Workers `INSERT ... ON CONFLICT (skywalk_*_id) DO UPDATE` for idempotency.
--   - `raw jsonb` on every external entity so new upstream fields never
--     require a migration.
--   - No FKs between Skywalk tables — events frequently arrive before the
--     conversation/property/contact rollup exists.
--   - RLS is enabled with NO policies → only `service_role` (bypass) can
--     touch these tables. The frontend never reads them directly.
--   - Indexes are the minimum to support: dedupe, incremental sync,
--     conversation timeline reads, and worker queue scans.
-- ================================================================

-- ----------------------------------------------------------------
-- Shared `updated_at` trigger (Skywalk-scoped to avoid name clashes)
-- ----------------------------------------------------------------
create or replace function public.skywalk_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 1. skywalk_messages — raw conversation events (append-only)
-- ----------------------------------------------------------------
create table if not exists public.skywalk_messages (
  id                       uuid primary key default gen_random_uuid(),
  skywalk_message_id       text not null,
  skywalk_conversation_id  text,
  skywalk_contact_id       text,
  skywalk_property_id      text,
  direction                text,
  channel                  text,
  sender                   text,
  recipient                text,
  subject                  text,
  body                     text,
  occurred_at              timestamptz,
  raw                      jsonb not null,
  ingested_at              timestamptz not null default now(),
  constraint skywalk_messages_message_id_key unique (skywalk_message_id),
  constraint skywalk_messages_direction_check
    check (direction is null or direction in ('inbound','outbound','system')),
  constraint skywalk_messages_channel_check
    check (channel is null or channel in ('sms','email','voice','chat','note','other'))
);

comment on table public.skywalk_messages is
  'Append-only log of Skywalk conversation message events. Dedupe key: skywalk_message_id.';

-- conversation timeline read (drawer / detail page)
create index if not exists skywalk_messages_conversation_idx
  on public.skywalk_messages (skywalk_conversation_id, occurred_at desc nulls last);

-- contact / property lookup
create index if not exists skywalk_messages_contact_idx
  on public.skywalk_messages (skywalk_contact_id)
  where skywalk_contact_id is not null;

create index if not exists skywalk_messages_property_idx
  on public.skywalk_messages (skywalk_property_id)
  where skywalk_property_id is not null;

-- "what's been ingested since cursor X" → drives the rollup worker
create index if not exists skywalk_messages_ingested_idx
  on public.skywalk_messages (ingested_at desc);

-- ----------------------------------------------------------------
-- 2. skywalk_conversations — per-conversation rollup
-- ----------------------------------------------------------------
create table if not exists public.skywalk_conversations (
  id                       uuid primary key default gen_random_uuid(),
  skywalk_conversation_id  text not null,
  skywalk_contact_id       text,
  skywalk_property_id      text,
  status                   text,
  subject                  text,
  message_count            integer not null default 0,
  inbound_count            integer not null default 0,
  outbound_count           integer not null default 0,
  first_message_at         timestamptz,
  last_message_at          timestamptz,
  last_inbound_at          timestamptz,
  last_outbound_at         timestamptz,
  participants             jsonb,
  tags                     text[],
  rolled_up_at             timestamptz,
  raw                      jsonb,
  inserted_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint skywalk_conversations_conversation_id_key
    unique (skywalk_conversation_id)
);

comment on table public.skywalk_conversations is
  'Idempotent rollup of skywalk_messages. Updated by a worker after each ingest tick.';

create index if not exists skywalk_conversations_last_message_idx
  on public.skywalk_conversations (last_message_at desc nulls last);

create index if not exists skywalk_conversations_contact_idx
  on public.skywalk_conversations (skywalk_contact_id)
  where skywalk_contact_id is not null;

create index if not exists skywalk_conversations_property_idx
  on public.skywalk_conversations (skywalk_property_id)
  where skywalk_property_id is not null;

create index if not exists skywalk_conversations_status_idx
  on public.skywalk_conversations (status)
  where status is not null;

drop trigger if exists skywalk_conversations_set_updated_at on public.skywalk_conversations;
create trigger skywalk_conversations_set_updated_at
  before update on public.skywalk_conversations
  for each row execute function public.skywalk_set_updated_at();

-- ----------------------------------------------------------------
-- 3. skywalk_sync_cursors — per-(source, resource) checkpoint
-- ----------------------------------------------------------------
create table if not exists public.skywalk_sync_cursors (
  id                       uuid primary key default gen_random_uuid(),
  source                   text not null default 'skywalk',
  resource                 text not null,
  cursor_token             text,
  cursor_timestamp         timestamptz,
  last_run_started_at      timestamptz,
  last_run_finished_at     timestamptz,
  last_run_status          text,
  last_run_error           text,
  records_seen             bigint not null default 0,
  inserted_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint skywalk_sync_cursors_source_resource_key
    unique (source, resource),
  constraint skywalk_sync_cursors_status_check
    check (last_run_status is null or last_run_status in ('running','success','error','skipped'))
);

comment on table public.skywalk_sync_cursors is
  'One row per (source, resource). Workers SELECT ... FOR UPDATE on a row to claim a tick.';

drop trigger if exists skywalk_sync_cursors_set_updated_at on public.skywalk_sync_cursors;
create trigger skywalk_sync_cursors_set_updated_at
  before update on public.skywalk_sync_cursors
  for each row execute function public.skywalk_set_updated_at();

-- ----------------------------------------------------------------
-- 4. skywalk_properties
-- ----------------------------------------------------------------
create table if not exists public.skywalk_properties (
  id                       uuid primary key default gen_random_uuid(),
  skywalk_property_id      text not null,
  name                     text,
  address_line1            text,
  address_line2            text,
  city                     text,
  state                    text,
  zip                      text,
  normalized_address       text,
  unit_count               integer,
  status                   text,
  -- Soft link to public.parcels.id (no FK — `parcels` is a view).
  parcel_id                uuid,
  raw                      jsonb not null,
  inserted_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint skywalk_properties_property_id_key unique (skywalk_property_id)
);

comment on table public.skywalk_properties is
  'Property records ingested from Skywalk. parcel_id is a soft pointer into public.parcels.';
comment on column public.skywalk_properties.parcel_id is
  'Soft link to public.parcels.id (Hennepin parcel UUID). Null until address-matched.';

create index if not exists skywalk_properties_normalized_address_idx
  on public.skywalk_properties (normalized_address)
  where normalized_address is not null;

create index if not exists skywalk_properties_parcel_idx
  on public.skywalk_properties (parcel_id)
  where parcel_id is not null;

create index if not exists skywalk_properties_zip_idx
  on public.skywalk_properties (zip)
  where zip is not null;

drop trigger if exists skywalk_properties_set_updated_at on public.skywalk_properties;
create trigger skywalk_properties_set_updated_at
  before update on public.skywalk_properties
  for each row execute function public.skywalk_set_updated_at();

-- ----------------------------------------------------------------
-- 5. skywalk_contacts
-- ----------------------------------------------------------------
create table if not exists public.skywalk_contacts (
  id                       uuid primary key default gen_random_uuid(),
  skywalk_contact_id       text not null,
  first_name               text,
  last_name                text,
  full_name                text,
  -- App layer is responsible for lower-casing email and normalizing phone
  -- (digits-only) before insert so the lookup indexes match the stored form.
  email                    text,
  phone                    text,
  role                     text,
  status                   text,
  primary_property_id      text,
  raw                      jsonb not null,
  inserted_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint skywalk_contacts_contact_id_key unique (skywalk_contact_id)
);

comment on table public.skywalk_contacts is
  'Contact / lead records ingested from Skywalk. App normalizes email (lower) + phone (digits-only) before write.';

create index if not exists skywalk_contacts_email_idx
  on public.skywalk_contacts (email)
  where email is not null;

create index if not exists skywalk_contacts_phone_idx
  on public.skywalk_contacts (phone)
  where phone is not null;

create index if not exists skywalk_contacts_property_idx
  on public.skywalk_contacts (primary_property_id)
  where primary_property_id is not null;

drop trigger if exists skywalk_contacts_set_updated_at on public.skywalk_contacts;
create trigger skywalk_contacts_set_updated_at
  before update on public.skywalk_contacts
  for each row execute function public.skywalk_set_updated_at();

-- ----------------------------------------------------------------
-- 6. appfolio_push_log
-- ----------------------------------------------------------------
create table if not exists public.appfolio_push_log (
  id                       uuid primary key default gen_random_uuid(),
  resource_type            text not null,
  skywalk_resource_id      text not null,
  appfolio_resource_id     text,
  request_payload          jsonb,
  response_payload         jsonb,
  status                   text not null default 'pending',
  http_status              integer,
  error_message            text,
  attempt_count            integer not null default 1,
  attempted_at             timestamptz not null default now(),
  succeeded_at             timestamptz,
  constraint appfolio_push_log_status_check
    check (status in ('pending','success','failure','retrying','skipped')),
  constraint appfolio_push_log_resource_type_check
    check (resource_type in ('lead','contact','note','message','property'))
);

comment on table public.appfolio_push_log is
  'Audit log of every push attempt to AppFolio. Append a row per attempt; status mutates on retry.';

-- "what was the latest push for this Skywalk resource?"
create index if not exists appfolio_push_log_resource_idx
  on public.appfolio_push_log (resource_type, skywalk_resource_id, attempted_at desc);

-- retry worker scan: pending + retrying only
create index if not exists appfolio_push_log_retry_idx
  on public.appfolio_push_log (attempted_at)
  where status in ('pending','retrying');

-- ----------------------------------------------------------------
-- 7. manual_fetch_queue
-- ----------------------------------------------------------------
create table if not exists public.manual_fetch_queue (
  id                       uuid primary key default gen_random_uuid(),
  resource_type            text not null,
  skywalk_resource_id      text not null,
  reason                   text,
  requested_by             text,
  status                   text not null default 'pending',
  attempt_count            integer not null default 0,
  claimed_at               timestamptz,
  claimed_by               text,
  completed_at             timestamptz,
  result                   jsonb,
  error                    text,
  requested_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint manual_fetch_queue_status_check
    check (status in ('pending','in_progress','done','failed','cancelled')),
  constraint manual_fetch_queue_resource_type_check
    check (resource_type in ('message','conversation','contact','property'))
);

comment on table public.manual_fetch_queue is
  'Ad-hoc re-fetch requests (operator-initiated or automated retries).';

-- prevent double-enqueue while one is still in flight
create unique index if not exists manual_fetch_queue_in_flight_uniq
  on public.manual_fetch_queue (resource_type, skywalk_resource_id)
  where status in ('pending','in_progress');

-- worker pull: oldest pending first
create index if not exists manual_fetch_queue_pending_idx
  on public.manual_fetch_queue (requested_at)
  where status = 'pending';

drop trigger if exists manual_fetch_queue_set_updated_at on public.manual_fetch_queue;
create trigger manual_fetch_queue_set_updated_at
  before update on public.manual_fetch_queue
  for each row execute function public.skywalk_set_updated_at();

-- ----------------------------------------------------------------
-- RLS — service_role only (no policies = no anon/authenticated access)
-- ----------------------------------------------------------------
alter table public.skywalk_messages       enable row level security;
alter table public.skywalk_conversations  enable row level security;
alter table public.skywalk_sync_cursors   enable row level security;
alter table public.skywalk_properties     enable row level security;
alter table public.skywalk_contacts       enable row level security;
alter table public.appfolio_push_log      enable row level security;
alter table public.manual_fetch_queue     enable row level security;
