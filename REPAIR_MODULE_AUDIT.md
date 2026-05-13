# Repair Module Audit

Audit date: 2026-05-13  
Scope: `appscript/repair-master/Code.js`, `appscript/repair-master/appsscript.json`, `repair.html`, `script.js`

## Summary

The website is pointed at the known live repair deployment URL:

```text
https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec
```

The pulled `appscript/repair-master/Code.js` appears to be a live-bound Apps Script that uses `SpreadsheetApp.getActiveSpreadsheet()`. It does **not** contain the known `VNS_Repair_Master` spreadsheet ID:

```text
1A_yPDhfXuRVuJy8kWL0uPBhIcJkg4mgLlv-cF-4tFq0
```

Do **not** push or deploy this repair script yet. The pulled code does not fully match the current frontend payload and likely differs from the fuller reference repair implementation described previously.

## Apps Script Spreadsheet Target

`appscript/repair-master/Code.js` writes to:

```js
SpreadsheetApp.getActiveSpreadsheet()
```

This means the actual Google Sheet is determined by the Apps Script project's bound spreadsheet, not by an explicit ID in source code.

Current Spreadsheet ID found in `Code.js`: **none**

Expected spreadsheet: `VNS_Repair_Master`  
Known expected spreadsheet ID: `1A_yPDhfXuRVuJy8kWL0uPBhIcJkg4mgLlv-cF-4tFq0`

Risk: from source alone, we cannot prove the pulled Apps Script is bound to `VNS_Repair_Master`. Confirm in Apps Script project settings or by opening the bound container before any push/deploy.

## Apps Script Tabs

Tabs expected by `Code.js`:

| Tab | Purpose | How used |
| --- | --- | --- |
| `Repair_Requests` | Main saved repair records | Save rows, list rows, update status |
| `Repair_Status_Log` | Status update history | Append log row during `updateStatus` |

Garage trucks are not read from a repair tab. `garageTrucks` reads from four dispatch spreadsheets:

| Source | Spreadsheet ID | Tab |
| --- | --- | --- |
| Bottle | `1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4` | `Bottle` |
| Sugar | `1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE` | `Sugar` |
| CapsCrown | `1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw` | `CapsCrown` |
| PreformResin | `1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw` | `PreformResin` |

## Apps Script Columns

`Repair_Requests` save appends these 34 columns in this exact order:

```text
Request_ID
Request_Type
Date_Requested
Date_Finished
Requested_By
Plate_Number
Truck_Type
Driver
Helper
Category
Repair_Parts
Work_Done
Quantity
Unit_Cost
Parts_Cost
Labor_Cost
Total_Cost
Supplier
Supplier_Contact
Payee
Status
Repair_Status
Payment_Status
Approved_By
Proof_Of_Payment
Receipt_Link
Photo_Link
Mechanic
Remarks
Source_Message
Created_At
Payment_Message
Saved_By
Last_Updated
```

`Repair_Status_Log` append row expects:

```text
Log_ID
Request_ID
Action
Old_Status
New_Status
Old_Payment_Status
New_Payment_Status
Updated_By
Updated_At
Remarks
```

Garage source tabs are expected to have headers on row 2, with data starting row 3:

```text
Plate Number
Driver
Helper
Status
Remarks
Full Address
Map Link
Timestamp
```

## Frontend Payload Columns

`script.js` currently builds a larger repair payload than `Code.js` writes. Extra frontend fields include:

```text
Odometer
Priority
Outside_Shop_Cost
Towing_Cost
Other_Cost
Original_Total_Cost
Final_Cost
Assigned_To
Shop_Name
Approval_Status
Cost_Remarks
```

Risk: these extra fields are silently dropped by the current Apps Script save flow.

## Supported GET Actions

`Code.js` supports:

| Action | Endpoint | Behavior |
| --- | --- | --- |
| health/default | `GET /exec` | Returns active message |
| `list` | `GET /exec?action=list` | Reads all non-empty rows from `Repair_Requests` and returns `{ success: true, records }` |
| `garageTrucks` | `GET /exec?action=garageTrucks` | Reads dispatch source sheets and returns `{ success: true, trucks }` |

This matches the required GET actions:

```text
GET ?action=list
GET ?action=garageTrucks
```

## Supported POST Actions

`Code.js` supports:

| POST body | Behavior |
| --- | --- |
| Array body | Batch append repair rows to `Repair_Requests` |
| `{ rows: [...] }` | Batch append repair rows to `Repair_Requests` |
| `{ action: "updateStatus", Request_ID, Status, Payment_Status, Remarks, Updated_By }` | Update `Status`, `Payment_Status`, `Last_Updated`, optional `Remarks`; append log row |

Important mismatch: the expected preserved behavior mentions:

```text
POST { repairRecordId, Status, ... } for status update
```

The pulled Apps Script does **not** look for `repairRecordId`; it requires `action: "updateStatus"` and `Request_ID`.

The current frontend sends `action: "updateStatus"` and `Request_ID`, so the current frontend and pulled Apps Script are aligned on status update identity. The older `repairRecordId` API shape is not implemented in pulled `Code.js`.

## Frontend Apps Script URL

`script.js` currently uses:

```js
const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";
```

This matches the known existing live repair deployment URL.

## Frontend LocalStorage Keys

Repair module localStorage keys used by `script.js`:

| Key | Purpose |
| --- | --- |
| `vnsForRepairTrucks` | Local-only for-repair unit list |
| `vnsRepairChangeRequests` | Local edit/delete request log for saved records |
| `vnsRepairPaymentUpdates` | Local payment/final-cost overlay updates |
| `vnsTruckMaster` | Current Truck Master source for repair plate dropdowns |
| `vnsTruckMasterfile` | Legacy Truck Master fallback for repair plate dropdowns |

