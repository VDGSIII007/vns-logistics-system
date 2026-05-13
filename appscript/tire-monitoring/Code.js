// ============================================================
// VNS TIRE MONITORING — Google Apps Script
// Sheet: VNS_TIRE_MONITORING  (create manually first)
//
// Setup:
//   1. Create Google Sheet named "VNS_TIRE_MONITORING"
//   2. Extensions > Apps Script — copy the Script ID
//   3. Paste Script ID into .clasp.json
//   4. Set SPREADSHEET_ID below
//   5. clasp push && Deploy as Web App (Execute as: Me, Anyone)
//   6. Paste deployed URL into tire-monitoring.js TIRE_APP_SCRIPT_URL
// ============================================================

const SPREADSHEET_ID = "1lhU2ak035Peorls2hEovIm9A5G1PvxQSHd5ebGyH_po";
const SYNC_KEY       = "vns-tire-sync-2026-Jay";

const TIRE_INVENTORY_HEADERS = [
  "Tire_ID","Purchase_Date","Supplier","Invoice_No","Tire_Serial","Brand","Tire_Size",
  "Cost","Quantity","Storage_Location","Status","Linked_Plate_Number","Linked_Tire_Position",
  "Remarks","Created_At","Updated_At"
];

const TIRE_CHANGE_HEADERS = [
  "Change_ID","Change_Date","Plate_Number","IMEI","Truck_Type","Truck_Make","Tire_Position",
  "Action_Type","Old_Tire_Serial","New_Tire_Serial","Brand","Tire_Size","Reason",
  "Driver_Name","Signature_By","Odometer","Remarks","Encoded_At"
];

const TIRE_POSITION_HEADERS = [
  "Position_ID","Plate_Number","Truck_Type","Truck_Make","Tire_Position",
  "Current_Tire_Serial","Brand","Tire_Size","Status","Installed_Date",
  "Odometer_Installed","Updated_At",
  "Inspection_Date","Condition_Status","Condition_Color","Tread_Check",
  "Damage_Type","Action_Needed","Next_Check_Date","Inspector_Name",
  "Photo_Link","Replacement_Required","Repair_Required","Removed_Tire_Serial",
  "Replacement_Tire_Serial","Remarks"
];

const TIRE_DISPOSAL_HEADERS = [
  "Disposal_ID","Disposal_Date","Tire_Serial","Brand","Tire_Size",
  "Last_Plate_Number","Last_Tire_Position","Disposal_Status","Disposal_Method",
  "Disposal_Destination","Receiver_Contact","Disposal_Receipt_No","Disposal_Certificate_No",
  "Estimated_Scrap_Value","Disposed_By","Remarks","Encoded_At"
];

const TIRE_SETTINGS_HEADERS = [
  "Key","Value","Category","Description","Updated_At"
];

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonResponse_({ ok: true, status: "VNS Tire Monitoring API running", ts: new Date().toISOString() });
    }
    if (!validateKey_(e.parameter && e.parameter.syncKey)) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }
    ensureAllTabs_();
    if (action === "getInventory")    return jsonResponse_({ ok: true, inventory:  readRecords_("Tire_Inventory",      TIRE_INVENTORY_HEADERS) });
    if (action === "getChangeLogs")   return jsonResponse_({ ok: true, changeLogs: readRecords_("Tire_Change_Log",     TIRE_CHANGE_HEADERS)    });
    if (action === "getPositions")    return jsonResponse_({ ok: true, positions:  readRecords_("Tire_Position_Status", TIRE_POSITION_HEADERS)  });
    if (action === "getDisposals")    return jsonResponse_({ ok: true, disposals:  readRecords_("Tire_Disposal_Log",   TIRE_DISPOSAL_HEADERS)  });
    if (action === "getAllTireData") {
      return jsonResponse_({
        ok:         true,
        inventory:  readRecords_("Tire_Inventory",      TIRE_INVENTORY_HEADERS),
        changeLogs: readRecords_("Tire_Change_Log",     TIRE_CHANGE_HEADERS),
        positions:  readRecords_("Tire_Position_Status", TIRE_POSITION_HEADERS),
        disposals:  readRecords_("Tire_Disposal_Log",   TIRE_DISPOSAL_HEADERS)
      });
    }
    if (action === "ensureTabs") return jsonResponse_(ensureAllTabs_());
    return jsonResponse_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

// ============================================================
// doPost
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
      case "saveTireInventory":
        return jsonResponse_({ ok: true, result: upsertRecord_("Tire_Inventory", TIRE_INVENTORY_HEADERS, "Tire_ID", body.record || {}) });
      case "batchSaveTireInventory":
        return jsonResponse_(batchUpsertRecords_("Tire_Inventory", TIRE_INVENTORY_HEADERS, "Tire_ID", body.records || []));
      case "saveTireChangeLog":
        return jsonResponse_({ ok: true, result: upsertRecord_("Tire_Change_Log", TIRE_CHANGE_HEADERS, "Change_ID", body.record || {}) });
      case "batchSaveTireChangeLogs":
        return jsonResponse_(batchUpsertRecords_("Tire_Change_Log", TIRE_CHANGE_HEADERS, "Change_ID", body.records || []));
      case "saveTirePosition":
        return jsonResponse_({ ok: true, result: upsertRecord_("Tire_Position_Status", TIRE_POSITION_HEADERS, "Position_ID", body.record || {}) });
      case "batchSaveTirePositions":
        return jsonResponse_(batchUpsertRecords_("Tire_Position_Status", TIRE_POSITION_HEADERS, "Position_ID", body.records || []));
      case "saveTireDisposal":
        return jsonResponse_({ ok: true, result: upsertRecord_("Tire_Disposal_Log", TIRE_DISPOSAL_HEADERS, "Disposal_ID", body.record || {}) });
      case "batchSaveTireDisposals":
        return jsonResponse_(batchUpsertRecords_("Tire_Disposal_Log", TIRE_DISPOSAL_HEADERS, "Disposal_ID", body.records || []));
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
  return {
    ok: true,
    Tire_Inventory:      ensureSheet_(ss, "Tire_Inventory",      TIRE_INVENTORY_HEADERS),
    Tire_Change_Log:     ensureSheet_(ss, "Tire_Change_Log",     TIRE_CHANGE_HEADERS),
    Tire_Position_Status: ensureSheet_(ss, "Tire_Position_Status", TIRE_POSITION_HEADERS),
    Tire_Disposal_Log:   ensureSheet_(ss, "Tire_Disposal_Log",   TIRE_DISPOSAL_HEADERS),
    Tire_Settings:       ensureSheet_(ss, "Tire_Settings",       TIRE_SETTINGS_HEADERS)
  };
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
// Data helpers (shared pattern)
// ============================================================
function readRecords_(sheetName, headers) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var actual = getHeaders_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, actual.length)
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
  record.Updated_At = record.Encoded_At = now;
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
    record.Updated_At = record.Encoded_At = now;
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
