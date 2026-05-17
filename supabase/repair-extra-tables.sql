-- Extra Repair module mirror tables for VNS_Repair_Master.
-- Google Sheets remains the backup/source of truth while Supabase is tested.

create table if not exists for_repair_trucks (
  id bigserial primary key,
  source_row_id text unique,
  plate_number text,
  truck_type text,
  driver text,
  helper text,
  issue text,
  repair_details text,
  status text,
  priority text,
  date_reported date,
  date_started date,
  estimated_done date,
  actual_done date,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_deleted boolean default false,
  raw_data jsonb default '{}'::jsonb
);

comment on table for_repair_trucks is
  'Mirror of VNS_Repair_Master.For_Repair_Trucks for current units under repair or unavailable for dispatch.';

create index if not exists idx_for_repair_trucks_plate
on for_repair_trucks (plate_number);

create index if not exists idx_for_repair_trucks_status
on for_repair_trucks (status);

create index if not exists idx_for_repair_trucks_date_reported
on for_repair_trucks (date_reported);

create index if not exists idx_for_repair_trucks_is_deleted
on for_repair_trucks (is_deleted);

create table if not exists completed_repairs (
  id bigserial primary key,
  source_row_id text unique,
  request_id text,
  plate_number text,
  truck_type text,
  driver text,
  helper text,
  repair_type text,
  repair_details text,
  parts_used text,
  labor_details text,
  supplier text,
  mechanic text,
  total_cost numeric,
  date_started date,
  date_completed date,
  status text default 'Completed',
  payment_status text,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_deleted boolean default false,
  raw_data jsonb default '{}'::jsonb
);

comment on table completed_repairs is
  'Mirror of VNS_Repair_Master.Completed_Repairs for completed repair history/archive.';

create index if not exists idx_completed_repairs_request
on completed_repairs (request_id);

create index if not exists idx_completed_repairs_plate
on completed_repairs (plate_number);

create index if not exists idx_completed_repairs_date_completed
on completed_repairs (date_completed);

create index if not exists idx_completed_repairs_payment_status
on completed_repairs (payment_status);

create index if not exists idx_completed_repairs_is_deleted
on completed_repairs (is_deleted);

create table if not exists repair_truck_events (
  id bigserial primary key,
  source_row_id text unique,
  plate_number text,
  event_type text,
  old_status text,
  new_status text,
  notes text,
  actor text,
  event_time timestamptz,
  created_at timestamptz default now(),
  raw_data jsonb default '{}'::jsonb
);

comment on table repair_truck_events is
  'Mirror of VNS_Repair_Master.For_Repair_Truck_Log for for-repair truck status/event history.';

create index if not exists idx_repair_truck_events_plate
on repair_truck_events (plate_number);

create index if not exists idx_repair_truck_events_type
on repair_truck_events (event_type);

create index if not exists idx_repair_truck_events_time
on repair_truck_events (event_time);
