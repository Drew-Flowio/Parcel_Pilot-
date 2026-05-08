-- ================================================================
-- Conditional invalidation for skywalk_rollup_thread_days()
-- ----------------------------------------------------------------
-- Production hardening: when the cron runs every 5 min with a 30 min
-- lookback, the same conversation/day gets re-aggregated up to 6 times
-- per message. Previously every re-aggregation unconditionally reset
-- `synced_to_appfolio_at = NULL` and `summary_version = 1`, causing
-- the AppFolio push worker to re-push the same content 6 times.
--
-- This migration makes the reset CONDITIONAL — we only invalidate
-- downstream state when a content-bearing field actually changed.
-- Idempotent re-runs of the rollup over unchanged messages are now
-- effectively no-ops for the push pipeline.
--
-- Fields that count as "content changed":
--   message_count, inbound_count, outbound_count,
--   first_message_at, last_message_at,
--   body_concat, key_points, actions, status,
--   skywalk_contact_id, skywalk_property_id (linkage matters too)
-- ================================================================

create or replace function public.skywalk_rollup_thread_days(
  p_since           timestamptz default null,
  p_conversation_id text        default null,
  p_tz              text        default 'America/Chicago'
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with touched as (
    select distinct
      m.skywalk_conversation_id,
      ((m.occurred_at at time zone p_tz)::date) as rollup_date
    from public.skywalk_messages m
    where m.skywalk_conversation_id is not null
      and m.occurred_at is not null
      and (p_since is null or m.ingested_at > p_since)
      and (p_conversation_id is null or m.skywalk_conversation_id = p_conversation_id)
  ),
  scoped as (
    select
      m.*,
      ((m.occurred_at at time zone p_tz)::date) as _rollup_date
    from public.skywalk_messages m
    join touched t
      on t.skywalk_conversation_id = m.skywalk_conversation_id
     and t.rollup_date = ((m.occurred_at at time zone p_tz)::date)
    where m.occurred_at is not null
  ),
  agg as (
    select
      s.skywalk_conversation_id,
      s._rollup_date,
      max(s.skywalk_contact_id)                                          as skywalk_contact_id,
      max(s.skywalk_property_id)                                         as skywalk_property_id,
      count(*)::int                                                      as message_count,
      count(*) filter (where s.direction = 'inbound')::int               as inbound_count,
      count(*) filter (where s.direction = 'outbound')::int              as outbound_count,
      min(s.occurred_at)                                                 as first_message_at,
      max(s.occurred_at)                                                 as last_message_at,
      max(s.occurred_at) filter (where s.direction = 'inbound')          as last_inbound_at,
      max(s.occurred_at) filter (where s.direction = 'outbound')         as last_outbound_at,
      array_remove(array_agg(distinct s.channel), null)                  as channels,
      string_agg(
        nullif(
          format(
            '[%s%s%s] %s',
            to_char(s.occurred_at at time zone p_tz, 'HH24:MI'),
            case when s.direction is not null then ' ' || s.direction else '' end,
            case when s.channel is not null then '/' || s.channel else '' end,
            coalesce(s.body, '')
          ),
          ''
        ),
        E'\n' order by s.occurred_at
      )                                                                  as body_concat
    from scoped s
    group by s.skywalk_conversation_id, s._rollup_date
  ),
  part as (
    select
      s.skywalk_conversation_id,
      s._rollup_date,
      coalesce(
        jsonb_agg(distinct jsonb_strip_nulls(jsonb_build_object(
          'sender',    s.sender,
          'recipient', s.recipient,
          'channel',   s.channel,
          'direction', s.direction
        ))) filter (where s.sender is not null or s.recipient is not null),
        '[]'::jsonb
      ) as participants
    from scoped s
    group by s.skywalk_conversation_id, s._rollup_date
  ),
  kp as (
    select
      s.skywalk_conversation_id,
      s._rollup_date,
      jsonb_agg(jsonb_build_object(
        'text',        left(s.body, 240),
        'occurred_at', s.occurred_at,
        'direction',   s.direction,
        'channel',     s.channel
      ) order by s.occurred_at desc) as key_points
    from scoped s
    where s.body is not null
      and s.body ~ '\?'
      and length(s.body) between 6 and 1000
    group by s.skywalk_conversation_id, s._rollup_date
  ),
  act as (
    select
      s.skywalk_conversation_id,
      s._rollup_date,
      jsonb_agg(jsonb_build_object(
        'text',        left(s.body, 240),
        'occurred_at', s.occurred_at,
        'direction',   s.direction,
        'keywords',    array_remove(array[
          case when s.body ~* '\m(schedul|book|appointment|tour|showing)'           then 'scheduling'  end,
          case when s.body ~* '\m(sign|lease|application|paperwork|contract)'       then 'paperwork'   end,
          case when s.body ~* '\m(deposit|payment|invoice|balance|past ?due|rent)'  then 'payment'     end,
          case when s.body ~* '\m(call ?back|follow ?up|get back to|circle back)'   then 'followup'    end,
          case when s.body ~* '\m(move ?-?in|move ?-?out|moving)'                   then 'move'        end,
          case when s.body ~* '\m(repair|fix|maintenance|broken|leak|hvac|plumbing)' then 'maintenance' end
        ], null)
      ) order by s.occurred_at desc) as actions
    from scoped s
    where s.body is not null
      and s.body ~* '\m(schedul|book|appointment|tour|showing|sign|lease|application|paperwork|contract|deposit|payment|invoice|balance|past ?due|rent|call ?back|follow ?up|get back to|circle back|move ?-?in|move ?-?out|moving|repair|fix|maintenance|broken|leak|hvac|plumbing)'
    group by s.skywalk_conversation_id, s._rollup_date
  ),
  enriched as (
    select
      a.*,
      coalesce(part.participants, '[]'::jsonb) as participants,
      coalesce(kp.key_points,     '[]'::jsonb) as key_points,
      coalesce(act.actions,       '[]'::jsonb) as actions,
      case
        when a.message_count = 0 then 'active'
        when a.last_inbound_at is not null
             and (a.last_outbound_at is null or a.last_inbound_at > a.last_outbound_at)
          then 'needs_response'
        when a.last_outbound_at is not null
             and (a.last_inbound_at is null or a.last_outbound_at > a.last_inbound_at)
          then 'awaiting_them'
        else 'active'
      end as status,
      format(
        '%s message%s on %s — %s in / %s out%s. Last was %s at %s %s.',
        a.message_count,
        case when a.message_count = 1 then '' else 's' end,
        to_char(a._rollup_date, 'Mon DD, YYYY'),
        a.inbound_count,
        a.outbound_count,
        case
          when a.channels is not null and array_length(a.channels, 1) > 0
          then ' via ' || array_to_string(a.channels, ', ')
          else ''
        end,
        case
          when a.last_inbound_at is null  then 'outbound'
          when a.last_outbound_at is null then 'inbound'
          when a.last_inbound_at > a.last_outbound_at then 'inbound'
          else 'outbound'
        end,
        to_char(
          greatest(
            coalesce(a.last_inbound_at,  '-infinity'::timestamptz),
            coalesce(a.last_outbound_at, '-infinity'::timestamptz)
          ) at time zone p_tz, 'HH24:MI'
        ),
        p_tz
      ) as summary_text
    from agg a
    left join part on part.skywalk_conversation_id = a.skywalk_conversation_id and part._rollup_date = a._rollup_date
    left join kp   on kp.skywalk_conversation_id   = a.skywalk_conversation_id and kp._rollup_date   = a._rollup_date
    left join act  on act.skywalk_conversation_id  = a.skywalk_conversation_id and act._rollup_date  = a._rollup_date
  ),
  upsert as (
    insert into public.skywalk_thread_day_rollups as r (
      skywalk_conversation_id, rollup_date, rollup_tz,
      skywalk_contact_id, skywalk_property_id,
      message_count, inbound_count, outbound_count,
      first_message_at, last_message_at, last_inbound_at, last_outbound_at,
      participants, channels, body_concat,
      summary_text, key_points, actions, status,
      summary_version, summarized_at, summarized_by,
      synced_to_appfolio_at, last_push_reason
    )
    select
      e.skywalk_conversation_id, e._rollup_date, p_tz,
      e.skywalk_contact_id, e.skywalk_property_id,
      e.message_count, e.inbound_count, e.outbound_count,
      e.first_message_at, e.last_message_at, e.last_inbound_at, e.last_outbound_at,
      e.participants, e.channels, e.body_concat,
      e.summary_text, e.key_points, e.actions, e.status,
      1, now(), 'heuristic',
      null, null
    from enriched e
    on conflict (skywalk_conversation_id, rollup_date) do update set
      rollup_tz             = excluded.rollup_tz,
      skywalk_contact_id    = coalesce(excluded.skywalk_contact_id,  r.skywalk_contact_id),
      skywalk_property_id   = coalesce(excluded.skywalk_property_id, r.skywalk_property_id),
      message_count         = excluded.message_count,
      inbound_count         = excluded.inbound_count,
      outbound_count        = excluded.outbound_count,
      first_message_at      = excluded.first_message_at,
      last_message_at       = excluded.last_message_at,
      last_inbound_at       = excluded.last_inbound_at,
      last_outbound_at      = excluded.last_outbound_at,
      participants          = excluded.participants,
      channels              = excluded.channels,
      body_concat           = excluded.body_concat,
      summary_text          = excluded.summary_text,
      key_points            = excluded.key_points,
      actions               = excluded.actions,
      status                = excluded.status,

      -- CONDITIONAL invalidation: only reset summary lineage + push state
      -- when a content-bearing field actually changed. Re-aggregating the
      -- same messages within the lookback window is now a no-op for the
      -- LLM-enrichment job and the AppFolio push worker.
      summary_version = case
        when r.body_concat        is distinct from excluded.body_concat
          or r.message_count      is distinct from excluded.message_count
          or r.last_message_at    is distinct from excluded.last_message_at
          or r.first_message_at   is distinct from excluded.first_message_at
          or r.status             is distinct from excluded.status
          or r.key_points         is distinct from excluded.key_points
          or r.actions            is distinct from excluded.actions
          or r.skywalk_contact_id is distinct from coalesce(excluded.skywalk_contact_id, r.skywalk_contact_id)
          or r.skywalk_property_id is distinct from coalesce(excluded.skywalk_property_id, r.skywalk_property_id)
        then 1
        else r.summary_version
      end,
      summarized_at = case
        when r.body_concat        is distinct from excluded.body_concat
          or r.message_count      is distinct from excluded.message_count
          or r.last_message_at    is distinct from excluded.last_message_at
          or r.first_message_at   is distinct from excluded.first_message_at
          or r.status             is distinct from excluded.status
          or r.key_points         is distinct from excluded.key_points
          or r.actions            is distinct from excluded.actions
          or r.skywalk_contact_id is distinct from coalesce(excluded.skywalk_contact_id, r.skywalk_contact_id)
          or r.skywalk_property_id is distinct from coalesce(excluded.skywalk_property_id, r.skywalk_property_id)
        then now()
        else r.summarized_at
      end,
      summarized_by = case
        when r.body_concat        is distinct from excluded.body_concat
          or r.message_count      is distinct from excluded.message_count
          or r.last_message_at    is distinct from excluded.last_message_at
          or r.first_message_at   is distinct from excluded.first_message_at
          or r.status             is distinct from excluded.status
          or r.key_points         is distinct from excluded.key_points
          or r.actions            is distinct from excluded.actions
          or r.skywalk_contact_id is distinct from coalesce(excluded.skywalk_contact_id, r.skywalk_contact_id)
          or r.skywalk_property_id is distinct from coalesce(excluded.skywalk_property_id, r.skywalk_property_id)
        then 'heuristic'
        else r.summarized_by
      end,
      synced_to_appfolio_at = case
        when r.body_concat        is distinct from excluded.body_concat
          or r.message_count      is distinct from excluded.message_count
          or r.last_message_at    is distinct from excluded.last_message_at
          or r.first_message_at   is distinct from excluded.first_message_at
          or r.status             is distinct from excluded.status
          or r.key_points         is distinct from excluded.key_points
          or r.actions            is distinct from excluded.actions
          or r.skywalk_contact_id is distinct from coalesce(excluded.skywalk_contact_id, r.skywalk_contact_id)
          or r.skywalk_property_id is distinct from coalesce(excluded.skywalk_property_id, r.skywalk_property_id)
        then null
        else r.synced_to_appfolio_at
      end,
      last_push_reason = case
        when r.body_concat        is distinct from excluded.body_concat
          or r.message_count      is distinct from excluded.message_count
          or r.last_message_at    is distinct from excluded.last_message_at
          or r.first_message_at   is distinct from excluded.first_message_at
          or r.status             is distinct from excluded.status
          or r.key_points         is distinct from excluded.key_points
          or r.actions            is distinct from excluded.actions
          or r.skywalk_contact_id is distinct from coalesce(excluded.skywalk_contact_id, r.skywalk_contact_id)
          or r.skywalk_property_id is distinct from coalesce(excluded.skywalk_property_id, r.skywalk_property_id)
        then null
        else r.last_push_reason
      end
      -- appfolio_note_id intentionally NOT touched
    returning 1
  )
  select count(*)::int into v_count from upsert;
  return coalesce(v_count, 0);
end;
$$;

comment on function public.skywalk_rollup_thread_days(timestamptz, text, text) is
  'Re-aggregate skywalk_messages into skywalk_thread_day_rollups. Conditional invalidation: summary_version + synced_to_appfolio_at + last_push_reason are only reset when a content-bearing field actually changed, so the cron may re-run safely without forcing redundant AppFolio pushes. Preserves appfolio_note_id so re-pushes PATCH the existing AppFolio note.';
