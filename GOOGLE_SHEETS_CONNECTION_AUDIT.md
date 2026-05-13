# VNS Logistics — Google Sheets Connection Audit
**Last updated:** 2026-05-13

---

## Architecture: Per-Module Sheet Design

Each module owns its own Google Sheet and Apps Script deployment.
VNS Central Dispatch API is for **Dispatch only** — no master data, no repairs, no cash.

| Module | Google Sheet Name | Apps Script Folder | SYNC_KEY | Spreadsheet ID |
|---|---|---|---|---|
| Dispatch | VNS Central Dispatch API | `appscript/central-dispatch-api/` | *(read-only, no key)* | `1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0` |
| Truck / Driver / Helper Master | VNS_TRUCK_MASTER | `appscript/truck-master/` | `vns-truck-sync-2026-Jay` | *(create manually — ID unknown)* |
| Repair | VNS_Repair_Master | `appscript/repair-master/` | `vns-repair-sync-2026-Jay` | *(existing sheet — ID unknown, fill in Code.js)* |
| Cash / PO / Bali | VNS_Cash_PO_Bali_Log | `appscript/cash-po-bali/` | `vns-cash-sync-2026-Jay` | *(create manually — ID unknown)* |
| Parts Inventory | VNS_Parts_Inventory_Master | `appscript/parts-inventory/` | `vns-parts-sync-2026-Jay` | `1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM` |
| Tire Monitoring | VNS_TIRE_MONITORING | `appscript/tire-monitoring/` | `vns-tire-sync-2026-Jay` | *(create manually — ID unknown)* |
| Payroll | *(deferred — no sheet yet)* | *(not created)* | — | — |

---

## Module Status Detail

### 1. Dispatch — `appscript/central-dispatch-api/`
**Status: DEPLOYED (read-only aggregator)**

- Script ID: `1_ovzg00SLiZ-9lSPXdrpUyCGXfjAcjF5Xl18y8vqBcGUiCBy9WyL_Yb_`
- Aggregates trip data from 4 commodity source spreadsheets (Sugar, Bottle, Preform/Resin, Caps/Crown)
- No write operations — Dispatch is a read-only dashboard
- Source spreadsheets are external and managed separately
- Reads geofences from `Geofences Area` tab in the central sheet

**Actions supported:** `health`, `getDispatchDashboard`, `getDispatchTrucks`, `getDispatchTrips`, `getDispatchLogs`

**Frontend files:** `dispatch.html`, script wired to `DISPATCH_APP_SCRIPT_URL` in dispatch.js

---

### 2. Truck / Driver / Helper Master — `appscript/truck-master/`
**Status: CODE READY — needs manual sheet creation and deployment**

**Apps Script tabs (Code.js written):**
| Tab | Key Column | Columns |
|---|---|---|
| Truck_Master | Truck_ID | 25 cols: Truck_ID, Plate_Number, IMEI, Truck_Type, Truck_Make, Body_Type, Trailer_Plate, Group_Category, Current_Driver_ID, Current_Helper_ID, Current_Driver_Name, Current_Helper_Name, Dispatcher, Status, GPS_Source, Last_Known_Latitude, Last_Known_Longitude, Last_GPS_Timestamp, Odometer, ORCR_Status, Insurance_Expiry, Registration_Expiry, Remarks, Created_At, Updated_At |
| Driver_Master | Driver_ID | 12 cols: Driver_ID, Driver_Name, GCash_Number, Contact_Number, License_Number, License_Expiry, Address, Assigned_Plate, Status, Remarks, Created_At, Updated_At |
| Helper_Master | Helper_ID | 10 cols: Helper_ID, Helper_Name, GCash_Number, Contact_Number, Address, Assigned_Plate, Status, Remarks, Created_At, Updated_At |

