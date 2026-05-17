alter table repair_requests
add column if not exists backup_status text default 'pending',
add column if not exists backup_synced_at timestamptz,
add column if not exists backup_error text;

create index if not exists idx_repair_requests_backup_status
on repair_requests (backup_status);
