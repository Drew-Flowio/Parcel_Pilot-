-- App-level JSON settings (e.g. scoring weights per mode).
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values (
  'scoring_weights',
  jsonb_build_object(
    'pm', jsonb_build_object(
      'rawMax', 75,
      'absenteeMax', 20,
      'vacancyDaysMax', 25,
      'unitSweetSpotMax', 20,
      'unitMin', 4,
      'unitMax', 80,
      'marketValueMin', 150000,
      'marketValueMax', 5000000,
      'marketValuePoints', 10,
      'professionallyManagedPenalty', -20
    ),
    'flipper', jsonb_build_object(
      'rawMax', 80,
      'absenteeMax', 20,
      'vacancyDaysMax', 25,
      'unitSweetSpotMax', 20,
      'distressMax', 30,
      'smallMultiMax', 20,
      'unitMin', 4,
      'unitMax', 80,
      'marketValueMin', 150000,
      'marketValueMax', 5000000,
      'marketValuePoints', 10,
      'professionallyManagedPenalty', -20
    )
  )
) on conflict (key) do nothing;
