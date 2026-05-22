-- Per-person payment fields: driver and helper can be paid independently.
-- Additive only. Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- Run this AFTER friendly-ref-ids-and-payment-fields.sql.

alter table payroll_records
  add column if not exists driver_payment_status  text        default 'Unpaid',
  add column if not exists helper_payment_status  text        default 'Unpaid',
  add column if not exists driver_paid_at         timestamptz,
  add column if not exists helper_paid_at         timestamptz,
  add column if not exists driver_payment_ref_id  text,
  add column if not exists helper_payment_ref_id  text,
  add column if not exists driver_payment_reference text,
  add column if not exists helper_payment_reference text,
  add column if not exists driver_payment_notes   text,
  add column if not exists helper_payment_notes   text;

create index if not exists payroll_records_driver_payment_ref_id_idx
  on payroll_records (driver_payment_ref_id);

create index if not exists payroll_records_helper_payment_ref_id_idx
  on payroll_records (helper_payment_ref_id);
