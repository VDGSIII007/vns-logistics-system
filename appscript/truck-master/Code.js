// ============================================================
// VNS TRUCK MASTER — Google Apps Script
// Sheet: VNS_TRUCK_MASTER  (new sheet — create manually first)
// Handles: Truck_Master, Driver_Master, Helper_Master
//
// Setup:
//   1. Create Google Sheet named "VNS_TRUCK_MASTER"
//   2. Extensions > Apps Script — copy the Script ID
//   3. Paste Script ID into .clasp.json
//   4. Set SPREADSHEET_ID below
//   5. clasp push && Deploy as Web App (Execute as: Me, Anyone)
//   6. Paste deployed URL into master-data.js MASTER_APP_SCRIPT_URL
// ============================================================

const SPREADSHEET_ID = "14JVeGkI3EIaZEHix56ICnFjOE56mrB9LK5sulgPTc7Q";
const SYNC_KEY       = "vns-truck-sync-2026-Jay";

const TRUCK_HEADERS = [
  "Truck_ID","Plate_Number","IMEI","Truck_Type","Truck_Make","Body_Type",
  "Trailer_Plate","Group_Category","Current_Driver_ID","Current_Helper_ID",
  "Current_Driver_Name","Current_Helper_Name","Dispatcher","Status",
  "GPS_Source","Last_Known_Latitude","Last_Known_Longitude","Last_GPS_Timestamp",
  "Odometer","ORCR_Status","Insurance_Expiry","Registration_Expiry",
  "Remarks","Created_At","Updated_At"
];

const DRIVER_HEADERS = [
  "Driver_ID","Driver_Name","GCash_Number","Contact_Number","License_Number",
  "License_Expiry","Address","Assigned_Plate","Status","Remarks","Created_At","Updated_At"
];

const HELPER_HEADERS = [
  "Helper_ID","Helper_Name","GCash_Number","Contact_Number",
  "Address","Assigned_Plate","Status","Remarks","Created_At","Updated_At"
];

// ============================================================
// doGet — read-only
// ============================================================
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonResponse_({ ok: true, status: "VNS Truck Master API running", ts: new Date().toISOString() });
    }
    if (!validateKey_(e.parameter && e.parameter.syncKey)) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }
    ensureAllTabs_();
    if (action === "getAllMasterData") {
      return jsonResponse_({
        ok:      true,
        trucks:  readRecords_("Truck_Master",  TRUCK_HEADERS),
        drivers: readRecords_("Driver_Master", DRIVER_HEADERS),
        helpers: readRecords_("Helper_Master", HELPER_HEADERS)
      });
    }
    if (action === "getTruckMaster")  return jsonResponse_({ ok: true, trucks:  readRecords_("Truck_Master",  TRUCK_HEADERS) });
    if (action === "getDriverMaster") return jsonResponse_({ ok: true, drivers: readRecords_("Driver_Master", DRIVER_HEADERS) });
    if (action === "getHelperMaster") return jsonResponse_({ ok: true, helpers: readRecords_("Helper_Master", HELPER_HEADERS) });
    if (action === "ensureTabs")      return jsonResponse_(ensureAllTabs_());
    return jsonResponse_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

// ============================================================
// doPost — write
// ============================================================
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonResponse_({ ok: false, error: "Invalid JSON: " + err.message }); }

  if (!validateKey_(body.syncKey)) {
    return jsonResponse_({ ok: false, error: "Unauthorized." });
  }

  try {
    ensureAllTabs_();
    switch (body.action) {
      case "saveTruckMaster":
        return jsonResponse_({ ok: true, result: upsertRecord_("Truck_Master", TRUCK_HEADERS, "Truck_ID", body.record || {}) });
      case "batchSaveTruckMaster":
        return jsonResponse_(batchUpsertRecords_("Truck_Master", TRUCK_HEADERS, "Truck_ID", body.records || []));
      case "saveDriverMaster":
        return jsonResponse_({ ok: true, result: upsertRecord_("Driver_Master", DRIVER_HEADERS, "Driver_ID", body.record || {}) });
      case "batchSaveDriverMaster":
        return jsonResponse_(batchUpsertRecords_("Driver_Master", DRIVER_HEADERS, "Driver_ID", body.records || []));
      case "saveHelperMaster":
        return jsonResponse_({ ok: true, result: upsertRecord_("Helper_Master", HELPER_HEADERS, "Helper_ID", body.record || {}) });
      case "batchSaveHelperMaster":
        return jsonResponse_(batchUpsertRecords_("Helper_Master", HELPER_HEADERS, "Helper_ID", body.records || []));
      case "ensureTabs":
        return jsonResponse_(ensureAllTabs_());
      default:
        return jsonResponse_({ ok: false, error: "Unknown action: " + body.action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

// ============================================================
// Tab / column init
// ============================================================
function ensureAllTabs_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var r1 = ensureSheet_(ss, "Truck_Master",  TRUCK_HEADERS);
  var r2 = ensureSheet_(ss, "Driver_Master", DRIVER_HEADERS);
  var r3 = ensureSheet_(ss, "Helper_Master", HELPER_HEADERS);
  return { ok: true, Truck_Master: r1, Driver_Master: r2, Helper_Master: r3 };
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  var isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(name);
  var lastCol = sheet.getLastColumn();
  if (!lastCol) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return { created: true, addedColumns: headers };
  }
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return String(v || "").trim(); });
  var missing  = headers.filter(function(h) { return existing.indexOf(h) === -1; });
  if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  return { created: isNew, addedColumns: missing };
}

