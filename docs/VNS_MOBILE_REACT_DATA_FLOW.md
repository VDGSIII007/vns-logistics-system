# VNS Mobile React Data Flow

This document describes the current VNS data flow for the mobile driver, approval, and payment experience. It is intended as a rebuild guide for a React mobile app while keeping the existing Cloudflare Worker and Supabase backend unchanged at first.

## 1. System Overview

The current system is a set of static HTML pages controlled by page-specific JavaScript files. Those pages call a Cloudflare Worker API, and the Worker reads/writes Supabase tables using the Supabase REST API and server-side credentials.

Main flow:

```text
HTML/JS frontend pages
  -> Cloudflare Worker API routes
  -> Supabase tables
```

The mobile driver pages use the Worker directly:

- `driver-portal.html` / `driver-portal.js`
- `driver-cash.html` / `driver-cash.js`
- `driver-trip.html` / `driver-trip.js`
- `driver-requests.html` / `driver-requests.js`
- `mobile-approval.html` / `mobile-approval.js`
- `mobile-payment.html` / `mobile-payment.js`

The desktop approval and payment pages also use the Worker, but they still contain Google Apps Script fallback or backup endpoints for some cash, repair, and payroll liquidation flows. React should treat the Worker API as the primary backend and avoid adding new Google Apps Script dependencies.

`repair.js` was requested for inspection, but no `repair.js` file is present. Repair UI behavior is currently represented by `repair.html` and shared legacy logic in `script.js`, plus Worker routes in `repair-api.js`.

## 2. API Base URL

Most mobile files define the Worker base URL directly:

```js
const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
```

Locations:

- `driver-portal.js`
- `driver-cash.js`
- `driver-trip.js`
- `driver-requests.js`
- `mobile-approval.js`
- `mobile-payment.js`

Other constants:

- `cash.js`: `VNS_CASH_WORKER_API_BASE`
- `approval-center.js`: `VNS_WORKER_API_BASE`
- `payment-queue.js`: `VNS_WORKER_API_BASE`
- `push-config.js`: `window.VNS_PUSH_API_BASE = "/api/push"`
- `notifications.js`: `PUSH_API_BASE = window.VNS_PUSH_API_BASE || "/api/push"`

Example value:

```text
https://vns-push-worker.santosvicenteiii.workers.dev
```

React recommendation:

- Create one API client module, for example `src/api/client.ts`.
- Configure `VITE_VNS_WORKER_API_BASE` or equivalent env var.
- Default to the current Worker URL for production builds.
- Keep `/api/push` configurable because existing push code can use a relative path.

Legacy Google Apps Script constants still exist:

- `cash.js`: cash and master data Apps Script URLs.
- `approval-center.js`: cash, repair, and payroll liquidation Apps Script URLs.
- `payment-queue.js`: cash and repair Apps Script URLs.
- `notifications.js`: cash and repair Apps Script URLs.

## 3. Supabase Tables

### `cash_requests`

Purpose: stores Cash PO, Bali / Cash Advance, and Trip Budget requests.

Source migrations:

- `supabase/cash-request-tables.sql`
- `supabase/friendly-ref-ids-and-payment-fields.sql`
- `supabase/driver-mobile-cash-fields.sql` if present in the working tree

Important columns:

- IDs / refs: `id`, `request_id`, `request_no`, `cash_ref_id`
- Request fields: `request_date`, `request_type`, `budget_type`, `amount`, `source`, `destination`, `remarks`
- Driver fields: `group_name`, `plate_number`, `truck_type`, `driver_name`, `helper_name`
- Deposit/payment target: `deposit_needed`, `receiver_name`, `deposit_to`, `account_number`
- Status: `status`, `approval_status`, `payment_status`
- Approval: `approved_by`, `approved_at`
- Payment: `paid_by`, `paid_at`, `payment_ref_id`, `payment_reference`, `payment_notes`
- Sync/backup: `backup_status`, `backup_synced_at`, `backup_error`
- Timestamps: `created_at`, `updated_at`
- Soft delete: `is_deleted`

Worker module: `workers/push-worker/src/cash-api.js`

Friendly refs:

- `CPO-YYYYMMDD-###` for Cash PO
- `TBUD-YYYYMMDD-###` for Trip Budget
- `BALI-YYYYMMDD-###` for Bali / Cash Advance
- `PMT-YYYYMMDD-###` for payment refs

### `driver_trip_submissions`

Purpose: stores driver-submitted current trip details for dispatcher/admin review. It does not create final payroll records directly.

Source migration:

- `supabase/driver-trip-submissions.sql`

Important columns:

- IDs / refs: `id`, `trip_ref_id`
- Driver fields: `plate_number`, `driver_name`, `helper_name`, `mobile_number`
- Trip fields: `trip_date`, `shipment_number`, `container_number`, `product_line`, `source`, `destination`, `trip_status`
- Expense columns retained in schema: `driver_allowance`, `helper_allowance`, `fuel_amount`, `toll_fee`, `parking_fee`, `passway_fee`, `other_expense`, `other_expense_description`
- Completion fields: `delivered_at`, `receiver_name`
- Status: `submission_status`
- Notes/timestamps: `remarks`, `created_at`, `updated_at`

Worker module: `workers/push-worker/src/driver-trip-api.js`

Friendly ref:

- `DTRIP-YYYYMMDD-###`

### `driver_portal_users`

Purpose: starter driver login table.

Source migration:

- `supabase/driver-portal-users.sql`

Important columns:

- `id`
- `username`
- `password_hash`
- `temporary_password`
- `plate_number`
- `driver_name`
- `helper_name`
- `group_name`
- `mobile_number`
- `active`
- `created_at`
- `updated_at`

Worker module: `workers/push-worker/src/driver-portal-api.js`

Security note: current login compares `temporary_password` server-side. Passwords are not hardcoded in frontend, but this is not production-grade authentication.

### `trucks`

Purpose: truck master / assignment lookup.

Source migrations:

- `supabase/master-data-tables.sql`
- `supabase/truck-master.sql`

Important columns:

- `id`
- `plate_number`
- `truck_type`
- `group_category`
- `driver_name`
- `helper_name`
- `driver_id`
- `helper_id`
- `status`
- `active`
- `remarks`
- `created_at`
- `updated_at`

Worker route:

- `GET /api/trucks/list`

Used by:

- `driver-cash.js`
- `driver-trip.js`

### `repair_requests`

