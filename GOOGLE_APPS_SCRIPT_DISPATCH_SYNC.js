// ════════════════════════════════════════════════════════════
//  VNS CENTRAL DISPATCH + MASTER DATA SYNC
//  Deploy as: Apps Script Web App
//    Execute as: Me
//    Who has access: Anyone
//  Paste the deployed URL into:
//    dispatch.js  → DISPATCH_APP_SCRIPT_URL  (existing)
//    master-data.js → MASTER_APP_SCRIPT_URL  (new)
// ════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0";

// ─── Sync Keys ────────────────────────────────────────────
const VNS_SYNC_KEY    = "vns-dispatch-sync-2026-Jay";   // dispatch
const MASTER_SYNC_KEY = "vns-master-sync-2026-Jay";     // master data

// ─── Master Data Column Definitions ──────────────────────
const TRUCK_MASTER_HEADERS = [
  "Truck_ID", "Plate_Number", "IMEI", "Truck_Type", "Truck_Make", "Body_Type",
  "Trailer_Plate", "Group_Category", "Current_Driver_ID", "Current_Helper_ID",
  "Current_Driver_Name", "Current_Helper_Name", "Dispatcher", "Status", "Remarks",
  "Created_At", "Updated_At"
];
const DRIVER_MASTER_HEADERS = [
  "Driver_ID", "Driver_Name", "GCash_Number", "Contact_Number", "License_Number",
  "Address", "Status", "Remarks", "Created_At", "Updated_At"
];
const HELPER_MASTER_HEADERS = [
  "Helper_ID", "Helper_Name", "GCash_Number", "Contact_Number",
  "Address", "Status", "Remarks", "Created_At", "Updated_At"
];

// ─── Dispatch Constants ───────────────────────────────────
const COMMODITY_TABS = {
  "Bottle": "Bottle", "Sugar": "Sugar",
  "Preform / Resin": "PreformResin", "Preform": "PreformResin", "Resin": "PreformResin", "PreformResin": "PreformResin",
  "Caps / Crown": "CapsCrown", "Caps": "CapsCrown", "Crown": "CapsCrown", "Crowns": "CapsCrown", "CapsCrown": "CapsCrown"
};
const REPORT_TABS = {
  "Bottle": "Bottle_Report", "Sugar": "Sugar_Report",
  "Preform / Resin": "PreformResin_Report", "Preform": "PreformResin_Report", "Resin": "PreformResin_Report", "PreformResin": "PreformResin_Report",
  "Caps / Crown": "CapsCrown_Report", "Caps": "CapsCrown_Report", "Crown": "CapsCrown_Report", "Crowns": "CapsCrown_Report", "CapsCrown": "CapsCrown_Report"
};
const MAIN_COMMODITIES = ["Bottle", "Sugar", "Preform / Resin", "Caps / Crown"];
const LOOKUP_TABS = ["Suppliers", "IMEI_Map", "Warehouse_Plants", "Commodity", "Material_Description", "Status_List", "Geofences Area", "Settings"];
const SOURCE_SHEETS = [
  { name: "VNS BOTTLE DISPATCH",      id: "1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4", tabs: ["Bottle","Bottle_Report","Suppliers","IMEI_Map","Warehouse_Plants","Commodity","Material_Description","Status_List","Geofences Area"] },
  { name: "VNS SUGAR DISPATCH",       id: "1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE", tabs: ["Sugar","Sugar_Report","Suppliers","IMEI_Map","Warehouse_Plants","Status_List","Geofences Area"] },
  { name: "VNS PREFORMRESIN DISPATCH",id: "1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw", tabs: ["PreformResin","PreformResin_Report","Suppliers","IMEI_Map","Warehouse_Plants","Commodity","Material_Description","Status_List","Geofences Area"] },
  { name: "VNS CAPSCROWN DISPATCH",   id: "1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw", tabs: ["CapsCrown","CapsCrown_Report","Suppliers","IMEI_Map","Warehouse_Plants","Commodity","Material_Description","Status_List","Geofences Area"] }
];
const FIELD_ALIASES = {
  Record_ID: ["Record_ID","Record ID","recordId","Trip_ID","Trip ID","ID"],
  Commodity: ["Commodity","Group","Group / Category","Category"],
  Group: ["Group","Group / Category","Category","Commodity"],
  Plate: ["Plate","Plate Number","Plate_Number","Truck","Truck Plate"],
  Driver: ["Driver","Driver Name","Driver_Name"],
  Helper: ["Helper","Helper Name","Helper_Name"],
  Source: ["Source","Origin","From"],
  Destination: ["Destination","To"],
  Location: ["Location","Current Location","Friendly Location","Geofence"],
  Status: ["Status","Trip Status"],
  Booking_Date: ["Booking_Date","Booking Date","Date Assigned","Date_Assigned"],
  Plan_Pickup: ["Plan_Pickup","Plan Pickup","Planned Pickup"],
  Actual_Pickup: ["Actual_Pickup","Actual Pickup"],
  LSP: ["LSP","Logistics Service Provider"],
  Supplier: ["Supplier","Supplier Name"],
  Shipment_Number: ["Shipment_Number","Shipment Number","Shipment #","Shipment No"],
  Container_Number: ["Container_Number","Container Number","Container #","Ref #","Ref Number"],
  Pallet_Size: ["Pallet_Size","Pallet Size","Packaging","Type of Pallet"],
  Loaded: ["Loaded","Qty","Quantity","Pallet Qty"],
  Remarks: ["Remarks","Notes"],
  Created_At: ["Created_At","Created At","Created"],
  Updated_At: ["Updated_At","Updated At","Last Updated"],
  Delivered_At: ["Delivered_At","Delivered At","Delivered"],
  Logged_At: ["Logged_At","Logged At","Logged"]
};

