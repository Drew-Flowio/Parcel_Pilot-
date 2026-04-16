-- PM-focused desirability (0–100): components max raw = 70, then scaled to 100.
-- Weights: absentee 25, days_vacant up to 20, units sweet spot +15, MV sweet spot +10, professionally managed -20.

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

  -- days_vacant: linear ramp, full 20 points at 365+ days
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

comment on function public.calculate_desirability_score(boolean, text, integer, integer, numeric, boolean, text) is
  'PM lead score 0–100: absentee 25, days_vacant up to 20, units 4–80 +15, MV $150k–$5M +10, professionally managed -20; normalized from max raw 70.';
