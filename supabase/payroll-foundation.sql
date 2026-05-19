-- Payroll foundation tables
-- Run this in Supabase SQL editor.
-- Depends on pgcrypto (already enabled via cash-request-tables.sql).

create extension if not exists pgcrypto;

-- ── payroll_records ──────────────────────────────────────────────────────────
create table if not exists payroll_records (
  id                       uuid primary key default gen_random_uuid(),
  payroll_id               text unique,
  payroll_date             date,
  cutoff_from              date,
  cutoff_to                date,
  group_category           text,
  plate_number             text,
  driver_name              text,
  helper_name              text,
  driver_salary            numeric default 0,
  helper_salary            numeric default 0,
  driver_allowance         numeric default 0,
  helper_allowance         numeric default 0,
  total_expenses           numeric default 0,
  driver_cash_advance      numeric default 0,
  helper_cash_advance      numeric default 0,
  driver_previous_balance  numeric default 0,
  helper_previous_balance  numeric default 0,
  driver_balance_preview   numeric default 0,
  helper_balance_preview   numeric default 0,
  driver_net_pay           numeric default 0,
  helper_net_pay           numeric default 0,
  status                   text default 'Draft',
  approval_status          text default 'Draft',
  payment_status           text default 'Unpaid',
  deposited_at             timestamptz,
  approved_at              timestamptz,
  approved_by              text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  raw_data                 jsonb default '{}'::jsonb,
  is_deleted               boolean default false
);

create index if not exists payroll_records_payroll_date_idx    on payroll_records (payroll_date desc);
create index if not exists payroll_records_plate_number_idx    on payroll_records (plate_number);
create index if not exists payroll_records_group_category_idx  on payroll_records (group_category);
create index if not exists payroll_records_approval_status_idx on payroll_records (approval_status);
create index if not exists payroll_records_payment_status_idx  on payroll_records (payment_status);
create index if not exists payroll_records_is_deleted_idx      on payroll_records (is_deleted);

-- ── person_balances ──────────────────────────────────────────────────────────
-- Running balance per person (driver / helper / mechanic).
-- Updated when payroll is approved or a balance event is recorded.
create table if not exists person_balances (
  id               uuid primary key default gen_random_uuid(),
  person_name      text,
  person_role      text,   -- Driver | Helper | Mechanic | Other
  plate_number     text,
  group_category   text,
  previous_balance numeric default 0,
  current_balance  numeric default 0,
  updated_at       timestamptz default now(),
  raw_data         jsonb default '{}'::jsonb,
  is_deleted       boolean default false
);

create unique index if not exists person_balances_person_role_idx
  on person_balances (lower(person_name), lower(person_role))
  where not is_deleted;

create index if not exists person_balances_plate_idx on person_balances (plate_number);

-- ── payroll_balance_events ───────────────────────────────────────────────────
-- Ledger of individual balance changes: bali, salary deductions, manual adjustments.
create table if not exists payroll_balance_events (
  id               uuid primary key default gen_random_uuid(),
  event_id         text unique,
  person_name      text,
  person_role      text,
  plate_number     text,
  group_category   text,
  event_type       text,   -- Bali | Salary Deduction | Manual Adjustment
  amount           numeric default 0,
  payroll_id       text,
  cash_request_id  text,
  notes            text,
  created_at       timestamptz default now(),
  raw_data         jsonb default '{}'::jsonb
);

create index if not exists payroll_balance_events_payroll_id_idx      on payroll_balance_events (payroll_id);
create index if not exists payroll_balance_events_cash_request_id_idx on payroll_balance_events (cash_request_id);
create index if not exists payroll_balance_events_person_name_idx      on payroll_balance_events (lower(person_name));
create index if not exists payroll_balance_events_event_type_idx       on payroll_balance_events (event_type);