## Save Flow Summary

Save path:

1. User parses a Viber message or enters a manual repair request.
2. `buildRepairPayload()` maps rows to Apps Script column-style fields.
3. `saveRepairRows()` posts `JSON.stringify(dataToSend)` to `REPAIR_WEB_APP_URL`.
4. Request uses:

```js
method: "POST"
mode: "no-cors"
Content-Type: "text/plain;charset=utf-8"
```

Likely write behavior: if the deployed Apps Script is the same as pulled `Code.js` and is bound to the correct spreadsheet, the save should append rows to `Repair_Requests`.

Risk: because the frontend uses `no-cors`, the browser cannot read the Apps Script response. The UI may show success even if the Apps Script returned `{ success: false }`, failed due to missing tabs, or dropped fields.

## Status Update Flow Summary

Status update path:

1. Saved records load from `GET ?action=list`.
2. UI builds a payload through `buildStatusUpdatePayload()`.
3. Payload includes:

```text
action: updateStatus
Request_ID
Status
Repair_Status
Payment_Status
Final_Cost
Cost_Remarks
Payee
Remarks
Updated_By
```

4. `postStatusUpdate()` posts to `REPAIR_WEB_APP_URL` with `mode: "no-cors"`.

Pulled Apps Script only updates:

```text
Status
Payment_Status
Last_Updated
Remarks
```

It does **not** update:

```text
Repair_Status
Final_Cost
Cost_Remarks
Payee
Original_Total_Cost
Approved_Cost
```

Risk: the frontend locally applies more changes than the Apps Script persists. After refresh/reload from Google Sheets, some status/final-cost changes may disappear.

## Garage Trucks / Plate Dropdown Reading

Garage trucks:

- Frontend calls `GET ?action=garageTrucks`.
- Apps Script reads four dispatch spreadsheets and filters rows whose `Full Address` contains `majada` or `valenzuela`.
- Frontend further filters by timestamp, defaulting to last 3 days.

Risk: `Code.js` assumes headers are on row 2 (`values[1]`) and data starts at row 3. If source sheets use row 1 headers, all column indexes become `-1` and garage trucks may fail or return bad data.

Plate dropdowns:

- Repair plate dropdowns read from browser localStorage Truck Master, not directly from Google Sheets.
- Current keys: `vnsTruckMaster`, fallback `vnsTruckMasterfile`.
- This works only if Truck Master data exists in the current browser origin or has been loaded there by the Master Data page.

## no-cors Findings

Yes, the repair frontend still uses `mode: "no-cors"` for:

```text
saveRepairRows()
postStatusUpdate()
legacy save listener near bottom of script.js
```

Yes, `no-cors` hides errors:

- JavaScript receives an opaque response.
- `response.json()` cannot be read.
- HTTP 500 / Apps Script JSON failure responses are not visible.
- The UI treats the request as successful if the network request itself does not throw.

GET calls do not use `no-cors` and can read JSON:

```text
GET ?action=list
GET ?action=garageTrucks
```

## Difference From Previous Reference Repair Implementation

The previous project audit/reference described a repair implementation with:

- Explicit `VNS_Repair_Master` spreadsheet ID to fill into `Code.js`
- `Repair_Requests` with about 45 columns matching `buildRepairPayload`
- `Garage_Trucks` tab with about 17 columns
- API compatibility warning around `no-cors`

The pulled live `appscript/repair-master/Code.js` differs:

- No explicit spreadsheet ID
- Uses active/bound spreadsheet
- No `Garage_Trucks` tab; garage data is pulled from dispatch source sheets
- Saves 34 columns, not the current frontend's larger payload
- Status update persists only a small subset of frontend status fields
- Requires `Request_ID`, not `repairRecordId`

## Risks / Blockers

1. Spreadsheet binding is not provable from source because `Code.js` has no spreadsheet ID.
2. Current `Code.js` does not preserve all frontend fields on save.
3. Status updates likely do not persist `Repair_Status`, final cost, cost remarks, or payee.
4. `no-cors` hides Apps Script errors and can show false success.
5. Garage trucks depend on dispatch sheet header row layout.
6. Pushing local `Code.js` could overwrite a live deployment with an older/narrower API if the cloud script has unpulled changes elsewhere.

## Is It Safe To Push?

No. It is **not safe to push or deploy yet**.

Reasons:

- The pulled script does not contain the known expected spreadsheet ID.
- The current frontend sends fields that the Apps Script does not save.
- The current frontend expects status changes that the Apps Script does not fully persist.
- `no-cors` prevents a reliable browser-side confirmation that writes succeeded.
- The source does not prove the script is bound to `VNS_Repair_Master`.

## Exact Next Steps

1. In Apps Script / Google Drive, confirm script ID `1uioTAsovjb67_5FK2VukQ-ymLQ86TsiMEROxQto0pudiw76ReMH_1pzE` is bound to `VNS_Repair_Master`.
2. Confirm the bound spreadsheet ID is:

```text
1A_yPDhfXuRVuJy8kWL0uPBhIcJkg4mgLlv-cF-4tFq0
```

3. Inspect the actual `Repair_Requests` header row in Google Sheets and compare it to both:
   - the 34 columns in pulled `Code.js`
   - the larger payload from `buildRepairPayload()`
4. Decide whether to preserve the pulled live behavior exactly or upgrade it to persist the full frontend payload.
5. Before any push, add a test-safe Apps Script version that supports both:
   - array body batch saves
   - `action: "updateStatus"` with `Request_ID`
   - optional legacy `repairRecordId`
6. Remove or replace `no-cors` only after confirming CORS-safe Apps Script behavior, otherwise writes may break in browser.
7. Only push/deploy after a save test and status update test confirm rows actually changed in `VNS_Repair_Master`.
