// ============================================================
// VNS WEBSITE DISPATCH SYNC — WebsiteDispatchSync.js
// Handles POST writes from the Cloudflare dispatch website
// to the VNS Central Dispatch API spreadsheet.
//
// Code.js is read-only and already owns doGet(e).
// This file owns doPost(e) only.
// Do NOT add doGet here.
// ============================================================

// ============================================================
// SECURITY KEY — replace before deploying
// ============================================================

const VNS_SYNC_KEY = "vns-dispatch-sync-2026-Jay";

// ============================================================
// CENTRAL SPREADSHEET
// ============================================================

const CENTRAL_SPREADSHEET_ID = "1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0";

// ============================================================
// COMMODITY → SHEET TAB MAPPING
// ============================================================

const WS_COMMODITY_SHEET_MAP = {
  "Bottle":          "Bottle",
  "Bottles":         "Bottle",
  "Sugar":           "Sugar",
  "Preform / Resin": "PreformResin",
  "Preform":         "PreformResin",
  "Resin":           "PreformResin",
  "PreformResin":    "PreformResin",
  "Caps / Crown":    "CapsCrown",
  "Caps":            "CapsCrown",
  "Crown":           "CapsCrown",
  "Crowns":          "CapsCrown",
  "CapsCrown":       "CapsCrown",
};

const WS_REPORT_SHEET_MAP = {
  "Bottle":          "Bottle_Report",
  "Bottles":         "Bottle_Report",
  "Sugar":           "Sugar_Report",
  "Preform / Resin": "PreformResin_Report",
  "Preform":         "PreformResin_Report",
  "Resin":           "PreformResin_Report",
  "PreformResin":    "PreformResin_Report",
  "Caps / Crown":    "CapsCrown_Report",
  "Caps":            "CapsCrown_Report",
  "Crown":           "CapsCrown_Report",
  "Crowns":          "CapsCrown_Report",
  "CapsCrown":       "CapsCrown_Report",
};

// ============================================================
// CANONICAL HEADERS
// appendOrUpdateByHeaders_ only writes to matching columns;
// adds missing ones to the right — never clears existing ones.
// ============================================================

const WS_DISPATCH_HEADERS = [
  "Record_ID", "Commodity", "Group", "Plate", "Driver", "Helper",
  "Source", "Destination", "Location", "Status",
  "Booking_Date", "Plan_Pickup", "Actual_Pickup",
  "LSP", "Supplier", "Shipment_Number", "Container_Number",
  "Pallet_Size", "Loaded", "Remarks",
  "Created_At", "Updated_At", "Delivered_At", "Logged_At",
];

const WS_REPORT_HEADERS = [
  "Log_ID", "Record_ID", "Commodity", "Plate",
  "Action", "Status", "Remarks", "Logged_At", "Logged_By",
];

const WS_SHARED_TABS = [
  "Suppliers", "IMEI_Map", "Warehouse_Plants", "Commodity",
  "Material_Description", "Status_List", "Geofences Area",
  "Settings", "Source_Audit",
];

// ============================================================
// doPost(e) — main entry point for website → Apps Script POST
// ============================================================

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return websiteJsonResponse_({ ok: false, error: "Invalid JSON payload: " + err.message });
  }

  const action = (payload.action || "").trim();

  if (action === "health") {
    return websiteJsonResponse_({
      ok:        true,
      status:    "WebsiteDispatchSync is running",
      timestamp: getNowIso_(),
    });
  }

  if (!validateWebsiteSyncKey_(payload)) {
    return websiteJsonResponse_({ ok: false, error: "Unauthorized: invalid or missing syncKey." });
  }

  try {
    switch (action) {
      case "saveDispatchTrip":
        return websiteJsonResponse_(upsertWebsiteDispatchRow_(payload));

      case "batchSaveDispatchTrips":
        return websiteJsonResponse_(batchUpsertWebsiteDispatchRows_(payload));

      case "markDelivered":
        return websiteJsonResponse_(markWebsiteDispatchDelivered_(payload));

      case "addToLogs":
        return websiteJsonResponse_(addWebsiteDispatchReportLog_(payload));

      case "ensureTabs":
        return websiteJsonResponse_(ensureWebsiteTabs_());

      default:
        return websiteJsonResponse_({ ok: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    return websiteJsonResponse_({ ok: false, error: err.message, stack: err.stack });
  }
}

// ============================================================
// websiteJsonResponse_ — JSON ContentService wrapper
// ============================================================

function websiteJsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// validateWebsiteSyncKey_
// ============================================================

function validateWebsiteSyncKey_(payload) {
  return payload && payload.syncKey === VNS_SYNC_KEY;
}

// ============================================================
// getCentralSpreadsheet_
// ============================================================

function getCentralSpreadsheet_() {
  return SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID);
}

// ============================================================
// ensureWebsiteTabs_
// Creates missing dispatch, report, and shared tabs.
// Never deletes or renames existing tabs.
// ============================================================

function ensureWebsiteTabs_() {
  const ss      = getCentralSpreadsheet_();
  const created = [];
  const existing = [];

  const commodityTabs = ["Bottle", "Sugar", "PreformResin", "CapsCrown"];
  const reportTabs    = ["Bottle_Report", "Sugar_Report", "PreformResin_Report", "CapsCrown_Report"];
  const allTabs       = [...commodityTabs, ...reportTabs, ...WS_SHARED_TABS];

  for (const tabName of allTabs) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      created.push(tabName);
      if (commodityTabs.indexOf(tabName) !== -1) {
        sheet.getRange(1, 1, 1, WS_DISPATCH_HEADERS.length).setValues([WS_DISPATCH_HEADERS]);
      } else if (reportTabs.indexOf(tabName) !== -1) {
        sheet.getRange(1, 1, 1, WS_REPORT_HEADERS.length).setValues([WS_REPORT_HEADERS]);
      }
    } else {
      existing.push(tabName);
    }
  }

  return { ok: true, created: created, existing: existing };
}