Purpose: repair, labor, parts, equipment, and other repair requests.

Known migrations:

- `supabase/friendly-ref-ids-and-payment-fields.sql`
- `supabase/repair-backup-columns.sql`
- `supabase/repair-items-column.sql`
- `supabase/repair-payee-account-column.sql`

The base table creation migration was not clearly found in the inspected migration set. The Worker assumes the table exists.

Important columns used by Worker/frontend:

- IDs / refs: `id`, `request_id`, `request_no`, `repair_ref_id`
- Request type: `request_type`
- Vehicle/driver: `plate_number`, `driver_name`, `helper_name`, `truck_type`, `group_name`
- Request details: `repair_issue`, `description`, `remarks`, `repair_items`, `labor_items`
- Payee/account: `payee_name`, `account_number`
- Amounts: `amount`, `total_amount`, `final_cost`, `approved_amount`
- Status: `status`, `approval_status`, `repair_status`, `payment_status`
- Approval: `approved_by`, `approved_at`
- Payment: `paid_by`, `paid_at`, `payment_ref_id`, `payment_reference`, `payment_notes`
- Timestamps: `created_at`, `updated_at`

Worker module: `workers/push-worker/src/repair-api.js`

Friendly refs:

- `LAB-YYYYMMDD-###`
- `EQP-YYYYMMDD-###`
- `PART-YYYYMMDD-###`
- `OTHREP-YYYYMMDD-###`
- `TRKREP-YYYYMMDD-###`
- fallback `REP-YYYYMMDD-###`

### `for_repair_trucks`

Purpose: tracks trucks currently marked for repair.

Source migrations:

- `supabase/repair-extra-tables.sql`
- `supabase/for-repair-trucks-schema-update.sql`
- `supabase/friendly-ref-ids-and-payment-fields.sql`

Important columns:

- `id`
- `for_repair_id`
- `truck_repair_ref_id`
- `group_category`
- `plate_number`
- `driver_name`
- `helper_name`
- `garage_location`
- `odometer_reading`
- `repair_issue`
- `repair_status`
- `start_date`
- `estimated_finish_date`
- `end_date`
- `remarks`
- `created_at`
- `updated_at`

Worker route:

- `POST /api/repair/for-repair-truck`

### `completed_repairs`

Purpose: stores completed repair records.

Source migrations:

- `supabase/repair-extra-tables.sql`
- `supabase/friendly-ref-ids-and-payment-fields.sql`

Important columns:

- `id`
- `repair_ref_id`
- `plate_number`
- `driver_name`
- `helper_name`
- `odometer_reading`
- `labor_items`
- `payment_ref_id`
- `payment_reference`
- `payment_notes`
- `created_at`
- `updated_at`

### `payroll_records`

Purpose: payroll records for approval and payment.

Source migrations:

- `supabase/payroll-foundation.sql`
- `supabase/friendly-ref-ids-and-payment-fields.sql`
- `supabase/driver-helper-payment-fields.sql`

Important columns:

- IDs / refs: `id`, `payroll_id`, `payroll_ref_id`
- Personnel: `driver_name`, `helper_name`, `plate_number`
- Dates: `payroll_date`, `period_start`, `period_end`
- Amounts: `driver_gross_pay`, `helper_gross_pay`, `driver_net_pay`, `helper_net_pay`, `total_net_pay`
- Status: `status`, `approval_status`, `payment_status`
- Payment: `payment_ref_id`, `payment_reference`, `payment_notes`, `paid_at`
- Split payment:
  - `driver_payment_status`, `driver_paid_at`, `driver_payment_ref_id`, `driver_payment_reference`, `driver_payment_notes`
  - `helper_payment_status`, `helper_paid_at`, `helper_payment_ref_id`, `helper_payment_reference`, `helper_payment_notes`
- Timestamps: `created_at`, `updated_at`

Worker module: `workers/push-worker/src/payroll-api.js`

Friendly refs:

- `PAY-YYYYMMDD-###`
- `PMT-YYYYMMDD-###`

### `person_balances`

Purpose: driver/helper balance tracking.

Source migration:

- `supabase/payroll-foundation.sql`

Important columns:

- `person_name`
- `person_role`
- `plate_number`
- balance fields
- timestamps

Worker routes:

- `GET /api/payroll/balances`
- `POST /api/payroll/balance-event`

### `payroll_balance_events`

Purpose: ledger-style events for payroll balances.

Source migration:

- `supabase/payroll-foundation.sql`

Worker route:

- `POST /api/payroll/balance-event`

### `payroll_rate_matrix`

Purpose: route/rate options used by payroll and driver mobile dropdowns.

Source migration:

- `supabase/payroll-rate-matrix.sql`

Important columns:

- source/destination fields
- product/group fields
- rate fields
- active/status fields

Worker routes:

- `GET /api/payroll/rates`
- `POST /api/payroll/rate-create`

### `payroll_trip_lines`

Purpose: trip line staging/details for payroll.

Source migration:

- `supabase/payroll-rate-matrix.sql`

Worker routes:

- `GET /api/payroll/trip-lines`
- `GET /api/payroll/trip-lines-by-plate`
- `POST /api/payroll/trip-line-upsert`
- `POST /api/payroll/trip-lines-bulk-upsert`

## 4. Frontend Pages and Their Data Flow

### Driver Portal

Files:

- `driver-portal.html`
- `driver-portal.js`

What it does:

- Shows a mobile login page.
- Stores driver session after login.
- Shows dashboard cards for Current Trip, PO Request, Trip Budget, Bali, My Requests, and notifications.

Endpoints:

- `POST /api/driver-portal/login`
- optional `GET /api/driver-portal/me`

Login request:

```ts
{
  username: string;
  password: string;
}
```

Login response:

```ts
{
  ok: true;
  driver: {
    username: string;
    plate_number: string;
    driver_name?: string;
    helper_name?: string;
    group_name?: string;
    mobile_number?: string;
  };
}
```

Failure response:

```ts
{
  ok: false;
  error: string;
}
```

Session keys:

- `vnsDriverPortalSession` in `localStorage`
- `vnsDriverPortalSession` in `sessionStorage`

Stored session shape:

```ts
{
  username: string;
  plate_number: string;
  driver_name?: string;
  helper_name?: string;
  group_name?: string;
  mobile_number?: string;
  logged_at: string;
}
```

Demo mode:

