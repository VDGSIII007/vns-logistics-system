const SPREADSHEET_ID = "1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0";
const VNS_SYNC_KEY = "CHANGE_THIS_SECRET_KEY";

const COMMODITY_TABS = {
  "Bottle": "Bottle",
  "Sugar": "Sugar",
  "Preform / Resin": "PreformResin",
  "Preform": "PreformResin",
  "Resin": "PreformResin",
  "PreformResin": "PreformResin",
  "Caps / Crown": "CapsCrown",
  "Caps": "CapsCrown",
  "Crown": "CapsCrown",
  "Crowns": "CapsCrown",
  "CapsCrown": "CapsCrown"
};

const REPORT_TABS = {
  "Bottle": "Bottle_Report",
  "Sugar": "Sugar_Report",
  "Preform / Resin": "PreformResin_Report",
  "Preform": "PreformResin_Report",
  "Resin": "PreformResin_Report",
  "PreformResin": "PreformResin_Report",
  "Caps / Crown": "CapsCrown_Report",
  "Caps": "CapsCrown_Report",
  "Crown": "CapsCrown_Report",
  "Crowns": "CapsCrown_Report",
  "CapsCrown": "CapsCrown_Report"
};

const MAIN_COMMODITIES = ["Bottle", "Sugar", "Preform / Resin", "Caps / Crown"];
const LOOKUP_TABS = [
  "Suppliers",
  "IMEI_Map",
  "Warehouse_Plants",
  "Commodity",
  "Material_Description",
  "Status_List",
  "Geofences Area",
  "Settings"
];

const SOURCE_SHEETS = [
  {
    name: "VNS BOTTLE DISPATCH",
    id: "1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4",
    tabs: ["Bottle", "Bottle_Report", "Suppliers", "IMEI_Map", "Warehouse_Plants", "Commodity", "Material_Description", "Status_List", "Geofences Area"]
  },
  {
    name: "VNS SUGAR DISPATCH",
    id: "1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE",
    tabs: ["Sugar", "Sugar_Report", "Suppliers", "IMEI_Map", "Warehouse_Plants", "Status_List", "Geofences Area"]
  },
  {
    name: "VNS PREFORMRESIN DISPATCH",
    id: "1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw",
    tabs: ["PreformResin", "PreformResin_Report", "Suppliers", "IMEI_Map", "Warehouse_Plants", "Commodity", "Material_Description", "Status_List", "Geofences Area"]
  },
  {
    name: "VNS CAPSCROWN DISPATCH",
    id: "1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw",
    tabs: ["CapsCrown", "CapsCrown_Report", "Suppliers", "IMEI_Map", "Warehouse_Plants", "Commodity", "Material_Description", "Status_List", "Geofences Area"]
  }
];

const FIELD_ALIASES = {
  Record_ID: ["Record_ID", "Record ID", "recordId", "Trip_ID", "Trip ID", "ID"],
  Commodity: ["Commodity", "Group", "Group / Category", "Category"],
  Group: ["Group", "Group / Category", "Category", "Commodity"],
  Plate: ["Plate", "Plate Number", "Plate_Number", "Truck", "Truck Plate"],
  Driver: ["Driver", "Driver Name", "Driver_Name"],
  Helper: ["Helper", "Helper Name", "Helper_Name"],
  Source: ["Source", "Origin", "From"],
  Destination: ["Destination", "To"],
  Location: ["Location", "Current Location", "Friendly Location", "Geofence"],
  Status: ["Status", "Trip Status"],
  Booking_Date: ["Booking_Date", "Booking Date", "Date Assigned", "Date_Assigned"],
  Plan_Pickup: ["Plan_Pickup", "Plan Pickup", "Planned Pickup"],
  Actual_Pickup: ["Actual_Pickup", "Actual Pickup"],
  LSP: ["LSP", "Logistics Service Provider"],
  Supplier: ["Supplier", "Supplier Name"],
  Shipment_Number: ["Shipment_Number", "Shipment Number", "Shipment #", "Shipment No"],
  Container_Number: ["Container_Number", "Container Number", "Container #", "Ref #", "Ref Number"],
  Pallet_Size: ["Pallet_Size", "Pallet Size", "Packaging", "Type of Pallet"],
  Loaded: ["Loaded", "Qty", "Quantity", "Pallet Qty"],
  Remarks: ["Remarks", "Notes"],
  Created_At: ["Created_At", "Created At", "Created"],
  Updated_At: ["Updated_At", "Updated At", "Last Updated"],
  Delivered_At: ["Delivered_At", "Delivered At", "Delivered"],
  Logged_At: ["Logged_At", "Logged At", "Logged"]
};