// ============================================================
// getCommoditySheetName_ / getReportSheetName_
// ============================================================

function getCommoditySheetName_(commodity) {
  return WS_COMMODITY_SHEET_MAP[(commodity || "").toString().trim()] || null;
}

function getReportSheetName_(commodity) {
  return WS_REPORT_SHEET_MAP[(commodity || "").toString().trim()] || null;
}

// ============================================================
// upsertWebsiteDispatchRow_
// Saves or updates one trip record in the correct commodity tab.
// ============================================================

function upsertWebsiteDispatchRow_(payload) {
  const commodity = payload.commodity
    || (payload.record && payload.record.Commodity)
    || "";
  const sheetName = getCommoditySheetName_(commodity);
  if (!sheetName) return { ok: false, error: "Unknown commodity: " + commodity };

  const ss    = getCentralSpreadsheet_();
  let   sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const record = normalizeWebsiteRecord_(payload);
  if (!record.Record_ID) record.Record_ID = makeRecordId_(commodity);

  return appendOrUpdateByHeaders_(sheet, record);
}

// ============================================================
// batchUpsertWebsiteDispatchRows_
// Saves an array of records (payload.records).
// ============================================================

function batchUpsertWebsiteDispatchRows_(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!records.length) return { ok: false, error: "No records provided in payload.records." };

  const results = [];
  for (const rec of records) {
    const singlePayload = {
      syncKey:   payload.syncKey,
      action:    "saveDispatchTrip",
      commodity: rec.Commodity || payload.commodity || "",
      record:    rec,
    };
    const result = upsertWebsiteDispatchRow_(singlePayload);
    results.push({ record_id: rec.Record_ID || null, ok: result.ok, action: result.action || null, error: result.error || null });
  }

  const failed = results.filter(function(r) { return !r.ok; }).length;
  return { ok: true, processed: results.length, failed: failed, results: results };
}

// ============================================================
// markWebsiteDispatchDelivered_
// Sets Status = Delivered, stamps Delivered_At.
// ============================================================

function markWebsiteDispatchDelivered_(payload) {
  const commodity = payload.commodity
    || (payload.record && payload.record.Commodity)
    || "";
  const sheetName = getCommoditySheetName_(commodity);
  if (!sheetName) return { ok: false, error: "Unknown commodity: " + commodity };

  const ss    = getCentralSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet not found: " + sheetName };

  const record          = normalizeWebsiteRecord_(payload);
  record.Status         = "Delivered";
  record.Delivered_At   = record.Delivered_At || getNowIso_();
  record.Updated_At     = getNowIso_();

  return appendOrUpdateByHeaders_(sheet, record);
}

// ============================================================
// addWebsiteDispatchReportLog_
// Appends one log entry to the correct _Report tab.
// ============================================================

function addWebsiteDispatchReportLog_(payload) {
  const commodity  = payload.commodity
    || (payload.record && payload.record.Commodity)
    || "";
  const reportName = getReportSheetName_(commodity);
  if (!reportName) return { ok: false, error: "Unknown commodity for report: " + commodity };

  const ss    = getCentralSpreadsheet_();
  let   sheet = ss.getSheetByName(reportName);
  if (!sheet) sheet = ss.insertSheet(reportName);

  ensureHeaders_(sheet, WS_REPORT_HEADERS);

  const rec      = payload.record || {};
  const logId    = makeRecordId_("LOG");
  const logEntry = {
    Log_ID:    logId,
    Record_ID: rec.Record_ID  || "",
    Commodity: commodity,
    Plate:     rec.Plate      || "",
    Action:    payload.action_label || rec.Action || "Log",
    Status:    rec.Status     || "",
    Remarks:   rec.Remarks    || "",
    Logged_At: getNowIso_(),
    Logged_By: payload.logged_by || "Website",
  };

  const currentHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(h) { return h.toString().trim(); });

  const rowData = currentHeaders.map(function(h) {
    return logEntry[h] !== undefined ? logEntry[h] : "";
  });
  sheet.appendRow(rowData);

  return { ok: true, logged: true, log_id: logId };
}

// ============================================================
// findRowByRecordId_
// Returns the 1-indexed sheet row number for a given Record_ID,
// or -1 if not found.
// ============================================================

