create extension if not exists pgcrypto;

create table if not exists cash_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text unique not null,
  request_date date,
  group_name text,
  plate_number text,
  truck_type text,
  driver_name text,
  helper_name text,
  logged_by text,
  request_type text,
  budget_type text,
  amount numeric,
  source text,
  destination text,
  remarks text,
  deposit_needed text,
  receiver_name text,
  deposit_to text,
  account_number text,
  status text default 'Draft',
  approval_status text default 'Pending',
  payment_status text default 'Unpaid',
  approved_by text,
  approved_at timestamptz,
  paid_by text,
  paid_at timestamptz,
  backup_status text default 'pending',
  backup_synced_at timestamptz,
  backup_error text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_deleted boolean default false
);

create table if not exists cash_events (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  event_type text,
  old_status text,
  new_status text,
  actor text,
  notes text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_cash_requests_request_id on cash_requests (request_id);
create index if not exists idx_cash_requests_plate_number on cash_requests (plate_number);
create index if not exists idx_cash_requests_request_type on cash_requests (request_type);
create index if not exists idx_cash_requests_approval_status on cash_requests (approval_status);
create index if not exists idx_cash_requests_payment_status on cash_requests (payment_status);
create index if not exists idx_cash_requests_backup_status on cash_requests (backup_status);
create index if not exists idx_cash_requests_created_at on cash_requests (created_at);
create index if not exists idx_cash_events_request_id on cash_events (request_id);
