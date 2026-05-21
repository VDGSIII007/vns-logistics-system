-- VNS standard trip expense columns for payroll_trip_lines.
-- Run after supabase/payroll-rate-matrix.sql.
-- Keeps existing columns for backward compatibility and adds the shared
-- CCB-8126 / VNS Master Expense column style.

alter table payroll_trip_lines
  add column if not exists date date,
  add column if not exists per_liter numeric default 0,
  add column if not exists bayad_sa_driver numeric default 0,
  add column if not exists bayad_sa_helper numeric default 0,
  add column if not exists toll_fee numeric default 0,
  add column if not exists pass_way numeric default 0,
  add column if not exists timbang numeric default 0,
  add column if not exists luna numeric default 0,
  add column if not exists hugas_truck numeric default 0,
  add column if not exists driver text,
  add column if not exists helper text,
  add column if not exists group_commodity text,
  add column if not exists shipment_number text,
  add column if not exists container_number text,
  add column if not exists trip_type text,
  add column if not exists encoded_by text,
  add column if not exists source_module text,
  add column if not exists source_file text,
  add column if not exists status text;

create index if not exists payroll_trip_lines_date_idx on payroll_trip_lines (date desc);
create index if not exists payroll_trip_lines_source_module_idx on payroll_trip_lines (source_module);