**Actions supported:**
- GET: `getAllMasterData`, `getTruckMaster`, `getDriverMaster`, `getHelperMaster`, `ensureTabs`
- POST: `saveTruckMaster`, `batchSaveTruckMaster`, `saveDriverMaster`, `batchSaveDriverMaster`, `saveHelperMaster`, `batchSaveHelperMaster`, `ensureTabs`

**Frontend files:** `master-data.html`, `master-data.js`

**Frontend sync wired:** YES — `MASTER_APP_SCRIPT_URL` (currently `"PASTE_VNS_TRUCK_MASTER_WEB_APP_URL_HERE"`), `MASTER_SYNC_KEY = "vns-truck-sync-2026-Jay"`

**What triggers sync:**
- `saveTruck` / `saveTruckCell` → `syncTruckSilent`
- `importTrucks` / `importFromDispatchList` → `batchSyncTrucksSilent`
- `saveDriver` / `saveDriverCell` → `syncDriverSilent`
- `saveHelper` / `saveHelperCell` → `syncHelperSilent`
- "Refresh From Google Sheets" button → `loadFromSheets`

**Manual steps required:**
1. Create Google Sheet named `VNS_TRUCK_MASTER`
2. Extensions > Apps Script → copy Script ID → paste into `appscript/truck-master/.clasp.json`
3. Paste Spreadsheet ID into `appscript/truck-master/Code.js` (line 14)
4. `clasp push` → Deploy as Web App (Execute as: Me, Anyone)
5. Paste deployed URL into `master-data.js` line 5 (`MASTER_APP_SCRIPT_URL`)

---

### 3. Repair — `appscript/repair-master/`
**Status: EXISTING LIVE DEPLOYMENT — local Code.js is reference only**

**Live endpoint:** `https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec`

**Apps Script tabs (Code.js written as reference):**
| Tab | Key Column | Columns |
|---|---|---|
| Repair_Requests | Request_ID | 45 cols — matches frontend `buildRepairPayload` exactly |
| Garage_Trucks | Truck_ID | 17 cols — trucks with garage status |

**Existing API contract (must preserve):**
- GET `?action=list` → returns repair records array
- GET `?action=garageTrucks` → returns truck array
- POST with `Array` body (no syncKey) → batch saves repair rows
- POST with `{ repairRecordId, Status, ... }` → status update

**Frontend uses `mode: 'no-cors'`** for writes — cannot read response, fire-and-forget.

**Action required:**
1. Find the Spreadsheet ID for `VNS_Repair_Master` — paste into `appscript/repair-master/Code.js` (line 17)
2. Run `clasp pull` into `appscript/repair-master/` to capture the actual live code
3. Compare with local `Code.js` reference — merge any differences before deploying changes

---

### 4. Cash / PO / Bali — `appscript/cash-po-bali/`
**Status: CODE READY — needs manual sheet creation and deployment**

**Apps Script tabs (Code.js written):**
| Tab | Key Column | Columns |
|---|---|---|
| Cash_PO_Bali_Log | Cash_ID | 21 cols: Cash_ID, Date, Time, Sender, Plate_Number, Group_Category, Transaction_Type, Person_Name, Role, GCash_Number, Amount, PO_Number, Liters, Fuel_Station, Route, Balance_After_Payroll, Review_Status, Encoded_By, Remarks, Created_At, Updated_At |

**Actions supported:**
- GET: `listEntries`, `ensureTabs`
- POST: `saveEntry`, `batchSaveEntries`, `ensureTabs`

**Frontend files:** `cash.html`

**Frontend sync status:** Check `cash.js` — `CASH_APP_SCRIPT_URL` may be a placeholder.

**Manual steps required:**
1. Create Google Sheet named `VNS_Cash_PO_Bali_Log`
2. Extensions > Apps Script → copy Script ID → paste into `appscript/cash-po-bali/.clasp.json`
3. Paste Spreadsheet ID into `appscript/cash-po-bali/Code.js` (line 14)
4. `clasp push` → Deploy as Web App
5. Paste deployed URL into `cash.js` `CASH_APP_SCRIPT_URL`

