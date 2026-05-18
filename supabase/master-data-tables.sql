create extension if not exists pgcrypto;

create table if not exists trucks (
  truck_id text primary key,
  plate_number text unique,
  imei text,
  truck_type text,
  truck_make text,
  body_type text,
  trailer_plate text,
  group_category text,
  current_driver_id text,
  current_helper_id text,
  current_driver_name text,
  current_helper_name text,
  dispatcher text,
  status text,
  gps_source text,
  last_known_latitude numeric,
  last_known_longitude numeric,
  last_gps_timestamp timestamptz,
  odometer numeric,
  orcr_status text,
  insurance_expiry date,
  registration_expiry date,
  remarks text,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists drivers (
  driver_id text primary key,
  driver_name text,
  phone_number text,
  gcash_number text,
  license_number text,
  status text,
  remarks text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists helpers (
  helper_id text primary key,
  helper_name text,
  phone_number text,
  gcash_number text,
  status text,
  remarks text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists payees (
  payee_id text primary key,
  payee_name text,
  role text,
  gcash_number text,
  bank_name text,
  account_number text,
  status text,
  remarks text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_trucks_plate_number on trucks (plate_number);
create index if not exists idx_trucks_group_category on trucks (group_category);
create index if not exists idx_trucks_status on trucks (status);
create index if not exists idx_drivers_status on drivers (status);
create index if not exists idx_helpers_status on helpers (status);
create index if not exists idx_payees_name on payees (payee_name);
create index if not exists idx_payees_status on payees (status);