// ════════════════════════════════════════════════════════════
//  ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e.parameter.action || "health";

    if (action === "health") {
      return jsonResponse({ ok: true, message: "VNS sync backend healthy.", ts: new Date().toISOString() });
    }

    // ─── Master data GET actions ───────────────────────
    const masterGetActions = ["getAllMasterData","getTruckMaster","getDriverMaster","getHelperMaster","ensureMasterTabs"];
    if (masterGetActions.indexOf(action) !== -1) {
      assertMasterKey_(e.parameter.syncKey);
      return handleMasterGet_(action);
    }

    // ─── Dispatch GET actions ──────────────────────────
    assertSyncKey_(e.parameter.syncKey);
    if (action === "getTrips")     return jsonResponse({ ok: true, data: getTrips(e.parameter.commodity) });
    if (action === "getAllTrips")  return jsonResponse({ ok: true, data: MAIN_COMMODITIES.reduce((a, c) => a.concat(getTrips(c)), []) });
    if (action === "auditSourceTabs") return jsonResponse({ ok: true, data: auditSourceTabs() });
    return jsonResponse({ ok: false, error: "Unknown GET action: " + action });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);

    // ─── Master data POST actions ──────────────────────
    const masterPostActions = [
      "saveTruckMaster","batchSaveTruckMaster",
      "saveDriverMaster","batchSaveDriverMaster",
      "saveHelperMaster","batchSaveHelperMaster"
    ];
    if (masterPostActions.indexOf(body.action) !== -1) {
      assertMasterKey_(body.syncKey);
      return handleMasterPost_(body);
    }

    // ─── Dispatch POST actions ─────────────────────────
    assertSyncKey_(body.syncKey);
    if (body.action === "upsertTrip") {
      return jsonResponse({ ok: true, data: upsertTrip(body.record, body.commodity) });
    }
    if (body.action === "upsertManyTrips") {
      const data = (body.records || []).map(r => upsertTrip(r, r.Commodity || r.Group || body.commodity));
      return jsonResponse({ ok: true, message: data.length + " trip(s) saved.", data });
    }
    if (body.action === "markDelivered") {
      const r = body.record || {};
      const now = new Date().toISOString();
      r.Status = "Delivered"; r.Delivered_At = r.Delivered_At || now; r.Logged_At = r.Logged_At || now;
      const data = upsertTrip(r, body.commodity || r.Commodity || r.Group);
      appendReport(r, body.commodity || r.Commodity || r.Group);
      return jsonResponse({ ok: true, data });
    }
    if (body.action === "addToLogs") {
      const r = body.record || {};
      r.Logged_At = r.Logged_At || new Date().toISOString();
      const data = upsertTrip(r, body.commodity || r.Commodity || r.Group);
      appendReport(r, body.commodity || r.Commodity || r.Group);
      return jsonResponse({ ok: true, data });
    }
    if (body.action === "auditSourceTabs") {
      return jsonResponse({ ok: true, data: auditSourceTabs() });
    }
    return jsonResponse({ ok: false, error: "Unknown POST action: " + body.action });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ════════════════════════════════════════════════════════════