function doGet(e) {
  try {
    const action = e.parameter.action || "health";
    if (action === "health") return jsonResponse({ ok: true, message: "VNS central dispatch sync backend is healthy." });
    assertSyncKey(e.parameter.syncKey);

    if (action === "getTrips") {
      return jsonResponse({ ok: true, message: "Trips fetched.", data: getTrips(e.parameter.commodity) });
    }
    if (action === "getAllTrips") {
      const data = MAIN_COMMODITIES.reduce((rows, commodity) => rows.concat(getTrips(commodity)), []);
      return jsonResponse({ ok: true, message: "All trips fetched.", data });
    }
    if (action === "auditSourceTabs") {
      return jsonResponse({ ok: true, message: "Source audit written.", data: auditSourceTabs() });
    }
    return jsonResponse({ ok: false, error: "Unknown GET action." });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const body = parseBody(e);
    assertSyncKey(body.syncKey);

    if (body.action === "upsertTrip") {
      return jsonResponse({ ok: true, message: "Trip saved.", data: upsertTrip(body.record, body.commodity) });
    }
    if (body.action === "upsertManyTrips") {
      const records = body.records || [];
      const data = records.map(record => upsertTrip(record, record.Commodity || record.Group || body.commodity));
      return jsonResponse({ ok: true, message: `${data.length} trip(s) saved.`, data });
    }
    if (body.action === "markDelivered") {
      const record = body.record || {};
      const now = new Date().toISOString();
      record.Status = "Delivered";
      record.Delivered_At = record.Delivered_At || now;
      record.Logged_At = record.Logged_At || now;
      const data = upsertTrip(record, body.commodity || record.Commodity || record.Group);
      appendReport(record, body.commodity || record.Commodity || record.Group);
      return jsonResponse({ ok: true, message: "Trip marked delivered.", data });
    }
    if (body.action === "addToLogs") {
      const record = body.record || {};
      record.Logged_At = record.Logged_At || new Date().toISOString();
      const data = upsertTrip(record, body.commodity || record.Commodity || record.Group);
      appendReport(record, body.commodity || record.Commodity || record.Group);
      return jsonResponse({ ok: true, message: "Trip added to report.", data });
    }
    if (body.action === "auditSourceTabs") {
      return jsonResponse({ ok: true, message: "Source audit written.", data: auditSourceTabs() });
    }
    return jsonResponse({ ok: false, error: "Unknown POST action." });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function auditSourceTabs() {
  const results = [];
  SOURCE_SHEETS.forEach(source => {
    const ss = SpreadsheetApp.openById(source.id);
    source.tabs.forEach(tabName => {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) {
        results.push([new Date(), source.name, source.id, tabName, "MISSING", 0, "", ""]);
        return;
      }
      const lastColumn = sheet.getLastColumn();
      const lastRow = sheet.getLastRow();
      const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
      const sampleRowCount = Math.min(Math.max(lastRow - 1, 0), 3);
      const sampleRows = sampleRowCount ? sheet.getRange(2, 1, sampleRowCount, lastColumn).getValues() : [];
      results.push([
        new Date(),
        ss.getName() || source.name,
        source.id,
        tabName,
        "OK",
        lastColumn,
        JSON.stringify(headers),
        JSON.stringify(sampleRows)
      ]);
    });
  });

  const central = SpreadsheetApp.openById(SPREADSHEET_ID);
  const auditSheet = central.getSheetByName("Source_Audit") || central.insertSheet("Source_Audit");
  auditSheet.clearContents();
  auditSheet.getRange(1, 1, 1, 8).setValues([[
    "Audited_At",
    "Spreadsheet_Name",
    "Spreadsheet_ID",
    "Tab_Name",
    "Status",
    "Column_Count",
    "Headers_Row_1_JSON",
    "First_3_Sample_Rows_JSON"
  ]]);
  if (results.length) auditSheet.getRange(2, 1, results.length, 8).setValues(results);
  ensureCentralTabs();
  return results.map(row => ({
    auditedAt: row[0],
    spreadsheetName: row[1],
    spreadsheetId: row[2],
    tabName: row[3],
    status: row[4],
    columnCount: row[5],
    headers: JSON.parse(row[6] || "[]"),
    sampleRows: JSON.parse(row[7] || "[]")
  }));
}

function upsertTrip(record, commodity) {
  if (!record) throw new Error("Missing record.");
  const sheet = getCommoditySheet(commodity || record.Commodity || record.Group);
  const cleanRecord = normalizeRecord(record, commodity || record.Commodity || record.Group);
  const headers = getHeaders(sheet);
  if (!headers.length) throw new Error(`Missing headers in ${sheet.getName()}. Run auditSourceTabs and copy the source headers first.`);
  if (!cleanRecord.Record_ID) throw new Error("Record_ID is required.");

  const rowIndex = findRecordRow(sheet, headers, cleanRecord.Record_ID);
  const rowValues = buildRowValues(headers, cleanRecord);
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
    return { Record_ID: cleanRecord.Record_ID, updated: true, sheet: sheet.getName() };
  }
  sheet.appendRow(rowValues);
  return { Record_ID: cleanRecord.Record_ID, created: true, sheet: sheet.getName() };
}

