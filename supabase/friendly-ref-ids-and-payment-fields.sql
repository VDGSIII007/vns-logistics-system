-- Friendly user-facing reference IDs for VNS modules.
-- Additive only: keeps existing UUID/internal IDs untouched.

alter table payroll_records
  add column if not exists payroll_ref_id text,
  add column if not exists payment_ref_id text,
  add column if not exists payment_reference text,
  add column if not exists payment_notes text,
  add column if not exists paid_at timestamptz;

create index if not exists payroll_records_payroll_ref_id_idx
on payroll_records (payroll_ref_id);

create index if not exists payroll_records_payment_ref_id_idx
on payroll_records (payment_ref_id);

alter table cash_requests
  add column if not exists request_no text,
  add column if not exists cash_ref_id text,
  add column if not exists payment_ref_id text,
  add column if not exists payment_reference text,
  add column if not exists payment_notes text;

create index if not exists cash_requests_request_no_idx
on cash_requests (request_no);

create index if not exists cash_requests_cash_ref_id_idx
on cash_requests (cash_ref_id);

create index if not exists cash_requests_payment_ref_id_idx
on cash_requests (payment_ref_id);

alter table repair_requests
  add column if not exists request_no text,
  add column if not exists repair_ref_id text,
  add column if not exists odometer_reading text,
  add column if not exists account_number text,
  add column if not exists repair_items jsonb default '[]'::jsonb,
  add column if not exists labor_items jsonb default '[]'::jsonb,
  add column if not exists payment_ref_id text,
  add column if not exists payment_reference text,
  add column if not exists payment_notes text;

create index if not exists repair_requests_request_no_idx
on repair_requests (request_no);

create index if not exists repair_requests_repair_ref_id_idx
on repair_requests (repair_ref_id);

create index if not exists repair_requests_payment_ref_id_idx
on repair_requests (payment_ref_id);

alter table for_repair_trucks
  add column if not exists truck_repair_ref_id text,
  add column if not exists odometer_reading text;

create index if not exists for_repair_trucks_ref_id_idx
on for_repair_trucks (truck_repair_ref_id);

alter table completed_repairs
  add column if not exists repair_ref_id text,
  add column if not exists payment_ref_id text,
  add column if not exists payment_reference text,
  add column if not exists payment_notes text,
  add column if not exists odometer_reading text,
  add column if not exists labor_items jsonb default '[]'::jsonb;

create index if not exists completed_repairs_repair_ref_id_idx
on completed_repairs (repair_ref_id);
