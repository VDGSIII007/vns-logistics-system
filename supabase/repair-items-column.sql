alter table repair_requests
add column if not exists repair_items jsonb default '[]'::jsonb;