function getTrips(commodity) {
  const sheet = getCommoditySheet(commodity);
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (!headers.length || lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .filter(row => row.some(value => value !== ""))
    .map(row => rowToRecord(headers, row));
}

function appendReport(record, commodity) {
  const sheet = getReportSheet(commodity || record.Commodity || record.Group);
  const headers = getHeaders(sheet);
  if (!headers.length) throw new Error(`Missing headers in ${sheet.getName()}.`);
  const cleanRecord = normalizeRecord(record, commodity || record.Commodity || record.Group);
  const rowIndex = findRecordRow(sheet, headers, cleanRecord.Record_ID);
  const rowValues = buildRowValues(headers, cleanRecord);
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function ensureCentralTabs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  MAIN_COMMODITIES.forEach(commodity => {
    ensureSheet(ss, COMMODITY_TABS[commodity]);
    ensureSheet(ss, REPORT_TABS[commodity]);
  });
  LOOKUP_TABS.forEach(name => ensureSheet(ss, name));
}

function getCommoditySheet(commodity) {
  const sheetName = getCommodityTabName(commodity);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ensureSheet(ss, sheetName);
}

function getReportSheet(commodity) {
  const sheetName = getReportTabName(commodity);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ensureSheet(ss, sheetName);
}

function ensureSheet(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(value => String(value || "").trim());
}

function buildRowValues(headers, record) {
  return headers.map(header => {
    const key = canonicalFieldForHeader(header);
    if (key && Object.prototype.hasOwnProperty.call(record, key)) return record[key] || "";
    return record[header] || "";
  });
}

function rowToRecord(headers, row) {
  const record = {};
  headers.forEach((header, index) => {
    const key = canonicalFieldForHeader(header) || header;
    record[key] = row[index];
    record[header] = row[index];
  });
  return record;
}

function canonicalFieldForHeader(header) {
  const normalizedHeader = normalizeHeader(header);
  return Object.keys(FIELD_ALIASES).find(field =>
    FIELD_ALIASES[field].some(alias => normalizeHeader(alias) === normalizedHeader)
  );
}

function findRecordRow(sheet, headers, recordId) {
  const recordIdColumn = headers.findIndex(header => canonicalFieldForHeader(header) === "Record_ID") + 1;
  if (!recordIdColumn) throw new Error(`Record_ID column not found in ${sheet.getName()}.`);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, recordIdColumn, lastRow - 1, 1).getValues();
  const index = ids.findIndex(row => row[0] === recordId);
  return index === -1 ? -1 : index + 2;
}

function normalizeRecord(record, commodity) {
  const now = new Date().toISOString();
  const normalizedCommodity = normalizeCommodity(commodity || record.Commodity || record.Group);
  return {
    ...record,
    Record_ID: record.Record_ID || record.recordId || record.ID || "",
    Commodity: normalizedCommodity,
    Group: record.Group || normalizedCommodity,
    Created_At: record.Created_At || now,
    Updated_At: now,
    Delivered_At: record.Status === "Delivered" ? (record.Delivered_At || now) : (record.Delivered_At || ""),
    Logged_At: record.Logged_At || ""
  };
}

function getCommodityTabName(commodity) {
  const normalized = normalizeCommodity(commodity);
  const sheetName = COMMODITY_TABS[normalized];
  if (!sheetName) throw new Error(`Unsupported commodity: ${commodity}`);
  return sheetName;
}

function getReportTabName(commodity) {
  const normalized = normalizeCommodity(commodity);
  const sheetName = REPORT_TABS[normalized];
  if (!sheetName) throw new Error(`Unsupported commodity report: ${commodity}`);
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

function parseBody(e) {
  return JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
}

function assertSyncKey(syncKey) {
  if (!syncKey || syncKey !== VNS_SYNC_KEY) throw new Error("Invalid sync key.");
}

function jsonResponse(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
