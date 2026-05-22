-- Align for_repair_trucks with the app-driven schema.
-- The original table (repair-extra-tables.sql) used legacy column names
-- (issue, status, date_started, etc.); the Worker now expects the fields below.
-- Run this once in the Supabase SQL editor before saving any new for-repair records.

alter table for_repair_trucks
  add column if not exists for_repair_id         text,
  add column if not exists group_category        text,
  add column if not exists garage_location       text,
  add column if not exists repair_issue          text,
  add column if not exists start_date            date,
  add column if not exists estimated_finish_date date,
  add column if not exists end_date              date,
  add column if not exists repair_status         text;

-- Unique index required for PostgREST on_conflict=for_repair_id upsert.
-- Existing rows with NULL for_repair_id do not violate this index.
create unique index if not exists for_repair_trucks_for_repair_id_uidx
  on for_repair_trucks (for_repair_id);

-- Note: truck_repair_ref_id and odometer_reading are added by
-- supabase/friendly-ref-ids-and-payment-fields.sql — run that file too.
