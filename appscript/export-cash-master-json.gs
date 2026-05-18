// Temporary JSON exporter for Cash / PO / Bali and Master Data Supabase migration.
// Deploy as a web app or run exportCashAndMasterDataJson() from Apps Script.
// This script is read-only and does not modify any sheet.

var MASTER_DATA_SPREADSHEET_ID = "14JVeGkI3EIaZEHix56ICnFjOE56mrB9LK5sulgPTc7Q";
var CASH_PO_BALI_SPREADSHEET_ID = "144qkV-l3Vo5tN6PusDGhcwLSKjIs2-sQeBYcpdA-bXM";

var EXPORT_TABS = [
  { spreadsheetId: MASTER_DATA_SPREADSHEET_ID, name: "Truck_Master" },
  { spreadsheetId: MASTER_DATA_SPREADSHEET_ID, name: "Driver_Master" },
  { spreadsheetId: MASTER_DATA_SPREADSHEET_ID, name: "Helper_Master" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "Cash_PO_Bali_Log" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "People_Masterlist" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "Settings" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "Payroll_Cutoff_Periods" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "Truck_Masterlist" },
  { spreadsheetId: CASH_PO_BALI_SPREADSHEET_ID, name: "Current_Balances" }
];

function exportCashAndMasterDataJson() {
  var exportData = {};
  var counts = {};

  EXPORT_TABS.forEach(function(tabConfig) {
    var rows = readTabAsObjects_(tabConfig.spreadsheetId, tabConfig.name);
    exportData[tabConfig.name] = rows;
    counts[tabConfig.name] = rows.length;
    console.log(tabConfig.name + ": " + rows.length + " rows");
  });

  console.log("Export counts: " + JSON.stringify(counts));
  return exportData;
}

function doGet(e) {
  var data = exportCashAndMasterDataJson();
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function readTabAsObjects_(spreadsheetId, tabName) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    console.log(tabName + ": missing tab");
    return [];
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) {
        return String(value === null || value === undefined ? "" : value).trim() !== "";
      });
    })
    .map(function(row) {
      var record = {};
      headers.forEach(function(header, index) {
        if (!header) return;
        record[header] = normalizeExportValue_(row[index]);
      });
      return record;
    });
}

function normalizeExportValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return value;
}
