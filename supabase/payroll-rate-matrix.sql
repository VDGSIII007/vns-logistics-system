-- Payroll trip encoder rate matrix foundation.
-- Run this after supabase/payroll-foundation.sql.

create extension if not exists pgcrypto;

create table if not exists payroll_rate_matrix (
  id uuid primary key default gen_random_uuid(),
  rate_id text unique,
  group_category text,
  source text,
  destination text,
  truck_type text,
  driver_salary numeric default 0,
  helper_salary numeric default 0,
  default_toll numeric default 0,
  default_passway numeric default 0,
  default_parking numeric default 0,
  default_lagay_loaded numeric default 0,
  default_lagay_empty numeric default 0,
  default_mano numeric default 0,
  default_allowance_driver numeric default 0,
  default_allowance_helper numeric default 0,
  default_other_expenses numeric default 0,
  active boolean default true,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists payroll_rate_matrix_rate_id_idx
  on payroll_rate_matrix (rate_id);

create index if not exists payroll_rate_matrix_lookup_idx
  on payroll_rate_matrix (group_category, source, destination, truck_type)
  where active is true;

create table if not exists payroll_trip_lines (
  id uuid primary key default gen_random_uuid(),
  line_id text unique,
  payroll_id text references payroll_records(payroll_id),
  trip_date date,
  date date,
  plate_number text,
  group_category text,
  group_commodity text,
  driver_name text,
  driver text,
  helper_name text,
  helper text,
  source text,
  destination text,
  reference_no text,
  po_number text,
  shipment_number text,
  container_number text,
  trip_type text,
  diesel numeric default 0,
  cost_per_liter numeric default 0,
  per_liter numeric default 0,
  driver_salary numeric default 0,
  bayad_sa_driver numeric default 0,
  helper_salary numeric default 0,
  bayad_sa_helper numeric default 0,
  toll numeric default 0,
  toll_fee numeric default 0,
  passway numeric default 0,
  pass_way numeric default 0,
  parking numeric default 0,
  lagay_loaded numeric default 0,
  lagay_empty numeric default 0,
  mano numeric default 0,
  timbang numeric default 0,
  luna numeric default 0,
  vulcanize numeric default 0,
  allowance_driver numeric default 0,
  allowance_helper numeric default 0,
  truck_wash numeric default 0,
  hugas_truck numeric default 0,
  checkpoint numeric default 0,
  other_expenses numeric default 0,
  row_total numeric default 0,
  rate_id text,
  rate_match_status text,
  remarks text,
  encoded_by text,
  source_module text,
  source_file text,
  status text,
  raw_data jsonb default '{}'::jsonb,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists payroll_trip_lines_payroll_id_idx on payroll_trip_lines (payroll_id);
create index if not exists payroll_trip_lines_trip_date_idx on payroll_trip_lines (trip_date desc);
create index if not exists payroll_trip_lines_date_idx on payroll_trip_lines (date desc);
create index if not exists payroll_trip_lines_plate_number_idx on payroll_trip_lines (plate_number);
create index if not exists payroll_trip_lines_rate_match_status_idx on payroll_trip_lines (rate_match_status);
create index if not exists payroll_trip_lines_source_module_idx on payroll_trip_lines (source_module);
create index if not exists payroll_trip_lines_is_deleted_idx on payroll_trip_lines (is_deleted);