- `driver-portal.html?demo=1`
- creates a local demo session with plate `TEST123`, driver `Test Driver`, helper `Test Helper`, group `2GO`.

CDA8651 expectation:

- Real login should use Worker/Supabase.
- Previous test expectation used `CDA8651`; the migration comment sample uses a temporary password of `123456`, while a later manual test mentioned `8651`. Verify actual Supabase row before React hardcodes any test assumption.

Dashboard links:

- Current Trip: `driver-trip.html?plate=PLATE`
- PO Request: `driver-cash.html?plate=PLATE&type=po`
- Trip Budget: `driver-cash.html?plate=PLATE&type=trip_budget`
- Bali: `driver-cash.html?plate=PLATE&type=bali`
- My Requests: `driver-requests.html?plate=PLATE`

UI assumptions:

- Before login, show login only.
- After login, show assigned plate/truck card and action cards.
- Do not show internal IDs or passwords.

### Driver Cash / PO / Trip Budget / Bali

Files:

- `driver-cash.html`
- `driver-cash.js`

What it does:

- Mobile request form with tabs for PO, Trip Budget, and Bali.
- Uses URL and/or session context to prefill and lock assigned truck fields.

Supported query params:

- `plate=PLATE`
- `truck=TRUCK_ID`
- `type=po`
- `type=trip_budget`
- `type=bali`

Context priority:

1. URL `plate` / `truck`
2. `vnsDriverPortalSession` in storage
3. manual fallback with warning

Endpoints called:

- `GET /api/trucks/list`
- `GET /api/payroll/rates`
- `POST /api/cash/create`

Common payload fields:

```ts
{
  id: string;
  plateNumber: string;
  driverName: string;
  helperName?: string;
  mobileNumber?: string;
  groupCategory?: string;
  status: "For Approval";
  approval_status: "Pending";
  payment_status: "Unpaid";
  sourceModule: "driver_mobile";
  source_module: "driver_mobile";
  createdAt: string;
  updatedAt: string;
}
```

PO payload:

```ts
{
  type: "Cash PO";
  request_type: "Cash PO";
  date: string;
  request_date: string;
  dateNeeded: string;
  source: string;
  destination: string;
  route: string;
  amount: number;
  budgetAmount: number;
  budgetType: "PO";
  remarks: string;
}
```

Trip Budget payload:

```ts
{
  type: "Trip Budget";
  request_type: "Trip Budget";
  date: string;
  request_date: string;
  dateNeeded: string;
  source: string;
  destination: string;
  route: string;
  amount: number;
  budgetAmount: number;
  budgetType: "Trip Budget";
  depositNeeded: "Yes";
  depositTo: string;
  receiverName: string;
  personName: string;
  depositNumber: string;
  accountNumber: string;
  remarks?: string;
}
```

Bali payload:

```ts
{
  type: "Bali / Cash Advance";
  request_type: "Bali / Cash Advance";
  date: string;
  request_date: string;
  dateNeeded: string;
  amount: number;
  reason: string;
  remarks: string;
  depositNeeded: "Yes";
  depositTo: "GCash / Account";
  receiverName: string;
  personName: string;
  personType?: string;
  depositNumber: string;
  accountNumber: string;
}
```

Expected response:

```ts
{
  ok: true;
  record: CashRequestRecord;
  refId?: string;
}
```

The frontend reads friendly refs from `refId`, `record.request_no`, or `record.cash_ref_id`.

Table affected:

- `cash_requests`

Status transitions:

- Initial: `status = "For Approval"`, `approval_status = "Pending"`, `payment_status = "Unpaid"`
- Approval/payment happens later in approval/payment pages.

Friendly ref prefixes:

- PO: `CPO`
- Trip Budget: `TBUD`
- Bali: `BALI`

### Driver Trip

Files:

- `driver-trip.html`
- `driver-trip.js`

What it does:

- Mobile current trip submission.
- Saves into a review/staging table, not final payroll.

Endpoints called:

- `GET /api/trucks/list`
- `GET /api/payroll/rates`
- `POST /api/driver-trip/create`

Payload:

```ts
{
  plate_number: string;
  driver_name: string;
  helper_name?: string;
  mobile_number?: string;
  trip_date: string;
  shipment_number: string;
  container_number?: string;
  product_line: string;
  source: string;
  destination: string;
  trip_status: string;
  remarks?: string;
  submission_status: "Submitted";
  source_module: "driver_mobile";
}
```

Required fields in current frontend/Worker:

- `plate_number`
- `driver_name`
- `trip_date`
- `shipment_number`
- `source`
- `destination`

Frontend also treats `product_line`, source, and destination as required.

Expected response:

```ts
{
  ok: true;
  record: DriverTripRecord;
  refId?: string;
  trip_ref_id?: string;
}
```

Table affected:

- `driver_trip_submissions`

Friendly ref:

- `DTRIP-YYYYMMDD-###`

Approval flow:

- Initial `submission_status = "Submitted"`.
- Mobile approval can call `/api/driver-trip/update-status` to set `Approved`, `Returned`, or `Rejected`, but this still does not create a final payroll record.

### Driver Requests

Files:

- `driver-requests.html`
- `driver-requests.js`

What it does:

- Shows a driver’s own request and payment status.
- Combines cash requests and driver trip submissions.

Endpoints:

- `GET /api/cash/list?limit=500&plate_number=PLATE`
- `GET /api/driver-trip/list?limit=500&plate_number=PLATE`

Response expected:

```ts
{
  ok: true;
  records: Array<CashRequestRecord | DriverTripRecord>;
}
```

React should render:

- Friendly ref only
- Type
- Amount if present
- Source to destination if present
- Date submitted
- Approval status
- Payment status if present
- Latest remarks/notes

Do not show:

- UUID
- `request_id`
- `payroll_id`
- raw database ID

Status display mapping:

- paid payment status -> `Paid`
- for payment / for deposit -> `For Payment`
- approved + unpaid -> `For Payment`
- approved -> `Approved`
- returned -> `Returned`
- rejected -> `Rejected`
- submitted -> `Submitted`
- otherwise -> `Pending Approval`

### Repair

Files:

- `repair.html`
- `script.js` for legacy shared frontend behavior
- no `repair.js` was found

What it does:

- Repair page contains several forms/cards:
  - Parts Request
  - Equipment Request
  - Labor Payment Request
  - Completed Repair
  - Repair Monitoring Update

Worker endpoints:

