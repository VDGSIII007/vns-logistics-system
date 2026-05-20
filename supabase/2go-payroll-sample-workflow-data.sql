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

-- Real 2GO truck master sample payroll cycle records.
-- These rows intentionally keep SAMPLE markers and stable IDs for safe re-runs.
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
  ('sample-2go-trip-budget-CCB8126', '2026-05-20', '2GO', 'CCB8126', 'Sunny Albador', 'Reinante Nakunat', 'Sample Encoder', 'Trip Budget', 'Trip Budget', 3000, 'VNS Yard', '2GO Route CCB8126', 'SAMPLE real 2GO trip budget', null, 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Trip Budget","Group_Category":"2GO","Plate_Number":"CCB8126","Driver_Name":"Sunny Albador","Helper_Name":"Reinante Nakunat","Amount":3000,"Route":"2GO Route CCB8126","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO trip budget"}'::jsonb, now(), false),
  ('sample-2go-diesel-po-CCB8126', '2026-05-20', '2GO', 'CCB8126', 'Sunny Albador', 'Reinante Nakunat', 'Sample Encoder', 'Diesel PO', '2GO-CCB8126-PO', 18104, 'Fuel Station', '2GO Route CCB8126', 'SAMPLE real 2GO diesel PO', null, 'Approved', 'Approved', 'Unpaid', '{"SAMPLE":true,"Transaction_Type":"Diesel PO","Group_Category":"2GO","Plate_Number":"CCB8126","Driver_Name":"Sunny Albador","Helper_Name":"Reinante Nakunat","Amount":18104,"PO_Number":"2GO-CCB8126-PO","Route":"2GO Route CCB8126","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO diesel PO"}'::jsonb, now(), false),
  ('sample-2go-driver-bali-sunny-albador', '2026-05-20', '2GO', 'CCB8126', 'Sunny Albador', 'Reinante Nakunat', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 2000, null, null, 'SAMPLE real 2GO driver bali', 'Sunny Albador', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CCB8126","Person_Name":"Sunny Albador","Role":"Driver","Amount":2000,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO driver bali"}'::jsonb, now(), false),
  ('sample-2go-helper-bali-reinante-nakunat', '2026-05-20', '2GO', 'CCB8126', 'Sunny Albador', 'Reinante Nakunat', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 500, null, null, 'SAMPLE real 2GO helper bali', 'Reinante Nakunat', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CCB8126","Person_Name":"Reinante Nakunat","Role":"Helper","Amount":500,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO helper bali"}'::jsonb, now(), false),
  ('sample-2go-trip-budget-CDB2822', '2026-05-20', '2GO', 'CDB2822', 'Benhar Loresco', 'Joseph Estranova', 'Sample Encoder', 'Trip Budget', 'Trip Budget', 3000, 'VNS Yard', '2GO Route CDB2822', 'SAMPLE real 2GO trip budget', null, 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Trip Budget","Group_Category":"2GO","Plate_Number":"CDB2822","Driver_Name":"Benhar Loresco","Helper_Name":"Joseph Estranova","Amount":3000,"Route":"2GO Route CDB2822","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO trip budget"}'::jsonb, now(), false),
  ('sample-2go-diesel-po-CDB2822', '2026-05-20', '2GO', 'CDB2822', 'Benhar Loresco', 'Joseph Estranova', 'Sample Encoder', 'Diesel PO', '2GO-CDB2822-PO', 18104, 'Fuel Station', '2GO Route CDB2822', 'SAMPLE real 2GO diesel PO', null, 'Approved', 'Approved', 'Unpaid', '{"SAMPLE":true,"Transaction_Type":"Diesel PO","Group_Category":"2GO","Plate_Number":"CDB2822","Driver_Name":"Benhar Loresco","Helper_Name":"Joseph Estranova","Amount":18104,"PO_Number":"2GO-CDB2822-PO","Route":"2GO Route CDB2822","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO diesel PO"}'::jsonb, now(), false),
  ('sample-2go-driver-bali-benhar-loresco', '2026-05-20', '2GO', 'CDB2822', 'Benhar Loresco', 'Joseph Estranova', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 2000, null, null, 'SAMPLE real 2GO driver bali', 'Benhar Loresco', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CDB2822","Person_Name":"Benhar Loresco","Role":"Driver","Amount":2000,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO driver bali"}'::jsonb, now(), false),
  ('sample-2go-helper-bali-joseph-estranova', '2026-05-20', '2GO', 'CDB2822', 'Benhar Loresco', 'Joseph Estranova', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 500, null, null, 'SAMPLE real 2GO helper bali', 'Joseph Estranova', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CDB2822","Person_Name":"Joseph Estranova","Role":"Helper","Amount":500,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO helper bali"}'::jsonb, now(), false),
  ('sample-2go-trip-budget-CDB8651', '2026-05-20', '2GO', 'CDB8651', 'Melvin Figueroa', 'Steven Figueroa', 'Sample Encoder', 'Trip Budget', 'Trip Budget', 3000, 'VNS Yard', '2GO Route CDB8651', 'SAMPLE real 2GO trip budget', null, 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Trip Budget","Group_Category":"2GO","Plate_Number":"CDB8651","Driver_Name":"Melvin Figueroa","Helper_Name":"Steven Figueroa","Amount":3000,"Route":"2GO Route CDB8651","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO trip budget"}'::jsonb, now(), false),
  ('sample-2go-diesel-po-CDB8651', '2026-05-20', '2GO', 'CDB8651', 'Melvin Figueroa', 'Steven Figueroa', 'Sample Encoder', 'Diesel PO', '2GO-CDB8651-PO', 18104, 'Fuel Station', '2GO Route CDB8651', 'SAMPLE real 2GO diesel PO', null, 'Approved', 'Approved', 'Unpaid', '{"SAMPLE":true,"Transaction_Type":"Diesel PO","Group_Category":"2GO","Plate_Number":"CDB8651","Driver_Name":"Melvin Figueroa","Helper_Name":"Steven Figueroa","Amount":18104,"PO_Number":"2GO-CDB8651-PO","Route":"2GO Route CDB8651","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO diesel PO"}'::jsonb, now(), false),
  ('sample-2go-driver-bali-melvin-figueroa', '2026-05-20', '2GO', 'CDB8651', 'Melvin Figueroa', 'Steven Figueroa', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 2000, null, null, 'SAMPLE real 2GO driver bali', 'Melvin Figueroa', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CDB8651","Person_Name":"Melvin Figueroa","Role":"Driver","Amount":2000,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO driver bali"}'::jsonb, now(), false),
  ('sample-2go-helper-bali-steven-figueroa', '2026-05-20', '2GO', 'CDB8651', 'Melvin Figueroa', 'Steven Figueroa', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 500, null, null, 'SAMPLE real 2GO helper bali', 'Steven Figueroa', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"CDB8651","Person_Name":"Steven Figueroa","Role":"Helper","Amount":500,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO helper bali"}'::jsonb, now(), false),
  ('sample-2go-trip-budget-NLC4170', '2026-05-20', '2GO', 'NLC4170', 'James Bayona', 'Unassigned Helper', 'Sample Encoder', 'Trip Budget', 'Trip Budget', 3000, 'VNS Yard', '2GO Route NLC4170', 'SAMPLE real 2GO trip budget', null, 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Trip Budget","Group_Category":"2GO","Plate_Number":"NLC4170","Driver_Name":"James Bayona","Helper_Name":"Unassigned Helper","Amount":3000,"Route":"2GO Route NLC4170","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO trip budget"}'::jsonb, now(), false),
  ('sample-2go-diesel-po-NLC4170', '2026-05-20', '2GO', 'NLC4170', 'James Bayona', 'Unassigned Helper', 'Sample Encoder', 'Diesel PO', '2GO-NLC4170-PO', 18104, 'Fuel Station', '2GO Route NLC4170', 'SAMPLE real 2GO diesel PO', null, 'Approved', 'Approved', 'Unpaid', '{"SAMPLE":true,"Transaction_Type":"Diesel PO","Group_Category":"2GO","Plate_Number":"NLC4170","Driver_Name":"James Bayona","Helper_Name":"Unassigned Helper","Amount":18104,"PO_Number":"2GO-NLC4170-PO","Route":"2GO Route NLC4170","Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO diesel PO"}'::jsonb, now(), false),
  ('sample-2go-driver-bali-james-bayona', '2026-05-20', '2GO', 'NLC4170', 'James Bayona', 'Unassigned Helper', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 2000, null, null, 'SAMPLE real 2GO driver bali', 'James Bayona', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"NLC4170","Person_Name":"James Bayona","Role":"Driver","Amount":2000,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO driver bali"}'::jsonb, now(), false),
  ('sample-2go-helper-bali-unassigned-helper', '2026-05-20', '2GO', 'NLC4170', 'James Bayona', 'Unassigned Helper', 'Sample Encoder', 'Bali / Cash Advance', 'Bali', 500, null, null, 'SAMPLE real 2GO helper bali', 'Unassigned Helper', 'Approved', 'Approved', 'Paid', '{"SAMPLE":true,"Transaction_Type":"Bali / Cash Advance","Group_Category":"2GO","Plate_Number":"NLC4170","Person_Name":"Unassigned Helper","Role":"Helper","Amount":500,"Logged_By":"Sample Encoder","Remarks":"SAMPLE real 2GO helper bali"}'::jsonb, now(), false)
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
) values
  ('PAY-SAMPLE-2GO-CCB8126', '2026-05-19', '2026-05-16', '2026-05-19', '2GO', 'CCB8126', 'Sunny Albador', 'Reinante Nakunat', 1000, 500, 2000, 500, 1000, 0, 'Paid', 'Approved', 'Paid', '{"SAMPLE":true,"source":"real 2go sample payroll cycle","driverDeducted":1000,"helperDeducted":500}'::jsonb, now(), false),
  ('PAY-SAMPLE-2GO-CDB2822', '2026-05-19', '2026-05-16', '2026-05-19', '2GO', 'CDB2822', 'Benhar Loresco', 'Joseph Estranova', 1000, 500, 2000, 500, 1000, 0, 'Paid', 'Approved', 'Paid', '{"SAMPLE":true,"source":"real 2go sample payroll cycle","driverDeducted":1000,"helperDeducted":500}'::jsonb, now(), false),
  ('PAY-SAMPLE-2GO-CDB8651', '2026-05-19', '2026-05-16', '2026-05-19', '2GO', 'CDB8651', 'Melvin Figueroa', 'Steven Figueroa', 1000, 500, 2000, 500, 1000, 0, 'Paid', 'Approved', 'Paid', '{"SAMPLE":true,"source":"real 2go sample payroll cycle","driverDeducted":1000,"helperDeducted":500}'::jsonb, now(), false),
  ('PAY-SAMPLE-2GO-NLC4170', '2026-05-19', '2026-05-16', '2026-05-19', '2GO', 'NLC4170', 'James Bayona', 'Unassigned Helper', 1000, 500, 2000, 500, 1000, 0, 'Paid', 'Approved', 'Paid', '{"SAMPLE":true,"source":"real 2go sample payroll cycle","driverDeducted":1000,"helperDeducted":500}'::jsonb, now(), false)
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

insert into payroll_trip_lines (
  line_id,
  payroll_id,
  trip_date,
  plate_number,
  group_category,
  driver_name,
  helper_name,
  source,
  destination,
  reference_no,
  po_number,
  diesel,
  driver_salary,
  helper_salary,
  allowance_driver,
  allowance_helper,
  row_total,
  rate_id,
  rate_match_status,
  remarks,
  raw_data,
  is_deleted,
  updated_at
) values
  ('PTL-SAMPLE-2GO-CCB8126-001', 'PAY-SAMPLE-2GO-CCB8126', '2026-05-20', 'CCB8126', '2GO', 'Sunny Albador', 'Reinante Nakunat', 'CALACA', 'PIER16', 'SAMPLE-2GO-CCB8126', '2GO-CCB8126-PO', 18104, 2400, 1200, 150, 100, 21954, 'RATE-2GO-CALACA-PIER16', 'Matched', 'SAMPLE real 2GO payroll trip line - matched CALACA to PIER16', '{"SAMPLE":true,"rate_id":"RATE-2GO-CALACA-PIER16","rate_match_status":"Matched"}'::jsonb, false, now()),
  ('PTL-SAMPLE-2GO-CDB2822-001', 'PAY-SAMPLE-2GO-CDB2822', '2026-05-20', 'CDB2822', '2GO', 'Benhar Loresco', 'Joseph Estranova', 'BAUAN', 'PIER16', 'SAMPLE-2GO-CDB2822', '2GO-CDB2822-PO', 18104, 2400, 1200, 150, 100, 21954, 'RATE-2GO-BAUAN-PIER16', 'Matched', 'SAMPLE real 2GO payroll trip line - matched BAUAN to PIER16', '{"SAMPLE":true,"rate_id":"RATE-2GO-BAUAN-PIER16","rate_match_status":"Matched"}'::jsonb, false, now()),
  ('PTL-SAMPLE-2GO-CDB8651-001', 'PAY-SAMPLE-2GO-CDB8651', '2026-05-20', 'CDB8651', '2GO', 'Melvin Figueroa', 'Steven Figueroa', 'CALAMBA', 'PIER16', 'SAMPLE-2GO-CDB8651', '2GO-CDB8651-PO', 18104, 1400, 700, 150, 100, 20454, 'RATE-2GO-CALAMBA-PIER16', 'Matched', 'SAMPLE real 2GO payroll trip line - matched CALAMBA to PIER16', '{"SAMPLE":true,"rate_id":"RATE-2GO-CALAMBA-PIER16","rate_match_status":"Matched"}'::jsonb, false, now()),
  ('PTL-SAMPLE-2GO-NLC4170-001', 'PAY-SAMPLE-2GO-NLC4170', '2026-05-20', 'NLC4170', '2GO', 'James Bayona', 'Unassigned Helper', 'BATAAN', 'PIER16', 'SAMPLE-2GO-NLC4170', '2GO-NLC4170-PO', 18104, 3000, 1500, 150, 100, 22854, 'RATE-2GO-BATAAN-PIER16', 'Matched', 'SAMPLE real 2GO payroll trip line - matched BATAAN to PIER16', '{"SAMPLE":true,"rate_id":"RATE-2GO-BATAAN-PIER16","rate_match_status":"Matched"}'::jsonb, false, now())
on conflict (line_id) do update set
  payroll_id = excluded.payroll_id,
  trip_date = excluded.trip_date,
  plate_number = excluded.plate_number,
  group_category = excluded.group_category,
  driver_name = excluded.driver_name,
  helper_name = excluded.helper_name,
  source = excluded.source,
  destination = excluded.destination,
  reference_no = excluded.reference_no,
  po_number = excluded.po_number,
  diesel = excluded.diesel,
  driver_salary = excluded.driver_salary,
  helper_salary = excluded.helper_salary,
  allowance_driver = excluded.allowance_driver,
  allowance_helper = excluded.allowance_helper,
  row_total = excluded.row_total,
  rate_id = excluded.rate_id,
  rate_match_status = excluded.rate_match_status,
  remarks = excluded.remarks,
  raw_data = excluded.raw_data,
  is_deleted = false,
  updated_at = now();

insert into payroll_balance_events (
  event_id,
  person_name,
  person_role,
  plate_number,
  group_category,
  event_type,
  amount,
  payroll_id,
  notes,
  raw_data
) values
  ('PBE-SAMPLE-2GO-CCB8126-DRIVER-DEDUCTION', 'Sunny Albador', 'Driver', 'CCB8126', '2GO', 'Salary Deduction', 1000, 'PAY-SAMPLE-2GO-CCB8126', 'SAMPLE real 2GO driver payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-CCB8126-HELPER-DEDUCTION', 'Reinante Nakunat', 'Helper', 'CCB8126', '2GO', 'Salary Deduction', 500, 'PAY-SAMPLE-2GO-CCB8126', 'SAMPLE real 2GO helper payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-CDB2822-DRIVER-DEDUCTION', 'Benhar Loresco', 'Driver', 'CDB2822', '2GO', 'Salary Deduction', 1000, 'PAY-SAMPLE-2GO-CDB2822', 'SAMPLE real 2GO driver payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-CDB2822-HELPER-DEDUCTION', 'Joseph Estranova', 'Helper', 'CDB2822', '2GO', 'Salary Deduction', 500, 'PAY-SAMPLE-2GO-CDB2822', 'SAMPLE real 2GO helper payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-CDB8651-DRIVER-DEDUCTION', 'Melvin Figueroa', 'Driver', 'CDB8651', '2GO', 'Salary Deduction', 1000, 'PAY-SAMPLE-2GO-CDB8651', 'SAMPLE real 2GO driver payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-CDB8651-HELPER-DEDUCTION', 'Steven Figueroa', 'Helper', 'CDB8651', '2GO', 'Salary Deduction', 500, 'PAY-SAMPLE-2GO-CDB8651', 'SAMPLE real 2GO helper payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-NLC4170-DRIVER-DEDUCTION', 'James Bayona', 'Driver', 'NLC4170', '2GO', 'Salary Deduction', 1000, 'PAY-SAMPLE-2GO-NLC4170', 'SAMPLE real 2GO driver payroll deduction', '{"SAMPLE":true}'::jsonb),
  ('PBE-SAMPLE-2GO-NLC4170-HELPER-DEDUCTION', 'Unassigned Helper', 'Helper', 'NLC4170', '2GO', 'Salary Deduction', 500, 'PAY-SAMPLE-2GO-NLC4170', 'SAMPLE real 2GO helper payroll deduction', '{"SAMPLE":true}'::jsonb)
on conflict (event_id) do update set
  person_name = excluded.person_name,
  person_role = excluded.person_role,
  plate_number = excluded.plate_number,
  group_category = excluded.group_category,
  event_type = excluded.event_type,
  amount = excluded.amount,
  payroll_id = excluded.payroll_id,
  notes = excluded.notes,
  raw_data = excluded.raw_data;