// ============================================================
// Data helpers
// ============================================================
function readRecords_(sheetName, headers) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var actual  = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  return sheet.getRange(2, 1, lastRow - 1, actual.length)
    .getValues()
    .filter(function(row) { return row.some(function(v) { return v !== ""; }); })
    .map(function(row) {
      var obj = {};
      actual.forEach(function(h, i) { if (h) obj[h] = cellStr_(row[i]); });
      return obj;
    });
}

function upsertRecord_(sheetName, headers, keyField, record) {
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet  = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual   = getHeaders_(sheet);
  var keyIdx   = actual.indexOf(keyField);
  var keyValue = String(record[keyField] || "").trim();
  if (!keyValue) return { skipped: true, reason: "Empty key" };
  var now = new Date().toISOString();
  record.Updated_At = now;
  var rowIdx = -1;
  if (sheet.getLastRow() >= 2 && keyIdx !== -1) {
    var keys = sheet.getRange(2, keyIdx + 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || "").trim() === keyValue) { rowIdx = i + 2; break; }
    }
  }
  var rowValues = actual.map(function(h) { return record[h] !== undefined ? String(record[h] || "") : ""; });
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, actual.length).setValues([rowValues]);
    return { updated: true, key: keyValue };
  }
  record.Created_At = record.Created_At || now;
  sheet.appendRow(actual.map(function(h) { return record[h] !== undefined ? String(record[h] || "") : ""; }));
  return { created: true, key: keyValue };
}

function batchUpsertRecords_(sheetName, headers, keyField, records) {
  if (!records || !records.length) return { ok: true, imported: 0, updated: 0, skipped: 0 };
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet   = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual  = getHeaders_(sheet);
  var keyIdx  = actual.indexOf(keyField);
  var now     = new Date().toISOString();
  var lastRow = sheet.getLastRow();
  var existMap = {}, allRows = [];
  if (lastRow >= 2 && keyIdx !== -1) {
    allRows = sheet.getRange(2, 1, lastRow - 1, actual.length).getValues();
    allRows.forEach(function(row, i) {
      var k = String(row[keyIdx] || "").trim();
      if (k) existMap[k] = i;
    });
  }
  var imported = 0, updated = 0, skipped = 0;
  var toUpdate = [], toAppend = [];
  records.forEach(function(record) {
    var k = String(record[keyField] || "").trim();
    if (!k) { skipped++; return; }
    record.Updated_At = now;
    var rowValues = actual.map(function(h) { return record[h] !== undefined ? String(record[h] || "") : ""; });
    if (existMap.hasOwnProperty(k)) {
      toUpdate.push({ row: existMap[k] + 2, values: rowValues }); updated++;
    } else {
      record.Created_At = record.Created_At || now;
      toAppend.push(actual.map(function(h) { return record[h] !== undefined ? String(record[h] || "") : ""; }));
      imported++;
    }
  });
  toUpdate.forEach(function(u) { sheet.getRange(u.row, 1, 1, actual.length).setValues([u.values]); });
  toAppend.forEach(function(row) { sheet.appendRow(row); });
  return { ok: true, imported: imported, updated: updated, skipped: skipped, total: Object.keys(existMap).length + imported };
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (!lastCol) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return String(v || "").trim(); });
}

function cellStr_(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function validateKey_(key) { return key === SYNC_KEY; }

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
