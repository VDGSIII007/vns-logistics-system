-- Payroll sample data for testing.
-- Run in Supabase SQL Editor after payroll-foundation.sql has been applied.
-- All inserts are idempotent (ON CONFLICT DO NOTHING or UPDATE).

-- ── person_balances ───────────────────────────────────────────────────────────

INSERT INTO person_balances (person_name, person_role, plate_number, group_category, previous_balance, current_balance, updated_at, raw_data)
VALUES
  ('Juan Driver',    'Driver',    'ABC1234', '2GO',    0,    2000, now(), '{"source":"sample"}'),
  ('Pedro Helper',   'Helper',    'ABC1234', '2GO',    0,     500, now(), '{"source":"sample"}'),
  ('Mario Mechanic', 'Mechanic',  null,      'Repair', 0,    1000, now(), '{"source":"sample"}')
ON CONFLICT (lower(person_name), lower(person_role))
WHERE NOT is_deleted
DO UPDATE SET
  current_balance = EXCLUDED.current_balance,
  plate_number    = EXCLUDED.plate_number,
  group_category  = EXCLUDED.group_category,
  updated_at      = now();

-- ── payroll_records ───────────────────────────────────────────────────────────

INSERT INTO payroll_records (
  payroll_id,
  payroll_date,
  cutoff_from,
  cutoff_to,
  group_category,
  plate_number,
  driver_name,
  helper_name,
  driver_salary,
  helper_salary,
  driver_allowance,
  helper_allowance,
  total_expenses,
  driver_cash_advance,
  helper_cash_advance,
  driver_previous_balance,
  helper_previous_balance,
  driver_balance_preview,
  helper_balance_preview,
  driver_net_pay,
  helper_net_pay,
  status,
  approval_status,
  payment_status,
  raw_data
)
VALUES (
  'PAY-SAMPLE-2GO-001',
  '2026-05-19',
  '2026-05-16',
  '2026-05-19',
  '2GO',
  'ABC1234',
  'Juan Driver',
  'Pedro Helper',
  3000,
  1500,
  0,
  0,
  0,
  0,
  0,
  2000,
  500,
  -1000,
  -1000,
  1000,
  1000,
  'Draft',
  'Draft',
  'Unpaid',
  '{"source":"sample","note":"Sample payroll for 2GO testing. Run payroll-sample-data.sql to load."}'
)
ON CONFLICT (payroll_id) DO UPDATE SET
  payroll_date            = EXCLUDED.payroll_date,
  cutoff_from             = EXCLUDED.cutoff_from,
  cutoff_to               = EXCLUDED.cutoff_to,
  group_category          = EXCLUDED.group_category,
  plate_number            = EXCLUDED.plate_number,
  driver_name             = EXCLUDED.driver_name,
  helper_name             = EXCLUDED.helper_name,
  driver_salary           = EXCLUDED.driver_salary,
  helper_salary           = EXCLUDED.helper_salary,
  driver_previous_balance = EXCLUDED.driver_previous_balance,
  helper_previous_balance = EXCLUDED.helper_previous_balance,
  driver_balance_preview  = EXCLUDED.driver_balance_preview,
  helper_balance_preview  = EXCLUDED.helper_balance_preview,
  driver_net_pay          = EXCLUDED.driver_net_pay,
  helper_net_pay          = EXCLUDED.helper_net_pay,
  updated_at              = now();
