create extension if not exists pgcrypto;

create table if not exists driver_portal_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text,
  temporary_password text,
  plate_number text not null,
  driver_name text,
  helper_name text,
  group_name text,
  mobile_number text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists driver_portal_users_username_idx
  on driver_portal_users (lower(username));

create index if not exists driver_portal_users_plate_number_idx
  on driver_portal_users (plate_number);

create index if not exists driver_portal_users_active_idx
  on driver_portal_users (active);

-- Starter internal-trial account example:
-- insert into driver_portal_users
-- (username, temporary_password, plate_number, driver_name, helper_name, group_name, active)
-- values
-- ('CDA8651', '123456', 'CDA8651', 'Test Driver', 'Test Helper', '2GO', true);

-- TODO: Replace temporary_password with proper password_hash verification.
-- TODO: Add password reset/change password.
-- TODO: Add role-based restrictions.
-- TODO: Add signed session tokens.
