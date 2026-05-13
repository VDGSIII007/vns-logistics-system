// ============================================================
// VNS PARTS INVENTORY — Google Apps Script
// Sheet: VNS_Parts_Inventory_Master
// Spreadsheet ID: 1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM
//
// Setup:
//   1. Open Google Sheet "VNS_Parts_Inventory_Master"
//   2. Extensions > Apps Script — copy the Script ID
//   3. Paste Script ID into .clasp.json
//   4. Set SPREADSHEET_ID below (already known)
//   5. clasp push && Deploy as Web App (Execute as: Me, Anyone)
//   6. Paste deployed URL into parts-inventory.js PARTS_APP_SCRIPT_URL
// ============================================================

const SPREADSHEET_ID = "1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM";
const SYNC_KEY       = "vns-parts-sync-2026-Jay";

// Inventory_Items: master catalogue, one row per unique part/item
const INVENTORY_ITEMS_HEADERS = [
  "Item_ID","Item_Name","Item_Type","Category","Make","Brand","Model",
  "Part_Number","Serial_Number","Engine_Number","Chassis_Number","Unit",
  "Current_Stock","Minimum_Stock","Average_Unit_Cost","Supplier",
  "Storage_Location","Last_Updated","Remarks","Created_At","Updated_At"
];

// Parts_In: stock-in transactions
const PARTS_IN_HEADERS = [
  "Parts_In_ID","Date","Plate_Number","Item_Name","Item_Type","Category",
  "Make","Brand","Model","Part_Number","Serial_Number","Engine_Number",
  "Chassis_Number","Unit","Quantity","Unit_Cost","Total_Cost","Supplier",
  "Storage_Location","Receipt_No","Received_By","Remarks","Created_At"
];

// Parts_Out: stock-out transactions
const PARTS_OUT_HEADERS = [
  "Parts_Out_ID","Date","Plate_Number","Driver","Helper","Item_Name",
  "Item_Type","Category","Make","Brand","Model","Part_Number","Quantity",
  "Unit_Cost","Total_Cost","Released_To","Requested_By","Repair_Request_ID",
  "Work_Done","Odometer","Remarks","Created_At"
];

// Movement_History: ledger of all in/out movements
const MOVEMENT_HISTORY_HEADERS = [
  "Movement_ID","Date","Movement_Type","Item_ID","Item_Name","Item_Type",
  "Category","Make","Brand","Part_Number","Quantity","Unit","Unit_Cost",
  "Total_Cost","Plate_Number","Supplier","Storage_Location","Reference_ID",
  "Remarks","Created_At"
];

const SETTINGS_HEADERS = [
  "Key","Value","Category","Description","Updated_At"
];

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonResponse_({ ok: true, status: "VNS Parts Inventory API running", ts: new Date().toISOString() });
    }
    if (!validateKey_(e.parameter && e.parameter.syncKey)) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }
    ensureAllTabs_();
    if (action === "getInventoryItems")  return jsonResponse_({ ok: true, items:     readRecords_("Inventory_Items",    INVENTORY_ITEMS_HEADERS) });
    if (action === "getPartsIn")         return jsonResponse_({ ok: true, partsIn:   readRecords_("Parts_In",           PARTS_IN_HEADERS)         });
    if (action === "getPartsOut")        return jsonResponse_({ ok: true, partsOut:  readRecords_("Parts_Out",          PARTS_OUT_HEADERS)        });
    if (action === "getMovements")       return jsonResponse_({ ok: true, movements: readRecords_("Movement_History",   MOVEMENT_HISTORY_HEADERS) });
    if (action === "getAllPartsData") {
      return jsonResponse_({
        ok:        true,
        items:     readRecords_("Inventory_Items",  INVENTORY_ITEMS_HEADERS),
        partsIn:   readRecords_("Parts_In",         PARTS_IN_HEADERS),
        partsOut:  readRecords_("Parts_Out",        PARTS_OUT_HEADERS),
        movements: readRecords_("Movement_History", MOVEMENT_HISTORY_HEADERS)
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
      case "saveInventoryItem":
        return jsonResponse_({ ok: true, result: upsertRecord_("Inventory_Items", INVENTORY_ITEMS_HEADERS, "Item_ID", body.record || {}) });
      case "batchSaveInventoryItems":
        return jsonResponse_(batchUpsertRecords_("Inventory_Items", INVENTORY_ITEMS_HEADERS, "Item_ID", body.records || []));
      case "savePartsIn":
        return jsonResponse_({ ok: true, result: upsertRecord_("Parts_In", PARTS_IN_HEADERS, "Parts_In_ID", body.record || {}) });
      case "batchSavePartsIn":
        return jsonResponse_(batchUpsertRecords_("Parts_In", PARTS_IN_HEADERS, "Parts_In_ID", body.records || []));
      case "savePartsOut":
        return jsonResponse_({ ok: true, result: upsertRecord_("Parts_Out", PARTS_OUT_HEADERS, "Parts_Out_ID", body.record || {}) });
      case "batchSavePartsOut":
        return jsonResponse_(batchUpsertRecords_("Parts_Out", PARTS_OUT_HEADERS, "Parts_Out_ID", body.records || []));
      case "saveMovement":
        return jsonResponse_({ ok: true, result: upsertRecord_("Movement_History", MOVEMENT_HISTORY_HEADERS, "Movement_ID", body.record || {}) });
      case "batchSaveMovements":
        return jsonResponse_(batchUpsertRecords_("Movement_History", MOVEMENT_HISTORY_HEADERS, "Movement_ID", body.records || []));
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
    Inventory_Items:  ensureSheet_(ss, "Inventory_Items",  INVENTORY_ITEMS_HEADERS),
    Parts_In:         ensureSheet_(ss, "Parts_In",         PARTS_IN_HEADERS),
    Parts_Out:        ensureSheet_(ss, "Parts_Out",        PARTS_OUT_HEADERS),
    Movement_History: ensureSheet_(ss, "Movement_History", MOVEMENT_HISTORY_HEADERS),
    Settings:         ensureSheet_(ss, "Settings",         SETTINGS_HEADERS)
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
// Data helpers
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