//  MASTER DATA HANDLERS
// ════════════════════════════════════════════════════════════

function handleMasterGet_(action) {
  ensureMasterTabs_();
  if (action === "getAllMasterData") {
    return jsonResponse({
      ok:      true,
      trucks:  readMasterRecords_("Truck_Master",  TRUCK_MASTER_HEADERS),
      drivers: readMasterRecords_("Driver_Master", DRIVER_MASTER_HEADERS),
      helpers: readMasterRecords_("Helper_Master", HELPER_MASTER_HEADERS)
    });
  }
  if (action === "getTruckMaster")  return jsonResponse({ ok: true, trucks:  readMasterRecords_("Truck_Master",  TRUCK_MASTER_HEADERS) });
  if (action === "getDriverMaster") return jsonResponse({ ok: true, drivers: readMasterRecords_("Driver_Master", DRIVER_MASTER_HEADERS) });
  if (action === "getHelperMaster") return jsonResponse({ ok: true, helpers: readMasterRecords_("Helper_Master", HELPER_MASTER_HEADERS) });
  if (action === "ensureMasterTabs") return jsonResponse({ ok: true, message: "Master tabs ensured." });
  return jsonResponse({ ok: false, error: "Unknown master GET action." });
}

function handleMasterPost_(body) {
  ensureMasterTabs_();
  switch (body.action) {
    case "saveTruckMaster":
      return jsonResponse(upsertTruckRecord_(body.record || {}));
    case "batchSaveTruckMaster":
      return jsonResponse(batchUpsertMasterRecords_("Truck_Master", TRUCK_MASTER_HEADERS, "Plate_Number", (body.records || []).map(prepareTruckRecord_)));
    case "saveDriverMaster":
      return jsonResponse({ ok: true, ...upsertMasterRecord_("Driver_Master", DRIVER_MASTER_HEADERS, "Driver_ID", body.record || {}) });
    case "batchSaveDriverMaster":
      return jsonResponse(batchUpsertMasterRecords_("Driver_Master", DRIVER_MASTER_HEADERS, "Driver_ID", body.records || []));
    case "saveHelperMaster":
      return jsonResponse({ ok: true, ...upsertMasterRecord_("Helper_Master", HELPER_MASTER_HEADERS, "Helper_ID", body.record || {}) });
    case "batchSaveHelperMaster":
      return jsonResponse(batchUpsertMasterRecords_("Helper_Master", HELPER_MASTER_HEADERS, "Helper_ID", body.records || []));
    default:
      return jsonResponse({ ok: false, error: "Unknown master POST action." });
  }
}

// ─── Master helper functions ──────────────────────────────

function ensureMasterTabs_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureMasterSheet_(ss, "Truck_Master",  TRUCK_MASTER_HEADERS);
  ensureMasterSheet_(ss, "Driver_Master", DRIVER_MASTER_HEADERS);
  ensureMasterSheet_(ss, "Helper_Master", HELPER_MASTER_HEADERS);
}

function ensureMasterSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const lastCol = sheet.getLastColumn();
  if (!lastCol) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return String(v || "").trim(); });
  const missing  = headers.filter(function(h) { return existing.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function readMasterRecords_(sheetName, headers) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureMasterSheet_(ss, sheetName, headers);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || !lastCol) return [];
  const actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return String(v || "").trim(); });
  return sheet.getRange(2, 1, lastRow - 1, lastCol)
    .getValues()
    .filter(function(row) { return row.some(function(v) { return v !== ""; }); })
    .map(function(row) {
      var obj = {};
      actualHeaders.forEach(function(h, i) { if (h) obj[h] = cellToString_(row[i]); });
      return obj;
    });
}

function upsertTruckRecord_(record) {
  const prepared = prepareTruckRecord_(record);
  if (!prepared.Plate_Number) return { ok: false, skipped: true, reason: "Empty plate" };
  const result = upsertMasterRecord_("Truck_Master", TRUCK_MASTER_HEADERS, "Plate_Number", prepared);
  return { ok: true, ...result };
}