---

### 5. Parts Inventory — `appscript/parts-inventory/`
**Status: CODE READY — spreadsheet ID known, needs Apps Script deployment**

**Spreadsheet ID already set in Code.js:** `1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM`

**Apps Script tabs (Code.js written):**
| Tab | Key Column | Columns |
|---|---|---|
| Inventory_Items | Item_ID | 21 cols — master catalogue, one row per unique item |
| Parts_In | Parts_In_ID | 23 cols — stock-in transactions |
| Parts_Out | Parts_Out_ID | 22 cols — stock-out transactions |
| Movement_History | Movement_ID | 20 cols — all in/out ledger entries |
| Settings | Key | 5 cols |

**Actions supported:**
- GET: `getInventoryItems`, `getPartsIn`, `getPartsOut`, `getMovements`, `getAllPartsData`, `ensureTabs`
- POST: `saveInventoryItem`, `batchSaveInventoryItems`, `savePartsIn`, `batchSavePartsIn`, `savePartsOut`, `batchSavePartsOut`, `saveMovement`, `batchSaveMovements`, `ensureTabs`

**Frontend files:** `parts-inventory.html`, `parts-inventory.js`

**Frontend sync status: NOT WIRED** — `parts-inventory.js` has no fetch calls, no `PARTS_APP_SCRIPT_URL`. Frontend is localStorage-only. Sync integration needs to be added separately.

**Manual steps required:**
1. Open `VNS_Parts_Inventory_Master` (`1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM`)
2. Extensions > Apps Script → copy Script ID → paste into `appscript/parts-inventory/.clasp.json`
3. `clasp push` → Deploy as Web App
4. Add `PARTS_APP_SCRIPT_URL` and sync functions to `parts-inventory.js`

---

### 6. Tire Monitoring — `appscript/tire-monitoring/`
**Status: CODE READY — needs manual sheet creation and deployment**

**Apps Script tabs (Code.js written):**
| Tab | Key Column | Columns |
|---|---|---|
| Tire_Inventory | Tire_ID | 16 cols |
| Tire_Change_Log | Change_ID | 18 cols |
| Tire_Position_Status | Position_ID | 12 cols |
| Tire_Disposal_Log | Disposal_ID | 17 cols |
| Tire_Settings | Key | 5 cols |

**Actions supported:**
- GET: `getInventory`, `getChangeLogs`, `getPositions`, `getDisposals`, `getAllTireData`, `ensureTabs`
- POST: `saveTireInventory`, `batchSaveTireInventory`, `saveTireChangeLog`, `batchSaveTireChangeLogs`, `saveTirePosition`, `batchSaveTirePositions`, `saveTireDisposal`, `batchSaveTireDisposals`, `ensureTabs`

**Frontend files:** `tire-monitoring.html`

**Frontend sync status:** Check tire-monitoring.js for `TIRE_APP_SCRIPT_URL` — may be a placeholder.

**Manual steps required:**
1. Create Google Sheet named `VNS_TIRE_MONITORING`
2. Extensions > Apps Script → copy Script ID → paste into `appscript/tire-monitoring/.clasp.json`
3. Paste Spreadsheet ID into `appscript/tire-monitoring/Code.js` (line 14)
4. `clasp push` → Deploy as Web App
5. Paste deployed URL into tire-monitoring.js `TIRE_APP_SCRIPT_URL`

---

### 7. Payroll — *(deferred)*
**Status: NO SHEET, NO APPS SCRIPT**

- `payroll.html` is UI-only, no sync
- No Apps Script folder created
- Defer until payroll data model is finalized

---

## Summary: What Was Created This Session