- `POST /api/repair/create`
- `GET /api/repair/list`
- `POST /api/repair/update-status`
- `POST /api/repair/backup-status`
- `POST /api/repair/for-repair-truck`
- `POST /api/repair/media/upload`
- `GET /api/repair/media/signed-url`

Typical repair payload fields:

```ts
{
  request_id?: string;
  request_type: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  group_name?: string;
  payee_name?: string;
  account_number?: string;
  amount?: number;
  total_amount?: number;
  repair_issue?: string;
  description?: string;
  remarks?: string;
  repair_items?: unknown[];
  labor_items?: unknown[];
  status?: string;
  approval_status?: string;
  repair_status?: string;
  payment_status?: string;
}
```

Friendly ref prefixes:

- Labor Payment: `LAB`
- Equipment: `EQP`
- Parts Request: `PART`
- Other Repair / Repair Monitoring: `OTHREP`
- Truck Repair / For Repair: `TRKREP`
- default: `REP`

Approval/payment flow:

- Repair requests appear in approval center.
- Approved repair requests appear in payment queue.
- Mark paid creates/uses `PMT` payment refs when returned by backend.

### Mobile Approval

Files:

- `mobile-approval.html`
- `mobile-approval.js`

What it does:

- Phone-first approval center for pending and historical approval review.

Loaded endpoints:

- `GET /api/cash/list?limit=500`
- `GET /api/repair/list?limit=500`
- `GET /api/payroll/list?limit=500`
- `GET /api/driver-trip/list?limit=500`

Modules/tabs:

- Cash / PO / Bali
- Repair / Labor
- Payroll
- Driver Trips

State views:

- `For Approval`: pending/waiting review items.
- `Approval History`: approved, returned, rejected, or completed review states available in loaded data.

Overview reminder:

- Local frontend summary after records load.
- Shows counts, oldest pending, highest amount.
- Does not fetch a separate summary endpoint.

Count badges:

- Derived client-side from loaded records by module and status view.

View Details modal:

- Uses normalized record fields.
- Shows friendly ref and relevant details.
- Should not show internal UUIDs or raw JSON.

Approval update payloads:

Cash:

```ts
POST /api/cash/update-status
{
  request_id: string;
  status: "Approved" | "Returned" | "Rejected";
  approval_status: string;
  payment_status?: "Unpaid";
  approved_by?: "Mobile Approval";
  approved_at?: string;
  notes?: string;
}
```

Repair:

```ts
POST /api/repair/update-status
{
  request_id: string;
  status: string;
  approval_status: string;
  repair_status: string;
  payment_status?: "Unpaid";
  approved_by?: "Mobile Approval";
  approved_at?: string;
  notes?: string;
}
```

Payroll:

```ts
POST /api/payroll/update-status
{
  payroll_id: string;
  status: string;
  approval_status: string;
  payment_status?: "Unpaid";
  approved_by?: "Mobile Approval";
  approved_at?: string;
}
```

Driver trip:

```ts
POST /api/driver-trip/update-status
{
  trip_ref_id: string;
  submission_status: string;
  remarks?: string;
}
```

React should replicate:

- Module tabs.
- For Approval / Approval History state switch.
- Client-side count badges.
- View Details modal.
- Approve / Return / Reject flows.
- Duplicate-submit guard.

### Mobile Payment

Files:

- `mobile-payment.html`
- `mobile-payment.js`

What it does:

- Phone-first payment center for approved unpaid and paid history records.

Loaded endpoints:

- `GET /api/cash/list?limit=500`
- `GET /api/repair/list?limit=500`
- `GET /api/payroll/list?limit=500`

Modules/tabs:

- Cash / PO / Bali
- Repair / Labor
- Payroll

State views:

- `For Payment`: approved but unpaid / ready for payment.
- `Payment History`: already paid or historical payment records available in loaded data.

Overview reminder:

- Local frontend summary after records load.
- Shows for-payment count, total unpaid amount if computable, highest unpaid item, and paid-today count if available.

View Details modal:

- Shows friendly ref, payment status, payment refs, amount, payee/account, approval/payment dates, notes.

Mark as Paid payloads:

Cash:

```ts
POST /api/cash/update-status
{
  request_id: string;
  status: "Paid";
  payment_status: "Paid";
  payment_reference?: string;
  payment_notes?: string;
  paid_at: string;
  paid_by: "Mobile Payment";
}
```

Repair:

```ts
POST /api/repair/update-status
{
  request_id: string;
  status: "Paid";
  payment_status: "Paid";
  payment_reference?: string;
  payment_notes?: string;
  paid_at: string;
  paid_by: "Mobile Payment";
}
```

Payroll split payment:

```ts
POST /api/payroll/update-status
{
  payroll_id: string;
  approval_status: "Approved";
  driver_payment_status?: "Paid";
  driver_payment_reference?: string;
  driver_payment_notes?: string;
  driver_paid_at?: string;
  helper_payment_status?: "Paid";
  helper_payment_reference?: string;
  helper_payment_notes?: string;
  helper_paid_at?: string;
  status?: "Paid";
  payment_status?: "Paid";
  paid_at?: string;
  payment_reference?: string;
  payment_notes?: string;
}
```

PMT handling:

- Worker may return `payment_ref_id`, `driver_payment_ref_id`, or `helper_payment_ref_id`.
- React must only display a payment ref if the backend returns one.

React should replicate:

- Module tabs.
- For Payment / Payment History switch.
- View Details modal.
- Mark as Paid modal/form.
- Payroll split payment buttons.
- Duplicate-submit guard.

### Desktop Approval Center

Files:

- `approval-center.html`
- `approval-center.js`

What it does:

- Desktop approval hub.
- Loads cash, repair, payroll, and related approval records.
- More mature fallback/backup behavior than mobile approval.

Primary Worker endpoints:

- `GET /api/cash/list`
- `POST /api/cash/update-status`
- `POST /api/cash/backup-status`
- `GET /api/repair/list`
- `POST /api/repair/update-status`
- `POST /api/repair/backup-status`
- `GET /api/payroll/list`
- `POST /api/payroll/update-status`

Legacy/fallback endpoints:

- cash Apps Script URL
- repair Apps Script URL
- payroll liquidation Apps Script URL

More complete than mobile:

- More fallback behavior.
- Backup status calls.
- More legacy compatibility logic.

React recommendation:

- Use mobile approval UI behavior.
- Verify approve/return/reject payloads against `approval-center.js`.
- Prefer Worker routes over Apps Script.