function prepareTruckRecord_(record) {
  const now = new Date().toISOString();
  return Object.assign({}, record, {
    Plate_Number:   normalizePlate_(record.Plate_Number),
    Trailer_Plate:  normalizePlate_(record.Trailer_Plate || ""),
    Group_Category: normalizeGroup_(record.Group_Category || ""),
    Truck_ID:       record.Truck_ID || makeTruckId_(),
    Status:         record.Status || "Active",
    Created_At:     record.Created_At || now
  });
}

function upsertMasterRecord_(sheetName, headers, keyField, record) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureMasterSheet_(ss, sheetName, headers);
  const actualHeaders = getHeaders(sheet);
  const keyColIdx = actualHeaders.indexOf(keyField);
  if (keyColIdx === -1) throw new Error("Key field not found in " + sheetName + ": " + keyField);

  const keyValue = String(record[keyField] || "").trim();
  if (!keyValue) return { skipped: true, reason: "Empty key" };

  const now = new Date().toISOString();
  const lastRow = sheet.getLastRow();
  var existingRowIdx = -1;

  if (lastRow >= 2) {
    const keys = sheet.getRange(2, keyColIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || "").trim() === keyValue) { existingRowIdx = i + 2; break; }
    }
  }

  if (existingRowIdx > 0) {
    const existingRow = sheet.getRange(existingRowIdx, 1, 1, actualHeaders.length).getValues()[0];
    const existingObj = {};
    actualHeaders.forEach(function(h, i) { existingObj[h] = cellToString_(existingRow[i]); });
    const merged = mergeNonBlank_(existingObj, record);
    merged.Updated_At = now;
    sheet.getRange(existingRowIdx, 1, 1, actualHeaders.length)
      .setValues([actualHeaders.map(function(h) { return merged[h] !== undefined ? String(merged[h]) : ""; })]);
    return { updated: true, key: keyValue };
  }

  record.Created_At = record.Created_At || now;
  record.Updated_At = now;
  sheet.appendRow(actualHeaders.map(function(h) { return record[h] !== undefined ? String(record[h]) : ""; }));
  return { created: true, key: keyValue };
}

function batchUpsertMasterRecords_(sheetName, headers, keyField, records) {
  if (!records || !records.length) return { ok: true, imported: 0, updated: 0, skipped: 0, total: 0 };

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureMasterSheet_(ss, sheetName, headers);
  const actualHeaders = getHeaders(sheet);
  const keyColIdx = actualHeaders.indexOf(keyField);
  if (keyColIdx === -1) throw new Error("Key field not found: " + keyField);

  const now     = new Date().toISOString();
  const lastRow = sheet.getLastRow();

  // Read all existing data once
  const existingMap = {};
  var existingAllRows = [];
  if (lastRow >= 2) {
    existingAllRows = sheet.getRange(2, 1, lastRow - 1, actualHeaders.length).getValues();
    existingAllRows.forEach(function(row, i) {
      const k = String(row[keyColIdx] || "").trim();
      if (k) existingMap[k] = i;
    });
  }

  var imported = 0, updated = 0, skipped = 0;
  const rowsToUpdate = [];
  const newRows = [];

  records.forEach(function(record) {
    const keyValue = String(record[keyField] || "").trim();
    if (!keyValue) { skipped++; return; }

    if (existingMap.hasOwnProperty(keyValue)) {
      const eIdx = existingMap[keyValue];
      const existingObj = {};
      actualHeaders.forEach(function(h, i) { existingObj[h] = cellToString_(existingAllRows[eIdx][i]); });
      const merged = mergeNonBlank_(existingObj, record);
      merged.Updated_At = now;
      rowsToUpdate.push({
        sheetRow: eIdx + 2,
        values:   actualHeaders.map(function(h) { return merged[h] !== undefined ? String(merged[h]) : ""; })
      });
      updated++;
    } else {
      record.Created_At = record.Created_At || now;
      record.Updated_At = now;
      newRows.push(actualHeaders.map(function(h) { return record[h] !== undefined ? String(record[h]) : ""; }));
      imported++;
    }
  });

  rowsToUpdate.forEach(function(u) {
    sheet.getRange(u.sheetRow, 1, 1, actualHeaders.length).setValues([u.values]);
  });
  newRows.forEach(function(row) { sheet.appendRow(row); });

  const total = Object.keys(existingMap).length + imported;
  return { ok: true, imported: imported, updated: updated, skipped: skipped, total: total };
}

