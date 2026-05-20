-- Truck Master compatibility migration
-- The existing shared truck master table is `trucks` from master-data-tables.sql.
-- This migration keeps that table as the source of truth and adds the active flag
-- expected by Budget & Balance Center without creating a duplicate table.

create extension if not exists pgcrypto;

create table if not exists trucks (
  truck_id text primary key,
  plate_number text unique,
  group_category text,
  driver_name text,
  helper_name text,
  current_driver_name text,
  current_helper_name text,
  status text,
  active boolean default true,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table trucks add column if not exists active boolean default true;
alter table trucks add column if not exists driver_name text;
alter table trucks add column if not exists helper_name text;
alter table trucks add column if not exists remarks text;
alter table trucks add column if not exists created_at timestamptz default now();
alter table trucks add column if not exists updated_at timestamptz default now();

update trucks
set active = case
  when lower(coalesce(status, 'active')) in ('inactive', 'deleted', 'retired') then false
  else true
end
where active is null;

update trucks
set
  driver_name = coalesce(driver_name, current_driver_name),
  helper_name = coalesce(helper_name, current_helper_name)
where driver_name is null
   or helper_name is null;

create unique index if not exists idx_trucks_plate_number_unique on trucks (plate_number);
create index if not exists idx_trucks_active on trucks (active);
create index if not exists idx_trucks_group_category on trucks (group_category);