### Desktop Payment Queue

Files:

- `payment-queue.html`
- `payment-queue.js`

What it does:

- Desktop queue for marking approved requests as paid.
- Handles cash, repair, and payroll payment flows.
- Supports payroll split payment.

Primary Worker endpoints:

- `GET /api/cash/list`
- `POST /api/cash/update-status`
- `GET /api/repair/list`
- `POST /api/repair/update-status`
- `GET /api/payroll/list`
- `POST /api/payroll/update-status`
- `POST /api/push/notify-paid`

Legacy/fallback endpoints:

- cash Apps Script URL
- repair Apps Script URL

More complete than mobile:

- More payment queue filtering.
- More backup/fallback behavior.
- Payroll split payment has established desktop payload patterns.

React recommendation:

- Use mobile payment UI behavior.
- Verify payment payloads against `payment-queue.js`.
- Keep Worker routes unchanged initially.

## 5. Worker API Route Map

Routes are registered in `workers/push-worker/src/index.js`.

### Driver Portal

`POST /api/driver-portal/login`

- Frontend: `driver-portal.js`
- Module: `driver-portal-api.js`
- Body: `{ username, password }`
- Table: `driver_portal_users`
- Output: `{ ok, driver }` or `{ ok:false, error }`

`GET /api/driver-portal/me`

- Frontend: optional/future
- Module: `driver-portal-api.js`
- Query: `username`
- Table: `driver_portal_users`
- Output: public driver profile

### Cash

`POST /api/cash/create`

- Frontend: `cash.js`, `driver-cash.js`
- Module: `cash-api.js`
- Body: cash request payload with aliases accepted
- Table: `cash_requests`
- Output: `{ ok:true, record, refId? }`
- Generates: `CPO`, `TBUD`, or `BALI`

`GET /api/cash/list`

- Frontend: `driver-requests.js`, `mobile-approval.js`, `mobile-payment.js`, `approval-center.js`, `payment-queue.js`
- Module: `cash-api.js`
- Query: `limit`, `status`, `approval_status`, `payment_status`, `plate_number`, `driver_name`, `includeDeleted`
- Table: `cash_requests`
- Output: `{ ok:true, records }`

`POST /api/cash/update-status`

- Frontend: approval/payment pages
- Module: `cash-api.js`
- Body: `{ request_id, status?, approval_status?, payment_status?, approved_by?, paid_by?, payment_reference?, payment_notes?, notes? }`
- Table: `cash_requests`
- Status transition: approval or payment update
- Generates: `PMT` if marking paid and missing payment ref

`POST /api/cash/backup-status`

- Frontend: desktop approval/payment backup behavior
- Module: `cash-api.js`
- Body: backup status payload
- Table: `cash_requests`

### Repair

`POST /api/repair/create`

- Frontend: repair page / legacy script
- Module: `repair-api.js`
- Body: repair request payload
- Table: `repair_requests`
- Generates repair friendly ref

`GET /api/repair/list`

- Frontend: mobile/desktop approval and payment
- Module: `repair-api.js`
- Query: `limit`, status filters
- Table: `repair_requests`
- Output: `{ ok:true, records }`

`POST /api/repair/update-status`

- Frontend: mobile/desktop approval and payment
- Module: `repair-api.js`
- Body: `{ request_id, status?, approval_status?, repair_status?, payment_status?, payment_reference?, payment_notes? }`
- Table: `repair_requests`
- Generates: `PMT` if marking paid and missing payment ref

`POST /api/repair/backup-status`

- Frontend: desktop backup behavior
- Module: `repair-api.js`
- Table: `repair_requests`

`POST /api/repair/for-repair-truck`

- Frontend: repair page
- Module: `repair-api.js`
- Table: `for_repair_trucks`
- Generates: `TRKREP`

`POST /api/repair/media/upload`

- Frontend: repair media upload if used
- Module: `repair-api.js`
- Supabase storage bucket: `repair-media`

`GET /api/repair/media/signed-url`

- Frontend: repair media view if used
- Module: `repair-api.js`
- Supabase storage bucket: `repair-media`

### Payroll

`POST /api/payroll/create`

- Frontend: `payroll.js`
- Module: `payroll-api.js`
- Table: `payroll_records`
- Generates: `PAY`

`GET /api/payroll/list`

- Frontend: mobile/desktop approval and payment
- Module: `payroll-api.js`
- Query: list filters
- Table: `payroll_records`

`POST /api/payroll/update-status`

- Frontend: mobile/desktop approval and payment
- Module: `payroll-api.js`
- Body: payroll approval/payment/split payment payload
- Table: `payroll_records`
- Generates: `PMT` refs when applicable

`GET /api/payroll/balances`

- Frontend: payroll pages
- Module: `payroll-api.js`
- Table: `person_balances`

`POST /api/payroll/balance-event`

- Frontend: payroll pages
- Module: `payroll-api.js`
- Table: `payroll_balance_events`

`GET /api/payroll/rates`

- Frontend: `payroll.js`, `driver-cash.js`, `driver-trip.js`
- Module: `payroll-api.js`
- Table: `payroll_rate_matrix`

`POST /api/payroll/rate-create`

- Frontend: payroll/master data
- Module: `payroll-api.js`
- Table: `payroll_rate_matrix`

`GET /api/payroll/trip-lines`

- Frontend: payroll
- Module: `payroll-api.js`
- Table: `payroll_trip_lines`

`GET /api/payroll/trip-lines-by-plate`

- Frontend: payroll
- Module: `payroll-api.js`
- Table: `payroll_trip_lines`

`POST /api/payroll/trip-line-upsert`

- Frontend: payroll
- Module: `payroll-api.js`
- Table: `payroll_trip_lines`

`POST /api/payroll/trip-lines-bulk-upsert`

- Frontend: payroll
- Module: `payroll-api.js`
- Table: `payroll_trip_lines`

### Truck Lookup

`GET /api/trucks/list`

- Frontend: `driver-cash.js`, `driver-trip.js`
- Module: handled in `index.js`
- Query: `active`, `limit`, `plate_number`, `plateNumber`, `truck_id`, `truckId`, `group_category`
- Table: `trucks`
- Output: normalized truck list

### Driver Trips

`POST /api/driver-trip/create`

- Frontend: `driver-trip.js`
- Module: `driver-trip-api.js`
- Body: driver trip payload
- Table: `driver_trip_submissions`
- Generates: `DTRIP`