function mergeNonBlank_(existing, incoming) {
  const result = {};
  const allKeys = {};
  Object.keys(existing).forEach(function(k) { allKeys[k] = true; });
  Object.keys(incoming).forEach(function(k) { allKeys[k] = true; });
  Object.keys(allKeys).forEach(function(k) {
    const incomingVal = String(incoming[k] || "").trim();
    result[k] = incomingVal !== "" ? incoming[k] : existing[k];
  });
  return result;
}

function normalizePlate_(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeGroup_(v) {
  const n = String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return "";
  if (n === "bottle" || n === "bottles") return "Bottle";
  if (n === "sugar") return "Sugar";
  if (n === "preform" || n === "resin" || n === "preform / resin") return "Preform / Resin";
  if (n === "caps" || n === "crown" || n === "crowns" || n === "caps / crown" || n === "caps / crowns") return "Caps / Crown";
  return String(v || "").trim();
}

function makeTruckId_() {
  const d = new Date();
  const stamp = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("");
  const rand  = Math.random().toString(36).slice(2,6).toUpperCase().padEnd(4,"0");
  return "TRK-" + stamp + "-" + rand;
}

function cellToString_(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// ════════════════════════════════════════════════════════════
//  DISPATCH FUNCTIONS (unchanged)
// ════════════════════════════════════════════════════════════

function auditSourceTabs() {
  const results = [];
  SOURCE_SHEETS.forEach(function(source) {
    const ss = SpreadsheetApp.openById(source.id);
    source.tabs.forEach(function(tabName) {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) { results.push([new Date(), source.name, source.id, tabName, "MISSING", 0, "", ""]); return; }
      const lastColumn = sheet.getLastColumn();
      const lastRow    = sheet.getLastRow();
      const hdrs = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
      const sampleCount = Math.min(Math.max(lastRow - 1, 0), 3);
      const sampleRows  = sampleCount ? sheet.getRange(2, 1, sampleCount, lastColumn).getValues() : [];
      results.push([new Date(), ss.getName() || source.name, source.id, tabName, "OK", lastColumn, JSON.stringify(hdrs), JSON.stringify(sampleRows)]);
    });
  });
  const central    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const auditSheet = central.getSheetByName("Source_Audit") || central.insertSheet("Source_Audit");
  auditSheet.clearContents();
  auditSheet.getRange(1, 1, 1, 8).setValues([["Audited_At","Spreadsheet_Name","Spreadsheet_ID","Tab_Name","Status","Column_Count","Headers_Row_1_JSON","First_3_Sample_Rows_JSON"]]);
  if (results.length) auditSheet.getRange(2, 1, results.length, 8).setValues(results);
  ensureCentralTabs();
  return results.map(function(row) {
    return { auditedAt: row[0], spreadsheetName: row[1], spreadsheetId: row[2], tabName: row[3], status: row[4], columnCount: row[5], headers: JSON.parse(row[6] || "[]"), sampleRows: JSON.parse(row[7] || "[]") };
  });
}

function upsertTrip(record, commodity) {
  if (!record) throw new Error("Missing record.");
  const sheet = getCommoditySheet(commodity || record.Commodity || record.Group);
  const clean = normalizeRecord(record, commodity || record.Commodity || record.Group);
  const hdrs  = getHeaders(sheet);
  if (!hdrs.length) throw new Error("Missing headers in " + sheet.getName() + ".");
  if (!clean.Record_ID) throw new Error("Record_ID is required.");
  const rowIndex = findRecordRow(sheet, hdrs, clean.Record_ID);
  const rowValues = buildRowValues(hdrs, clean);
  if (rowIndex > 0) { sheet.getRange(rowIndex, 1, 1, hdrs.length).setValues([rowValues]); return { Record_ID: clean.Record_ID, updated: true, sheet: sheet.getName() }; }
  sheet.appendRow(rowValues);
  return { Record_ID: clean.Record_ID, created: true, sheet: sheet.getName() };
}

function getTrips(commodity) {
  const sheet = getCommoditySheet(commodity);
  const hdrs  = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (!hdrs.length || lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, hdrs.length).getValues()
    .filter(function(row) { return row.some(function(v) { return v !== ""; }); })
    .map(function(row) { return rowToRecord(hdrs, row); });
}

function appendReport(record, commodity) {
  const sheet = getReportSheet(commodity || record.Commodity || record.Group);
  const hdrs  = getHeaders(sheet);
  if (!hdrs.length) throw new Error("Missing headers in " + sheet.getName() + ".");
  const clean = normalizeRecord(record, commodity || record.Commodity || record.Group);
  const rowIndex = findRecordRow(sheet, hdrs, clean.Record_ID);
  const rowValues = buildRowValues(hdrs, clean);
  if (rowIndex > 0) { sheet.getRange(rowIndex, 1, 1, hdrs.length).setValues([rowValues]); } else { sheet.appendRow(rowValues); }
}

function ensureCentralTabs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  MAIN_COMMODITIES.forEach(function(c) { ensureSheet(ss, COMMODITY_TABS[c]); ensureSheet(ss, REPORT_TABS[c]); });
  LOOKUP_TABS.forEach(function(n) { ensureSheet(ss, n); });
}

