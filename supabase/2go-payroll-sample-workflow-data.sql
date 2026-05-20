-- 2GO Budget & Balance Center sample workflow data
-- Run in Supabase SQL editor after cash-request-tables.sql and payroll-foundation.sql.

-- Truck cash / PO / Bali records since last payroll
insert into cash_requests (
  request_id,
  request_date,
  group_name,
  plate_number,
  driver_name,
  helper_name,
  logged_by,
  request_type,
  budget_type,
  amount,
  source,
  destination,
  remarks,
  receiver_name,
  status,
  approval_status,
  payment_status,
  raw_data,
  updated_at,
  is_deleted
) values
(
  'sample-2go-trip-budget-abc1234',
  '2026-05-20',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  'Sample Encoder',
  'Trip Budget',
  'Trip Budget',
  3000,
  'VNS Yard',
  '2GO Route',
  '2GO sample trip budget',
  null,
  'Approved',
  'Approved',
  'Paid',
  '{"Transaction_Type":"Trip Budget","Group_Category":"2GO","Plate_Number":"ABC1234","Driver_Name":"Juan Driver","Helper_Name":"Pedro Helper","Amount":3000,"Route":"2GO Route","Logged_By":"Sample Encoder","Remarks":"2GO sample trip budget"}'::jsonb,
  now(),
  false
),
(
  'sample-2go-diesel-po-1645-abc1234',
  '2026-05-20',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  'Sample Encoder',
  'Diesel PO',
  '1645',
  18104,
  'Fuel Station',
  '2GO Route',
  '2GO sample diesel PO',
  null,
  'Approved',
  'Approved',
  'Unpaid',
  '{"Transaction_Type":"Diesel PO","Group_Category":"2GO","Plate_Number":"ABC1234","Driver_Name":"Juan Driver","Helper_Name":"Pedro Helper","Amount":18104,"PO_Number":"1645","Route":"2GO Route","Logged_By":"Sample Encoder","Remarks":"2GO sample diesel PO"}'::jsonb,
  now(),
  false
),
(
  'sample-2go-driver-bali-juan-driver',
  '2026-05-20',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  'Sample Encoder',
  'Bali / Cash Advance',
  'Bali',
  2000,
  null,
  null,
  '2GO sample driver bali',
  'Juan Driver',
  'Approved',
  'Approved',
  'Paid',
  '{"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"ABC1234","Person_Name":"Juan Driver","Role":"Driver","Amount":2000,"Logged_By":"Sample Encoder","Remarks":"2GO sample driver bali"}'::jsonb,
  now(),
  false
),
(
  'sample-2go-helper-bali-pedro-helper',
  '2026-05-20',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  'Sample Encoder',
  'Bali / Cash Advance',
  'Bali',
  500,
  null,
  null,
  '2GO sample helper bali',
  'Pedro Helper',
  'Approved',
  'Approved',
  'Paid',
  '{"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"ABC1234","Person_Name":"Pedro Helper","Role":"Helper","Amount":500,"Logged_By":"Sample Encoder","Remarks":"2GO sample helper bali"}'::jsonb,
  now(),
  false
)
on conflict (request_id) do update set
  request_date = excluded.request_date,
  group_name = excluded.group_name,
  plate_number = excluded.plate_number,
  driver_name = excluded.driver_name,
  helper_name = excluded.helper_name,
  logged_by = excluded.logged_by,
  request_type = excluded.request_type,
  budget_type = excluded.budget_type,
  amount = excluded.amount,
  source = excluded.source,
  destination = excluded.destination,
  remarks = excluded.remarks,
  receiver_name = excluded.receiver_name,
  status = excluded.status,
  approval_status = excluded.approval_status,
  payment_status = excluded.payment_status,
  raw_data = excluded.raw_data,
  updated_at = now(),
  is_deleted = false;

-- Latest payroll reference before these sample records.
insert into payroll_records (
  payroll_id,
  payroll_date,
  cutoff_from,
  cutoff_to,
  group_category,
  plate_number,
  driver_name,
  helper_name,
  driver_cash_advance,
  helper_cash_advance,
  driver_previous_balance,
  helper_previous_balance,
  driver_balance_preview,
  helper_balance_preview,
  status,
  approval_status,
  payment_status,
  raw_data,
  updated_at,
  is_deleted
) values (
  'PAY-SAMPLE-2GO-001',
  '2026-05-19',
  '2026-05-16',
  '2026-05-19',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  1000,
  500,
  2000,
  500,
  1000,
  0,
  'Paid',
  'Approved',
  'Paid',
  '{"source":"2go sample workflow","driverDeducted":1000,"helperDeducted":500}'::jsonb,
  now(),
  false
)
on conflict (payroll_id) do update set
  payroll_date = excluded.payroll_date,
  cutoff_from = excluded.cutoff_from,
  cutoff_to = excluded.cutoff_to,
  group_category = excluded.group_category,
  plate_number = excluded.plate_number,
  driver_name = excluded.driver_name,
  helper_name = excluded.helper_name,
  driver_cash_advance = excluded.driver_cash_advance,
  helper_cash_advance = excluded.helper_cash_advance,
  driver_previous_balance = excluded.driver_previous_balance,
  helper_previous_balance = excluded.helper_previous_balance,
  driver_balance_preview = excluded.driver_balance_preview,
  helper_balance_preview = excluded.helper_balance_preview,
  status = excluded.status,
  approval_status = excluded.approval_status,
  payment_status = excluded.payment_status,
  raw_data = excluded.raw_data,
  updated_at = now(),
  is_deleted = false;

-- Current balances after payroll deductions.
update person_balances
set
  plate_number = 'ABC1234',
  group_category = '2GO',
  previous_balance = 2000,
  current_balance = 1000,
  updated_at = now(),
  raw_data = '{"source":"2go sample workflow","deducted":1000}'::jsonb,
  is_deleted = false
where lower(person_name) = lower('Juan Driver')
  and lower(person_role) = lower('Driver');

insert into person_balances (
  person_name,
  person_role,
  plate_number,
  group_category,
  previous_balance,
  current_balance,
  updated_at,
  raw_data,
  is_deleted
)
select
  'Juan Driver',
  'Driver',
  'ABC1234',
  '2GO',
  2000,
  1000,
  now(),
  '{"source":"2go sample workflow","deducted":1000}'::jsonb,
  false
where not exists (
  select 1 from person_balances
  where lower(person_name) = lower('Juan Driver')
    and lower(person_role) = lower('Driver')
    and not is_deleted
);

update person_balances
set
  plate_number = 'ABC1234',
  group_category = '2GO',
  previous_balance = 500,
  current_balance = 0,
  updated_at = now(),
  raw_data = '{"source":"2go sample workflow","deducted":500}'::jsonb,
  is_deleted = false
where lower(person_name) = lower('Pedro Helper')
  and lower(person_role) = lower('Helper');

insert into person_balances (
  person_name,
  person_role,
  plate_number,
  group_category,
  previous_balance,
  current_balance,
  updated_at,
  raw_data,
  is_deleted
)
select
  'Pedro Helper',
  'Helper',
  'ABC1234',
  '2GO',
  500,
  0,
  now(),
  '{"source":"2go sample workflow","deducted":500}'::jsonb,
  false
where not exists (
  select 1 from person_balances
  where lower(person_name) = lower('Pedro Helper')
    and lower(person_role) = lower('Helper')
    and not is_deleted
);