`GET /api/driver-trip/list`

- Frontend: `driver-requests.js`, `mobile-approval.js`
- Module: `driver-trip-api.js`
- Query: `limit`, `submission_status`, `plate_number`, `driver_name`, `trip_date`
- Table: `driver_trip_submissions`

`POST /api/driver-trip/update-status`

- Frontend: `mobile-approval.js`
- Module: `driver-trip-api.js`
- Body: `{ trip_ref_id, submission_status, remarks? }`
- Table: `driver_trip_submissions`

### Push / Notifications

`GET /api/push/check`

- Frontend: push/admin checks
- Module: `approval-checker.js` and checker modules
- Output: pending approval notification data

Other push routes:

- `GET /api/push/debug-sources`
- `GET /api/push/debug-payment-queue`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`
- `POST /api/push/test`
- `POST /api/push/run-check`
- `POST /api/push/run-payment-check`
- `POST /api/push/notify-paid`
- `POST /api/push/acknowledge`

Frontend notification status is currently browser-permission-level for mobile pages. Driver-specific push updates are not fully proven connected.

## 6. Status and Payment State Machine

### Cash / PO / Bali / Trip Budget

Initial driver mobile submit:

- `status = "For Approval"`
- `approval_status = "Pending"`
- `payment_status = "Unpaid"`

After approve:

- `status = "Approved"` or equivalent
- `approval_status = "Approved"`
- `payment_status = "Unpaid"`

After return:

- `status = "Returned"`
- `approval_status = "Returned"`

After reject:

- `status = "Rejected"`
- `approval_status = "Rejected"`

After payment:

- `status = "Paid"`
- `payment_status = "Paid"`
- `paid_at` set
- `payment_ref_id` may be generated

### Driver Trip

Initial:

- `submission_status = "Submitted"`

After review:

- `submission_status = "Approved"`
- `submission_status = "Returned"`
- `submission_status = "Rejected"`

No payment state is used for driver trip submissions.

### Repair

Common statuses:

- `Pending`
- `For Approval`
- `Approved`
- `Returned`
- `Rejected`
- `Paid`
- repair-specific status in `repair_status`

After payment:

- `payment_status = "Paid"`
- `payment_ref_id` may be generated

### Payroll

Worker-valid payroll statuses include:

- `Draft`
- `For Approval`
- `Approved`
- `For Deposit`
- `Deposited`
- `Paid`
- `Returned`
- `Rejected`
- `Cancelled`

Worker-valid approval statuses include:

- `Draft`
- `Pending`
- `For Approval`
- `Approved`
- `Returned`
- `Rejected`
- `Cancelled`

Worker-valid payment statuses include:

- `Unpaid`
- `For Deposit`
- `Deposited`
- `Paid`
- `Cancelled`

Payroll split payment:

- Driver side: `driver_payment_status = "Paid"`
- Helper side: `helper_payment_status = "Paid"`
- If one side is paid and the other is unpaid, UI treats record as `Partially Paid`.
- If both are paid, Worker/frontend can set:
  - `status = "Paid"`
  - `payment_status = "Paid"`

## 7. Friendly Reference ID Rules

React must display friendly refs only and must never show internal UUIDs, `request_id`, `payroll_id`, or raw database IDs to normal users.

| Prefix | Meaning | Generated in | Table column |
| --- | --- | --- | --- |
| `CPO` | Cash PO | Worker `cash-api.js` | `cash_requests.request_no`, `cash_ref_id` |
| `TBUD` | Trip Budget | Worker `cash-api.js` | `cash_requests.request_no`, `cash_ref_id` |
| `BALI` | Bali / Cash Advance | Worker `cash-api.js` | `cash_requests.request_no`, `cash_ref_id` |
| `DTRIP` | Driver trip submission | Worker `driver-trip-api.js` | `driver_trip_submissions.trip_ref_id` |
| `LAB` | Labor payment repair request | Worker `repair-api.js` | `repair_requests.request_no`, `repair_ref_id` |
| `EQP` | Equipment request | Worker `repair-api.js` | `repair_requests.request_no`, `repair_ref_id` |
| `PART` | Parts request | Worker `repair-api.js` | `repair_requests.request_no`, `repair_ref_id` |
| `OTHREP` | Other repair / repair monitoring | Worker `repair-api.js` | `repair_requests.request_no`, `repair_ref_id` |
| `TRKREP` | Truck repair / for-repair truck | Worker `repair-api.js` | `repair_requests.repair_ref_id`, `for_repair_trucks.truck_repair_ref_id` |
| `REP` | Fallback repair ref | Worker `repair-api.js` | `repair_requests.request_no`, `repair_ref_id` |
| `PAY` | Payroll record | Worker `payroll-api.js` | `payroll_records.payroll_ref_id` |
| `PMT` | Payment reference | Worker cash/repair/payroll APIs | `payment_ref_id`, split payroll payment ref columns |

Generation pattern:

```text
PREFIX-YYYYMMDD-###
```

The Worker generates these by checking the existing max reference for the date/table/column and incrementing the sequence.

## 8. Data Models for React

These interfaces are based on current field names and aliases. React can normalize to camelCase internally, but API payloads should keep backend-compatible names.

```ts
export interface ApiResponse<T> {
  ok: boolean;
  record?: T;
  records?: T[];
  refId?: string;
  error?: string;
  message?: string;
}

export interface DriverSession {
  username: string;
  plate_number: string;
  driver_name?: string;
  helper_name?: string;
  group_name?: string;
  mobile_number?: string;
  logged_at?: string;
}

export interface DriverCashRequestPayload {
  id?: string;
  type: "Cash PO" | "Trip Budget" | "Bali / Cash Advance";
  request_type: string;
  plateNumber: string;
  driverName: string;
  helperName?: string;
  mobileNumber?: string;
  groupCategory?: string;
  date?: string;
  request_date?: string;
  dateNeeded?: string;
  source?: string;
  destination?: string;
  route?: string;
  amount: number;
  budgetAmount?: number;
  budgetType?: "PO" | "Trip Budget";
  depositNeeded?: "Yes" | "No";
  depositTo?: string;
  receiverName?: string;
  personName?: string;
  personType?: string;
  depositNumber?: string;
  accountNumber?: string;
  reason?: string;
  remarks?: string;
  status: "For Approval";
  approval_status: "Pending";
  payment_status: "Unpaid";
  sourceModule: "driver_mobile";
  source_module: "driver_mobile";
}

