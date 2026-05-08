-- Add parcel-level repeat-owner coverage for dashboard gauges:
-- sum(parcel_count) over owners with 2+ parcels = every parcel on a "portfolio" owner.

create or replace function public.parcel_pilot_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with threshold as (
    select coalesce(
      (
        select (ls.criteria->>'min_score_v2')::numeric
        from public.lead_segments ls
        where ls.slug = 'top_500_pm'
        limit 1
      ),
      60::numeric
    ) as min_v2
  ),
  raw_agg as (
    select
      count(*)::bigint as total_parcels,
      coalesce(sum(r.market_value), 0)::numeric as sum_assessed_market_value,
      coalesce(sum(r.unit_count) filter (where r.unit_count is not null), 0)::bigint
        as sum_unit_count_known,
      count(*) filter (where r.unit_count is not null)::bigint as parcels_with_known_units
    from public.parcels_raw r
  ),
  intel_agg as (
    select
      count(*) filter (where pi.score_v2 >= (select min_v2 from threshold))::bigint
        as top_targets,
      count(*) filter (where pi.is_absentee_owner is true)::bigint as absentee_parcels,
      count(*) filter (where pi.owner_type = 'entity')::bigint as parcels_entity,
      count(*) filter (where pi.owner_type = 'individual')::bigint as parcels_individual,
      count(*) filter (where pi.owner_type = 'institutional')::bigint
        as parcels_institutional,
      count(*) filter (
        where pi.owner_type is null or pi.owner_type not in ('entity','individual','institutional')
      )::bigint as parcels_other
    from public.parcels_intel pi
  ),
  pg_agg as (
    select
      count(*) filter (where g.parcel_count >= 2)::bigint as portfolios_2plus,
      coalesce(sum(g.parcel_count) filter (where g.parcel_count >= 2), 0)::bigint
        as parcels_repeat_owner,
      count(*) filter (where g.owner_type = 'entity')::bigint as owner_groups_entity,
      count(*) filter (where g.owner_type = 'individual')::bigint as owner_groups_individual,
      count(*) filter (where g.owner_type = 'institutional')::bigint
        as owner_groups_institutional
    from public.portfolio_groups g
  ),
  sos_agg as (
    select
      count(*) filter (where s.lookup_status in ('found', 'manual'))::bigint as sos_found,
      count(*) filter (where s.lookup_status = 'pending')::bigint as sos_pending
    from public.sos_intel s
  )
  select jsonb_build_object(
    'top_target_min_score_v2', (select min_v2 from threshold),
    'total_parcels', (select total_parcels from raw_agg),
    'sum_assessed_market_value', (select sum_assessed_market_value from raw_agg),
    'sum_unit_count_assessed', (select sum_unit_count_known from raw_agg),
    'parcels_with_known_units', (select parcels_with_known_units from raw_agg),
    'top_targets', (select top_targets from intel_agg),
    'portfolios_2plus', (select portfolios_2plus from pg_agg),
    'parcels_repeat_owner', (select parcels_repeat_owner from pg_agg),
    'absentee_parcels', (select absentee_parcels from intel_agg),
    'parcels_entity', (select parcels_entity from intel_agg),
    'parcels_individual', (select parcels_individual from intel_agg),
    'parcels_institutional', (select parcels_institutional from intel_agg),
    'parcels_other', (select parcels_other from intel_agg),
    'owner_groups_entity', (select owner_groups_entity from pg_agg),
    'owner_groups_individual', (select owner_groups_individual from pg_agg),
    'owner_groups_institutional', (select owner_groups_institutional from pg_agg),
    'sos_resolved', (select sos_found from sos_agg),
    'sos_pending', (select sos_pending from sos_agg)
  );
$$;

comment on function public.parcel_pilot_dashboard_metrics is
  'Homepage metrics JSON: adds parcels_repeat_owner (parcels whose owner holds 2+ parcels) for accurate portfolio-coverage gauges.';

grant execute on function public.parcel_pilot_dashboard_metrics() to service_role;