| File | Status |
|---|---|
| `appscript/truck-master/Code.js` | Written — complete, ready to push |
| `appscript/truck-master/.clasp.json` | Written — fill in scriptId |
| `appscript/truck-master/appsscript.json` | Written |
| `appscript/cash-po-bali/Code.js` | Written — complete, ready to push |
| `appscript/cash-po-bali/.clasp.json` | Written — fill in scriptId |
| `appscript/cash-po-bali/appsscript.json` | Written |
| `appscript/tire-monitoring/Code.js` | Written — complete, ready to push |
| `appscript/tire-monitoring/.clasp.json` | Written — fill in scriptId |
| `appscript/tire-monitoring/appsscript.json` | Written |
| `appscript/repair-master/Code.js` | Written — reference only, clasp pull first |
| `appscript/repair-master/.clasp.json` | Written — fill in scriptId |
| `appscript/repair-master/appsscript.json` | Written |
| `appscript/parts-inventory/Code.js` | Written — complete, spreadsheet ID already set |
| `appscript/parts-inventory/.clasp.json` | Written — fill in scriptId |
| `appscript/parts-inventory/appsscript.json` | Written |
| `master-data.js` — MASTER_SYNC_KEY | Fixed: `"vns-truck-sync-2026-Jay"` |
| `master-data.js` — MASTER_APP_SCRIPT_URL | Updated placeholder to `PASTE_VNS_TRUCK_MASTER_WEB_APP_URL_HERE` |
| `master-data.html` — sync badge + refresh button | Added |
| `master-data.js` — full sync functions | Added |

---

## Deployment Checklist (recommended order)

### Phase 1 — Truck Master (new, no existing data at risk)
- [ ] Create Google Sheet `VNS_TRUCK_MASTER`
- [ ] Create Apps Script, get Script ID → `.clasp.json`
- [ ] `clasp push appscript/truck-master/`
- [ ] Deploy as Web App → copy URL → `master-data.js` line 5

### Phase 2 — Parts Inventory (spreadsheet already exists)
- [ ] Open `VNS_Parts_Inventory_Master` (`1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM`)
- [ ] Create Apps Script, get Script ID → `.clasp.json`
- [ ] `clasp push appscript/parts-inventory/`
- [ ] Deploy as Web App → add URL to `parts-inventory.js`
- [ ] Wire sync calls in `parts-inventory.js`

### Phase 3 — Cash / PO / Bali
- [ ] Create Google Sheet `VNS_Cash_PO_Bali_Log`
- [ ] Create Apps Script, get Script ID → `.clasp.json`
- [ ] `clasp push appscript/cash-po-bali/`
- [ ] Deploy as Web App → paste URL into `cash.js`

### Phase 4 — Tire Monitoring
- [ ] Create Google Sheet `VNS_TIRE_MONITORING`
- [ ] Create Apps Script, get Script ID → `.clasp.json`
- [ ] `clasp push appscript/tire-monitoring/`
- [ ] Deploy as Web App → paste URL into tire-monitoring.js

### Phase 5 — Repair (existing live deployment — caution)
- [ ] Find Spreadsheet ID for `VNS_Repair_Master` → fill into `Code.js` line 17
- [ ] `clasp pull` into `appscript/repair-master/` to capture live code
- [ ] Compare with local `Code.js` reference — verify column headers match
- [ ] Only clasp push if changes are needed and tested

---

## Known Spreadsheet IDs

| Sheet | ID |
|---|---|
| VNS Central Dispatch API | `1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0` |
| VNS_Parts_Inventory_Master | `1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM` |
| VNS_TRUCK_MASTER | *(not yet created)* |
| VNS_Cash_PO_Bali_Log | *(not yet created)* |
| VNS_TIRE_MONITORING | *(not yet created)* |
| VNS_Repair_Master | *(ID unknown — check Google Drive)* |

---

## Notes on Obsolete Files

- `GOOGLE_APPS_SCRIPT_DISPATCH_SYNC.js` (project root) — defines its own `doGet` and `VNS_SYNC_KEY`. Superseded by the per-module architecture. Safe to archive or delete after confirming the central-dispatch-api deployment is stable.
- Old "VNS Truck Monitoring Dispatch" sheet — deleted. Do not reference.
