-- ================================================================
-- skywalk_rollup_conversations(p_since timestamptz)
-- ----------------------------------------------------------------
-- Re-aggregates skywalk_messages into skywalk_conversations for any
-- conversation that received a new message since `p_since`. Pass NULL
-- for a full re-rollup. Idempotent (ON CONFLICT upsert).
--
-- Returns: number of conversation rows touched.
-- ================================================================

create or replace function public.skywalk_rollup_conversations(
  p_since timestamptz default null
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with touched as (
    select distinct skywalk_conversation_id
    from public.skywalk_messages
    where skywalk_conversation_id is not null
      and (p_since is null or ingested_at > p_since)
  ),
  agg as (
    select
      m.skywalk_conversation_id,
      max(m.skywalk_contact_id)  as skywalk_contact_id,
      max(m.skywalk_property_id) as skywalk_property_id,
      count(*)::int                                                 as message_count,
      count(*) filter (where m.direction = 'inbound')::int          as inbound_count,
      count(*) filter (where m.direction = 'outbound')::int         as outbound_count,
      min(m.occurred_at)                                            as first_message_at,
      max(m.occurred_at)                                            as last_message_at,
      max(m.occurred_at) filter (where m.direction = 'inbound')     as last_inbound_at,
      max(m.occurred_at) filter (where m.direction = 'outbound')    as last_outbound_at
    from public.skywalk_messages m
    where m.skywalk_conversation_id in (select skywalk_conversation_id from touched)
    group by m.skywalk_conversation_id
  ),
  upsert as (
    insert into public.skywalk_conversations as c (
      skywalk_conversation_id, skywalk_contact_id, skywalk_property_id,
      message_count, inbound_count, outbound_count,
      first_message_at, last_message_at, last_inbound_at, last_outbound_at,
      rolled_up_at
    )
    select
      a.skywalk_conversation_id,
      a.skywalk_contact_id,
      a.skywalk_property_id,
      a.message_count,
      a.inbound_count,
      a.outbound_count,
      a.first_message_at,
      a.last_message_at,
      a.last_inbound_at,
      a.last_outbound_at,
      now()
    from agg a
    on conflict (skywalk_conversation_id) do update set
      skywalk_contact_id  = coalesce(excluded.skywalk_contact_id, c.skywalk_contact_id),
      skywalk_property_id = coalesce(excluded.skywalk_property_id, c.skywalk_property_id),
      message_count       = excluded.message_count,
      inbound_count       = excluded.inbound_count,
      outbound_count      = excluded.outbound_count,
      first_message_at    = excluded.first_message_at,
      last_message_at     = excluded.last_message_at,
      last_inbound_at     = excluded.last_inbound_at,
      last_outbound_at    = excluded.last_outbound_at,
      rolled_up_at        = now()
    returning 1
  )
  select count(*)::int into v_count from upsert;
  return coalesce(v_count, 0);
end;
$$;

comment on function public.skywalk_rollup_conversations(timestamptz) is
  'Recompute skywalk_conversations rollup for any conversation that received new messages since p_since (NULL = full re-rollup). Idempotent.';

-- Seed cursor rows (so workers always have a row to claim).
insert into public.skywalk_sync_cursors (resource) values
  ('messages'), ('contacts'), ('properties')
on conflict (source, resource) do nothing;