function getCommoditySheet(commodity) { return ensureSheet(SpreadsheetApp.openById(SPREADSHEET_ID), getCommodityTabName(commodity)); }
function getReportSheet(commodity)   { return ensureSheet(SpreadsheetApp.openById(SPREADSHEET_ID), getReportTabName(commodity)); }
function ensureSheet(ss, sheetName)  { return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName); }

function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(v) { return String(v || "").trim(); });
}

function buildRowValues(headers, record) {
  return headers.map(function(header) {
    const key = canonicalFieldForHeader(header);
    if (key && Object.prototype.hasOwnProperty.call(record, key)) return record[key] || "";
    return record[header] || "";
  });
}

function rowToRecord(headers, row) {
  const record = {};
  headers.forEach(function(header, index) {
    const key = canonicalFieldForHeader(header) || header;
    record[key] = row[index]; record[header] = row[index];
  });
  return record;
}

function canonicalFieldForHeader(header) {
  const norm = normalizeHeader(header);
  return Object.keys(FIELD_ALIASES).find(function(field) {
    return FIELD_ALIASES[field].some(function(alias) { return normalizeHeader(alias) === norm; });
  });
}

function findRecordRow(sheet, headers, recordId) {
  const col = headers.findIndex(function(h) { return canonicalFieldForHeader(h) === "Record_ID"; }) + 1;
  if (!col) throw new Error("Record_ID column not found in " + sheet.getName() + ".");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  const idx = ids.findIndex(function(row) { return row[0] === recordId; });
  return idx === -1 ? -1 : idx + 2;
}

function normalizeRecord(record, commodity) {
  const now = new Date().toISOString();
  const normalizedCommodity = normalizeCommodity(commodity || record.Commodity || record.Group);
  return Object.assign({}, record, {
    Record_ID:    record.Record_ID || record.recordId || record.ID || "",
    Commodity:    normalizedCommodity,
    Group:        record.Group || normalizedCommodity,
    Created_At:   record.Created_At || now,
    Updated_At:   now,
    Delivered_At: record.Status === "Delivered" ? (record.Delivered_At || now) : (record.Delivered_At || ""),
    Logged_At:    record.Logged_At || ""
  });
}

function getCommodityTabName(commodity) {
  const sheetName = COMMODITY_TABS[normalizeCommodity(commodity)];
  if (!sheetName) throw new Error("Unsupported commodity: " + commodity);
  return sheetName;
}

function getReportTabName(commodity) {
  const sheetName = REPORT_TABS[normalizeCommodity(commodity)];
  if (!sheetName) throw new Error("Unsupported commodity report: " + commodity);
  return sheetName;
}

function normalizeCommodity(value) {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === "bottle" || lower === "bottles") return "Bottle";
  if (lower === "sugar") return "Sugar";
  if (lower === "preform" || lower === "resin" || lower === "preform / resin" || lower === "preformresin") return "Preform / Resin";
  if (lower === "caps" || lower === "crown" || lower === "crowns" || lower === "caps / crown" || lower === "capscrown") return "Caps / Crown";
  return String(value || "").trim();
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Shared auth / parse helpers ─────────────────────────
function assertSyncKey_(syncKey) {
  if (!syncKey || syncKey !== VNS_SYNC_KEY) throw new Error("Invalid dispatch sync key.");
}
function assertMasterKey_(syncKey) {
  if (!syncKey || syncKey !== MASTER_SYNC_KEY) throw new Error("Unauthorized.");
}
function parseBody_(e) {
  return JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
}
function jsonResponse(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