export interface DriverTripSubmissionPayload {
  plate_number: string;
  driver_name: string;
  helper_name?: string;
  mobile_number?: string;
  trip_date: string;
  shipment_number: string;
  container_number?: string;
  product_line?: string;
  source: string;
  destination: string;
  trip_status: string;
  remarks?: string;
  submission_status: "Submitted";
  source_module: "driver_mobile";
}

export interface CashRequestRecord {
  id?: string;
  request_id?: string;
  request_no?: string;
  cash_ref_id?: string;
  request_date?: string;
  request_type?: string;
  budget_type?: string;
  amount?: number | string;
  source?: string;
  destination?: string;
  route?: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  group_name?: string;
  receiver_name?: string;
  deposit_to?: string;
  account_number?: string;
  remarks?: string;
  status?: string;
  approval_status?: string;
  payment_status?: string;
  approved_by?: string;
  approved_at?: string;
  paid_by?: string;
  paid_at?: string;
  payment_ref_id?: string;
  payment_reference?: string;
  payment_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DriverTripRecord {
  id?: string;
  trip_ref_id: string;
  plate_number: string;
  driver_name: string;
  helper_name?: string;
  mobile_number?: string;
  trip_date: string;
  shipment_number: string;
  container_number?: string;
  product_line?: string;
  source: string;
  destination: string;
  trip_status?: string;
  remarks?: string;
  submission_status: string;
  created_at?: string;
  updated_at?: string;
}

export interface RepairRequestRecord {
  id?: string;
  request_id?: string;
  request_no?: string;
  repair_ref_id?: string;
  request_type?: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  group_name?: string;
  payee_name?: string;
  account_number?: string;
  amount?: number | string;
  total_amount?: number | string;
  final_cost?: number | string;
  approved_amount?: number | string;
  repair_issue?: string;
  description?: string;
  remarks?: string;
  repair_items?: unknown[];
  labor_items?: unknown[];
  status?: string;
  approval_status?: string;
  repair_status?: string;
  payment_status?: string;
  approved_by?: string;
  approved_at?: string;
  paid_by?: string;
  paid_at?: string;
  payment_ref_id?: string;
  payment_reference?: string;
  payment_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PayrollRecord {
  id?: string;
  payroll_id?: string;
  payroll_ref_id?: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  payroll_date?: string;
  period_start?: string;
  period_end?: string;
  driver_gross_pay?: number | string;
  helper_gross_pay?: number | string;
  driver_net_pay?: number | string;
  helper_net_pay?: number | string;
  total_net_pay?: number | string;
  status?: string;
  approval_status?: string;
  payment_status?: string;
  payment_ref_id?: string;
  payment_reference?: string;
  payment_notes?: string;
  paid_at?: string;
  driver_payment_status?: string;
  driver_paid_at?: string;
  driver_payment_ref_id?: string;
  driver_payment_reference?: string;
  driver_payment_notes?: string;
  helper_payment_status?: string;
  helper_paid_at?: string;
  helper_payment_ref_id?: string;
  helper_payment_reference?: string;
  helper_payment_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalRecord {
  module: "cash" | "repair" | "payroll" | "driver-trip";
  internal_id: string;
  ref_id: string;
  type: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  payee?: string;
  amount?: number;
  source?: string;
  destination?: string;
  route?: string;
  submitted_at?: string;
  approval_status?: string;
  payment_status?: string;
  remarks?: string;
  raw?: CashRequestRecord | RepairRequestRecord | PayrollRecord | DriverTripRecord;
}

export interface PaymentRecord {
  module: "cash" | "repair" | "payroll";
  internal_id: string;
  ref_id: string;
  payment_ref_id?: string;
  type: string;
  plate_number?: string;
  driver_name?: string;
  helper_name?: string;
  payee?: string;
  amount?: number;
  source?: string;
  destination?: string;
  route?: string;
  approved_at?: string;
  approval_status?: string;
  payment_status?: string;
  payment_reference?: string;
  payment_notes?: string;
  driver_amount?: number;
  helper_amount?: number;
  driver_payment_status?: string;
  helper_payment_status?: string;
  raw?: CashRequestRecord | RepairRequestRecord | PayrollRecord;
}
```

Alias notes:

- Frontend sometimes sends camelCase (`plateNumber`, `driverName`), while Supabase stores snake_case (`plate_number`, `driver_name`).
- Worker modules accept many aliases. React should standardize internal models but send payload names already known to work.
- Display should prefer friendly refs in this order:
  - cash: `request_no`, `cash_ref_id`
  - repair: `request_no`, `repair_ref_id`
  - trip: `trip_ref_id`
  - payroll: `payroll_ref_id`
  - payment: `payment_ref_id`, split payment ref fields

## 9. React Implementation Recommendation

Recommended source of truth:

- Driver mobile React should use the current driver mobile HTML/JS files as the UX and payload source:
  - `driver-portal.js`
  - `driver-cash.js`
  - `driver-trip.js`
  - `driver-requests.js`
- Approval React should use mobile UI behavior from `mobile-approval.js`, but verify action payloads against `approval-center.js`.
- Payment React should use mobile UI behavior from `mobile-payment.js`, but verify paid/split-pay payloads against `payment-queue.js`.
- Backend/Worker routes should remain unchanged initially.

Avoid:

- Adding new Supabase direct calls from React.
- Exposing service role keys.
- Recreating Google Apps Script fallback behavior unless there is a confirmed business need.
- Showing internal IDs.
- Faking success when backend calls fail.

## 10. Migration Plan to React

### Phase 1: Read-only mobile dashboard

- Build React shell and route structure.
- Implement API client.
- Implement driver login/session storage.
- Implement dashboard and truck card.
- Implement read-only request lists.
- Implement mobile approval/payment read-only cards.

### Phase 2: Driver submissions

- Submit PO, Trip Budget, and Bali through `POST /api/cash/create`.
- Submit Current Trip through `POST /api/driver-trip/create`.
- Keep no-fake-success behavior.
- Display friendly refs returned by backend.

### Phase 3: Approval actions

- Implement approve/return/reject for cash, repair, payroll, and driver trips.
- Use payloads verified against desktop approval.
- Add duplicate-submit guards.

### Phase 4: Payment actions

- Implement Mark as Paid for cash and repair.
- Implement payroll split payment:
  - Mark Driver as Paid
  - Mark Helper as Paid
  - Mark whole record paid when both sides are paid
- Display PMT refs only when backend returns them.

### Phase 5: Production hardening

- Add real history endpoints if current list endpoints do not return enough history.
- Add role-based access.
- Replace temporary password login with hashed password/session token flow.
- Add driver-specific notifications.
- Add admin/father/sister portal separation.

## 11. Risks / Unknowns

- `repair.js` is not present. Repair frontend logic appears to be in `repair.html` plus `script.js`.
- Base migration for `repair_requests` was not clearly found, although many migrations alter it and Worker uses it.
- Mobile history views only show records returned by current list endpoints. If endpoints are filtered in production, history may be incomplete.
- Google Apps Script dependencies still exist in desktop cash/approval/payment/notification code as fallback or backup paths.
- Driver login uses `temporary_password` server-side, not a production session/token system.
- There is no real role-based access for mobile approval/payment pages yet.
- Notification buttons request browser permission, but driver-specific push subscription/targeting is not fully proven.
- CDA8651 test password is unclear from code/migration comments. Migration sample uses `123456`; a previous manual test mentioned `8651`.
- Cash/repair/payroll modules use different aliases for the same concept. React should normalize internally and keep backend payload compatibility.

## 12. Claude Handoff Prompt

Copy-paste prompt for Claude:

```text
Build a React mobile app for the VNS mobile system using the existing Cloudflare Worker/Supabase backend. Do not change backend routes initially. Do not call Supabase directly from the frontend. Do not expose service role keys. Do not fake success. Show only friendly reference IDs, never internal UUIDs, request_id, payroll_id, or raw database IDs.

API base:
- Use env var VITE_VNS_WORKER_API_BASE.
- Default current backend: https://vns-push-worker.santosvicenteiii.workers.dev

React routes to build:
- /driver-portal
- /driver-cash?plate=PLATE&type=po
- /driver-cash?plate=PLATE&type=trip_budget
- /driver-cash?plate=PLATE&type=bali
- /driver-trip?plate=PLATE
- /driver-requests?plate=PLATE
- /mobile-approval
- /mobile-payment

Core components:
- AppShell
- VnsHeader
- LoginCard
- DriverDashboard
- TruckCard
- ActionCard
- CashRequestForm with tabs PO / Trip Budget / Bali
- TripSubmissionForm
- DriverRequestsList
- ModuleTabs
- StatePills
- ApprovalCard
- PaymentCard
- DetailsModal
- PaymentModal
- StatusBadge
- AmountText
- EmptyState
- Toast/StatusMessage

API client methods:
- loginDriver(username, password): POST /api/driver-portal/login
- getDriverMe(username): GET /api/driver-portal/me?username=...
- listTrucks(params): GET /api/trucks/list
- listPayrollRates(): GET /api/payroll/rates?limit=1000
- createCashRequest(payload): POST /api/cash/create
- listCashRequests(params): GET /api/cash/list
- updateCashStatus(payload): POST /api/cash/update-status
- createDriverTrip(payload): POST /api/driver-trip/create
- listDriverTrips(params): GET /api/driver-trip/list
- updateDriverTripStatus(payload): POST /api/driver-trip/update-status
- listRepairs(params): GET /api/repair/list
- updateRepairStatus(payload): POST /api/repair/update-status
- listPayroll(params): GET /api/payroll/list
- updatePayrollStatus(payload): POST /api/payroll/update-status
- notifyPaid(payload): POST /api/push/notify-paid, fire-and-forget only after paid succeeds

Driver session:
- Store key vnsDriverPortalSession in localStorage and sessionStorage.
- Shape: username, plate_number, driver_name, helper_name, group_name, mobile_number, logged_at.
- Preserve demo mode equivalent for TEST123 if needed.
- Preserve real CDA8651 login through backend; do not hardcode real account data.

Driver cash behavior:
- Use URL type values po, trip_budget, bali.
- Use URL/session truck context priority.
- Lock plate_number, driver_name, helper_name when session/truck context exists.
- PO posts to /api/cash/create and expects CPO ref.
- Trip Budget posts to /api/cash/create and expects TBUD ref.
- Bali posts to /api/cash/create and expects BALI ref.
- Initial statuses: status For Approval, approval_status Pending, payment_status Unpaid.

Driver trip behavior:
- POST /api/driver-trip/create.
- Payload fields: plate_number, driver_name, helper_name, mobile_number, trip_date, shipment_number, container_number, product_line, source, destination, trip_status, remarks, submission_status Submitted, source_module driver_mobile.
- Expect DTRIP ref.
- Do not create final payroll directly.

Driver requests:
- Fetch /api/cash/list?limit=500&plate_number=PLATE.
- Fetch /api/driver-trip/list?limit=500&plate_number=PLATE.
- Combine and normalize.
- Display friendly ref, type, amount, route, submitted date, approval status, payment status, remarks.

Mobile approval:
- Load /api/cash/list?limit=500, /api/repair/list?limit=500, /api/payroll/list?limit=500, /api/driver-trip/list?limit=500.
- Module tabs: Cash/PO/Bali, Repair/Labor, Payroll, Driver Trips.
- Lower state pills: For Approval and Approval History.
- Approve/Return/Reject payloads must match existing mobile-approval.js and desktop approval-center.js.
- Use View Details modal.
- Use duplicate-submit guard.

Mobile payment:
- Load /api/cash/list?limit=500, /api/repair/list?limit=500, /api/payroll/list?limit=500.
- Module tabs: Cash/PO/Bali, Repair/Labor, Payroll.
- Lower state pills: For Payment and Payment History.
- Mark cash/repair as paid through update-status endpoints with status Paid and payment_status Paid.
- Payroll split payment must support driver and helper paid statuses separately.
- Display PMT refs only if returned by backend.
- Use duplicate-submit guard.

Data models:
- Implement DriverSession, DriverCashRequestPayload, DriverTripSubmissionPayload, CashRequestRecord, DriverTripRecord, RepairRequestRecord, PayrollRecord, ApprovalRecord, PaymentRecord, ApiResponse<T>.
- Normalize aliases internally but keep backend payload field names compatible.

UI requirements:
- Mobile-first app shell around 390-414px.
- VNS red/white theme.
- Clean cards, large touch targets, status badges, clear modals.
- No fake driver data except explicit demo mode.
- No internal IDs shown.
- Old HTML pages remain backup while React is built.
```

