-- Active 2GO Truck Master sample assignments.
-- Depends on supabase/truck-master.sql or supabase/master-data-tables.sql.

insert into trucks (
  truck_id,
  plate_number,
  group_category,
  driver_name,
  helper_name,
  current_driver_name,
  current_helper_name,
  status,
  active,
  remarks,
  created_at,
  updated_at
) values
  (
    'TRK-CCB8126',
    'CCB8126',
    '2GO',
    'Sunny Albador',
    'Reinante Nakunat',
    'Sunny Albador',
    'Reinante Nakunat',
    'Active',
    true,
    'SAMPLE active 2GO truck assignment',
    now(),
    now()
  ),
  (
    'TRK-CDB2822',
    'CDB2822',
    '2GO',
    'Benhar Loresco',
    'Joseph Estranova',
    'Benhar Loresco',
    'Joseph Estranova',
    'Active',
    true,
    'SAMPLE active 2GO truck assignment',
    now(),
    now()
  ),
  (
    'TRK-CDB8651',
    'CDB8651',
    '2GO',
    'Melvin Figueroa',
    'Steven Figueroa',
    'Melvin Figueroa',
    'Steven Figueroa',
    'Active',
    true,
    'SAMPLE active 2GO truck assignment',
    now(),
    now()
  ),
  (
    'TRK-NLC4170',
    'NLC4170',
    '2GO',
    'James Bayona',
    'Unassigned Helper',
    'James Bayona',
    'Unassigned Helper',
    'Active',
    true,
    'SAMPLE active 2GO truck assignment',
    now(),
    now()
  )
on conflict (plate_number) do update set
  group_category = excluded.group_category,
  driver_name = excluded.driver_name,
  helper_name = excluded.helper_name,
  current_driver_name = excluded.current_driver_name,
  current_helper_name = excluded.current_helper_name,
  status = excluded.status,
  active = excluded.active,
  remarks = excluded.remarks,
  created_at = coalesce(trucks.created_at, excluded.created_at),
  updated_at = now();
