# Google Sheet Columns

This file defines starter column plans for future Google Sheets or Apps Script integration.

## General Rules

- Use one sheet per module or major record type.
- Keep column names stable once data is live.
- Use ISO-like dates when possible: `YYYY-MM-DD`.
- Store amounts as numbers, not formatted strings.
- Use plate number as a common lookup key.
- Add `created_at`, `updated_at`, and `record_id` when possible.

## Repair Requests Sheet

Suggested columns:

- record_id
- date_reported
- time_reported
- reported_by
- plate_number
- truck_type
- driver_name
- odometer
- issue_category
- issue_description
- priority
- status
- assigned_to
- shop_name
- parts_needed
- parts_used
- parts_cost
- labor_cost
- outside_shop_cost
- towing_cost
- other_cost
- total_cost
- approval_status
- approved_by
- start_date
- completion_date
- downtime_days
- final_findings
- remarks
- created_at
- updated_at

## Payroll Sheet

Suggested columns:

- record_id
- payroll_period_start
- payroll_period_end
- pay_date
- employee_name
- role
- plate_number
- trip_count
- base_pay
- trip_pay
- allowance
- overtime_pay
- reimbursement
- gross_pay
- cash_advance
- bali
- deductions
- sss
- philhealth
- pagibig
- other_deductions
- net_pay
- payment_method
- gcash_number
- status
- remarks
- created_at
- updated_at

## Cash / PO / Bali Sheet

Suggested columns:

- record_id
- date
- time
- sender
- plate_number
- request_type
- person_name
- role
- gcash_number
- amount
- po_number
- liters
- fuel_station
- route
- balance_after_payroll
- review_status
- remarks
- source_message
- created_at
- updated_at

## Parts Inventory Master Sheet

Suggested columns:

- item_id
- item_name
- item_type
- category
- make
- brand
- model
- part_number
- serial_number
- unit
- current_stock
- reorder_level
- unit_cost
- total_value
- storage_location
- supplier
- status
- remarks
- created_at
- updated_at

## Parts Movement Sheet

Suggested columns:

- movement_id
- movement_type
- date
- time
- plate_number
- item_id
- item_name
- quantity
- unit_cost
- total_cost
- released_to
- requested_by
- received_by
- supplier
- receipt_number
- repair_request_id
- odometer
- work_done
- remarks
- created_at

## Expenses Sheet

Suggested columns:

- expense_id
- date
- category
- subcategory
- plate_number
- vendor
- description
- amount
- payment_method
- receipt_number
- requested_by
- approved_by
- status
- remarks
- created_at
- updated_at

## GPS / iTrackCare Sheet

Suggested columns:

- gps_record_id
- date
- time
- plate_number
- gps_status
- last_known_location
- issue_category
- issue_description
- reported_by
- assigned_to
- resolution_status
- resolved_date
- remarks
- created_at
- updated_at

## Apps Script API Notes

If using Apps Script later, each module can POST JSON with:

- `action`
- `sheet`
- `payload`

Example action names:

- `createRepairRequest`
- `updateRepairStatus`
- `createPayrollRecord`
- `createCashRequest`
- `createPartsMovement`
- `createExpense`
- `createGpsIssue`
