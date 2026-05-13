// ============================================================
// VNS CASH / PO / BALI — Google Apps Script
// Sheet: VNS_Cash_PO_Bali_Log  (create manually first)
//
// Setup:
//   1. Create Google Sheet named "VNS_Cash_PO_Bali_Log"
//   2. Extensions > Apps Script — copy the Script ID
//   3. Paste Script ID into .clasp.json
//   4. Set SPREADSHEET_ID below
//   5. clasp push && Deploy as Web App (Execute as: Me, Anyone)
//   6. Paste deployed URL into cash.js CASH_APP_SCRIPT_URL
// ============================================================

const SPREADSHEET_ID = "144qkV-l3Vo5tN6PusDGhcwLSKjIs2-sQeBYcpdA-bXM";
const SYNC_KEY       = "vns-cash-sync-2026-Jay";

const CASH_HEADERS = [
  "Cash_ID","Date","Time","Sender","Plate_Number","Group_Category",
  "Transaction_Type","Person_Name","Role","GCash_Number","Amount",
  "PO_Number","Liters","Fuel_Station","Route","Balance_After_Payroll",
  "Review_Status","Encoded_By","Remarks","Created_At","Updated_At",
  "Deleted_At","Deleted_By","Is_Deleted"
];

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonResponse_({ ok: true, status: "VNS Cash/PO/Bali API running", ts: new Date().toISOString() });
    }
    if (!validateKey_(e.parameter && e.parameter.syncKey)) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }
    if (action === "listEntries")  {
      withLock_(ensureAllTabs_);
      return jsonResponse_({ ok: true, entries: readRecords_("Cash_PO_Bali_Log", CASH_HEADERS, e.parameter && e.parameter.includeDeleted === "true") });
    }
    if (action === "ensureTabs")   return jsonResponse_(withLock_(ensureAllTabs_));
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

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse_({ ok: false, error: "System busy. Please try again." });
  }

  try {
    ensureAllTabs_();
    switch (body.action) {
      case "saveEntry":
        return jsonResponse_({ ok: true, result: upsertRecord_("Cash_PO_Bali_Log", CASH_HEADERS, "Cash_ID", body.record || {}) });
      case "batchSaveEntries":
        return jsonResponse_(batchUpsertRecords_("Cash_PO_Bali_Log", CASH_HEADERS, "Cash_ID", body.records || []));
      case "updateEntry":
        return jsonResponse_({ ok: true, result: updateRecord_("Cash_PO_Bali_Log", CASH_HEADERS, "Cash_ID", body.record || {}) });
      case "deleteEntry":
        return jsonResponse_({ ok: true, result: softDeleteRecord_("Cash_PO_Bali_Log", CASH_HEADERS, "Cash_ID", body.cashId || (body.record && body.record.Cash_ID), body.deletedBy || "") });
      case "ensureTabs":
        return jsonResponse_(ensureAllTabs_());
      default:
        return jsonResponse_({ ok: false, error: "Unknown action: " + body.action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Tab / column init
// ============================================================
function ensureAllTabs_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var r1 = ensureSheet_(ss, "Cash_PO_Bali_Log", CASH_HEADERS);
  return { ok: true, Cash_PO_Bali_Log: r1 };
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
function readRecords_(sheetName, headers, includeDeleted) {
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
    })
    .filter(function(obj) { return includeDeleted || String(obj.Is_Deleted || "").toUpperCase() !== "TRUE"; });
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

function updateRecord_(sheetName, headers, keyField, record) {
  var keyValue = String(record[keyField] || "").trim();
  if (!keyValue) return { skipped: true, reason: "Empty key" };
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet  = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual = getHeaders_(sheet);
  var rowIdx = findRowByKey_(sheet, actual, keyField, keyValue);
  if (rowIdx < 0) return upsertRecord_(sheetName, headers, keyField, record);
  record.Updated_At = new Date().toISOString();
  var rowValues = actual.map(function(h) { return record[h] !== undefined ? String(record[h] || "") : ""; });
  sheet.getRange(rowIdx, 1, 1, actual.length).setValues([rowValues]);
  return { updated: true, key: keyValue };
}

function softDeleteRecord_(sheetName, headers, keyField, keyValue, deletedBy) {
  keyValue = String(keyValue || "").trim();
  if (!keyValue) return { skipped: true, reason: "Empty key" };
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet  = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual = getHeaders_(sheet);
  var rowIdx = findRowByKey_(sheet, actual, keyField, keyValue);
  if (rowIdx < 0) return { skipped: true, reason: "Not found", key: keyValue };
  var now = new Date().toISOString();
  setCellIfColumn_(sheet, actual, rowIdx, "Is_Deleted", "TRUE");
  setCellIfColumn_(sheet, actual, rowIdx, "Deleted_At", now);
  setCellIfColumn_(sheet, actual, rowIdx, "Deleted_By", deletedBy || "");
  setCellIfColumn_(sheet, actual, rowIdx, "Updated_At", now);
  return { deleted: true, key: keyValue };
}

function findRowByKey_(sheet, actual, keyField, keyValue) {
  var keyIdx = actual.indexOf(keyField);
  if (keyIdx === -1 || sheet.getLastRow() < 2) return -1;
  var keys = sheet.getRange(2, keyIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0] || "").trim() === keyValue) return i + 2;
  }
  return -1;
}

function setCellIfColumn_(sheet, actual, rowIdx, field, value) {
  var idx = actual.indexOf(field);
  if (idx !== -1) sheet.getRange(rowIdx, idx + 1).setValue(value);
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

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    throw new Error("System busy. Please try again.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
