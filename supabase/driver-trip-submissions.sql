create extension if not exists pgcrypto;

create table if not exists driver_trip_submissions (
  id uuid primary key default gen_random_uuid(),
  trip_ref_id text unique,
  plate_number text,
  driver_name text,
  helper_name text,
  mobile_number text,
  trip_date date,
  shipment_number text,
  container_number text,
  product_line text,
  source text,
  destination text,
  trip_status text,
  driver_allowance numeric,
  helper_allowance numeric,
  fuel_amount numeric,
  toll_fee numeric,
  parking_fee numeric,
  passway_fee numeric,
  other_expense numeric,
  other_expense_description text,
  delivered_at timestamptz,
  receiver_name text,
  remarks text,
  submission_status text default 'Submitted',
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists driver_trip_submissions_trip_ref_id_idx
  on driver_trip_submissions (trip_ref_id);

create index if not exists driver_trip_submissions_plate_number_idx
  on driver_trip_submissions (plate_number);

create index if not exists driver_trip_submissions_driver_name_idx
  on driver_trip_submissions (driver_name);

create index if not exists driver_trip_submissions_trip_date_idx
  on driver_trip_submissions (trip_date);

create index if not exists driver_trip_submissions_submission_status_idx
  on driver_trip_submissions (submission_status);