function findRowByRecordId_(sheet, recordId) {
  if (!recordId) return -1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let recordIdCol = -1;
  for (var i = 0; i < headerRow.length; i++) {
    if (headerRow[i].toString().trim() === "Record_ID") {
      recordIdCol = i + 1;
      break;
    }
  }
  if (recordIdCol === -1) return -1;

  const colValues = sheet.getRange(2, recordIdCol, lastRow - 1, 1).getValues();
  for (var r = 0; r < colValues.length; r++) {
    if (colValues[r][0].toString().trim() === recordId.toString().trim()) {
      return r + 2;
    }
  }
  return -1;
}

// ============================================================
// appendOrUpdateByHeaders_
// Reads existing headers, writes only to matching columns,
// appends missing headers to the right (never clears any column).
// If Record_ID matches an existing row, updates it.
// Otherwise appends a new row.
// ============================================================

function appendOrUpdateByHeaders_(sheet, record) {
  ensureHeaders_(sheet, WS_DISPATCH_HEADERS);

  const lastCol    = sheet.getLastColumn();
  const headerRow  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap  = {};
  headerRow.forEach(function(h, i) {
    var key = h.toString().trim();
    if (key) headerMap[key] = i;
  });

  const now        = getNowIso_();
  const targetRow  = findRowByRecordId_(sheet, record.Record_ID);

  if (targetRow > 0) {
    // Update existing row — read it first to avoid clearing untouched columns
    const rowRange  = sheet.getRange(targetRow, 1, 1, lastCol);
    const rowValues = rowRange.getValues()[0];

    for (var field in record) {
      var colIdx = headerMap[field];
      if (colIdx === undefined) continue;
      var newVal = record[field];
      // Never clear Created_At or Delivered_At if already set
      if (field === "Created_At" && rowValues[colIdx]) continue;
      if (field === "Delivered_At" && rowValues[colIdx] && !newVal) continue;
      rowValues[colIdx] = newVal;
    }
    if (headerMap["Updated_At"] !== undefined) rowValues[headerMap["Updated_At"]] = now;

    rowRange.setValues([rowValues]);
    return { ok: true, action: "updated", record_id: record.Record_ID, row: targetRow };
  }

  // Append new row
  const newRow = new Array(lastCol).fill("");
  for (var f in record) {
    var ci = headerMap[f];
    if (ci !== undefined) newRow[ci] = record[f];
  }
  if (headerMap["Created_At"] !== undefined && !newRow[headerMap["Created_At"]]) {
    newRow[headerMap["Created_At"]] = now;
  }
  if (headerMap["Updated_At"] !== undefined) {
    newRow[headerMap["Updated_At"]] = now;
  }

  sheet.appendRow(newRow);
  return { ok: true, action: "appended", record_id: record.Record_ID };
}

// ============================================================
// ensureHeaders_
// Adds any headers from the provided list that are missing
// in row 1 of the sheet, appended to the right.
// Never removes or reorders existing columns.
// ============================================================

function ensureHeaders_(sheet, headers) {
  const lastCol = sheet.getLastColumn();

  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const existing    = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return h.toString().trim(); });
  const existingSet = {};
  existing.forEach(function(h) { if (h) existingSet[h] = true; });

  const missing = headers.filter(function(h) { return !existingSet[h]; });
  if (!missing.length) return;

  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
}

// ============================================================
// normalizeWebsiteRecord_
// Builds a clean record object from the POST payload.
// ============================================================

function normalizeWebsiteRecord_(payload) {
  const now = getNowIso_();
  const rec = payload.record || {};
  return {
    Record_ID:        rec.Record_ID        || "",
    Commodity:        rec.Commodity        || payload.commodity || "",
    Group:            rec.Group            || payload.commodity || "",
    Plate:            rec.Plate            || "",
    Driver:           rec.Driver           || "",
    Helper:           rec.Helper           || "",
    Source:           rec.Source           || "",
    Destination:      rec.Destination      || "",
    Location:         rec.Location         || "",
    Status:           rec.Status           || "",
    Booking_Date:     rec.Booking_Date     || "",
    Plan_Pickup:      rec.Plan_Pickup      || "",
    Actual_Pickup:    rec.Actual_Pickup    || "",
    LSP:              rec.LSP              || "",
    Supplier:         rec.Supplier         || "",
    Shipment_Number:  rec.Shipment_Number  || "",
    Container_Number: rec.Container_Number || "",
    Pallet_Size:      rec.Pallet_Size      || "",
    Loaded:           rec.Loaded           || "",
    Remarks:          rec.Remarks          || "",
    Created_At:       rec.Created_At       || now,
    Updated_At:       now,
    Delivered_At:     rec.Delivered_At     || "",
    Logged_At:        rec.Logged_At        || "",
  };
}

// ============================================================
// makeRecordId_
// Generates a unique Record_ID: PREFIX-timestamp-random
// ============================================================

function makeRecordId_(commodity) {
  var prefix = (commodity || "REC").toString().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

// ============================================================
// getNowIso_ — current UTC ISO timestamp
// ============================================================

function getNowIso_() {
  return new Date().toISOString();
}
