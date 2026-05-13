const SPREADSHEET_ID = "1A_yPDhfXuRVuJy8kWL0uPBhIcJkg4mgLlv-cF-4tFq0";
const SHEET_NAME = "Repair_Requests";
const LOG_SHEET_NAME = "Repair_Status_Log";

const REPAIR_REQUEST_HEADERS = [
  // Existing live columns. Keep this order so old sheet data stays aligned.
  "Request_ID",
  "Request_Type",
  "Date_Requested",
  "Date_Finished",
  "Requested_By",
  "Plate_Number",
  "Truck_Type",
  "Driver",
  "Helper",
  "Category",
  "Repair_Parts",
  "Work_Done",
  "Quantity",
  "Unit_Cost",
  "Parts_Cost",
  "Labor_Cost",
  "Total_Cost",
  "Supplier",
  "Supplier_Contact",
  "Payee",
  "Status",
  "Repair_Status",
  "Payment_Status",
  "Approved_By",
  "Proof_Of_Payment",
  "Receipt_Link",
  "Photo_Link",
  "Mechanic",
  "Remarks",
  "Source_Message",
  "Created_At",
  "Payment_Message",
  "Saved_By",
  "Last_Updated",
  // Current frontend payload fields appended to the right only.
  "Odometer",
  "Priority",
  "Outside_Shop_Cost",
  "Towing_Cost",
  "Other_Cost",
  "Original_Total_Cost",
  "Final_Cost",
  "Assigned_To",
  "Shop_Name",
  "Approval_Status",
  "Cost_Remarks",
  "Approved_Cost"
];

const STATUS_LOG_HEADERS = [
  "Log_ID",
  "Request_ID",
  "Action",
  "Old_Status",
  "New_Status",
  "Old_Payment_Status",
  "New_Payment_Status",
  "Updated_By",
  "Updated_At",
  "Remarks"
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");

    if (data.action === "updateStatus") {
      return updateStatus(data);
    }

    const sheet = ensureRepairSheet_();
    const headers = getHeaders_(sheet);
    const rows = Array.isArray(data) ? data : data.rows;

    if (!rows || rows.length === 0) {
      return jsonResponse({
        success: false,
        message: "No rows received."
      });
    }

    const values = rows.map(function(row) {
      const normalized = normalizeRepairRow_(row || {});
      return headers.map(function(header) {
        return normalized.hasOwnProperty(header) ? normalized[header] : "";
      });
    });

    sheet.getRange(
      sheet.getLastRow() + 1,
      1,
      values.length,
      headers.length
    ).setValues(values);

    return jsonResponse({
      success: true,
      message: "Saved successfully.",
      rows_saved: values.length
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      message: err.message
    });
  }
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === "list") {
    return listRepairRecords();
  }

  if (action === "garageTrucks") {
    return listGarageTrucks();
  }

  return jsonResponse({
    success: true,
    message: "VNS Repair Web App is active. Use POST to save repair requests. Use ?action=list or ?action=garageTrucks."
  });
}

function updateStatus(data) {
  const sheet = ensureRepairSheet_();
  const logSheet = ensureStatusLogSheet_();
  const headers = getHeaders_(sheet);
  const values = sheet.getDataRange().getValues();

  const requestId = data.Request_ID || data.repairRecordId || data.Repair_Record_ID || data.requestId;
  if (!requestId) {
    return jsonResponse({
      success: false,
      message: "Request_ID is required."
    });
  }

  const requestIdCol = headers.indexOf("Request_ID");
  const statusCol = headers.indexOf("Status");
  const paymentStatusCol = headers.indexOf("Payment_Status");
  const oldStatus = statusCol >= 0 ? "" : "";
  const oldPaymentStatus = paymentStatusCol >= 0 ? "" : "";

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][requestIdCol] || "") !== String(requestId)) continue;

    const beforeStatus = statusCol >= 0 ? values[i][statusCol] : oldStatus;
    const beforePaymentStatus = paymentStatusCol >= 0 ? values[i][paymentStatusCol] : oldPaymentStatus;

    updateCellIfPresent_(sheet, headers, i + 1, "Status", firstNonBlank_(data.Status, data.status, beforeStatus));
    updateCellIfPresent_(sheet, headers, i + 1, "Repair_Status", firstNonBlank_(data.Repair_Status, data.repairStatus));
    updateCellIfPresent_(sheet, headers, i + 1, "Payment_Status", firstNonBlank_(data.Payment_Status, data.paymentStatus, beforePaymentStatus));
    updateCellIfPresent_(sheet, headers, i + 1, "Approval_Status", firstNonBlank_(data.Approval_Status, data.approvalStatus));
    updateCellIfPresent_(sheet, headers, i + 1, "Approved_By", firstNonBlank_(data.Approved_By, data.approvedBy));
    updateCellIfPresent_(sheet, headers, i + 1, "Original_Total_Cost", firstNonBlank_(data.Original_Total_Cost, data.originalTotalCost));
    updateCellIfPresent_(sheet, headers, i + 1, "Final_Cost", firstNonBlank_(data.Final_Cost, data.finalCost));
    updateCellIfPresent_(sheet, headers, i + 1, "Approved_Cost", firstNonBlank_(data.Approved_Cost, data.approvedCost, data.Final_Cost, data.finalCost));
    updateCellIfPresent_(sheet, headers, i + 1, "Payee", firstNonBlank_(data.Payee, data.payee));
    updateCellIfPresent_(sheet, headers, i + 1, "Remarks", firstNonBlank_(data.Remarks, data.remarks));
    updateCellIfPresent_(sheet, headers, i + 1, "Cost_Remarks", firstNonBlank_(data.Cost_Remarks, data.costRemarks));
    updateCellIfPresent_(sheet, headers, i + 1, "Proof_Of_Payment", firstNonBlank_(data.Proof_Of_Payment, data.proofOfPayment));
    updateCellIfPresent_(sheet, headers, i + 1, "Last_Updated", new Date());

    logSheet.appendRow([
      generateLogId(),
      requestId,
      "STATUS_UPDATE",
      beforeStatus,
      firstNonBlank_(data.Status, data.status, beforeStatus),
      beforePaymentStatus,
      firstNonBlank_(data.Payment_Status, data.paymentStatus, beforePaymentStatus),
      data.Updated_By || data.updatedBy || "Web User",
      new Date(),
      data.Remarks || data.remarks || ""
    ]);

    return jsonResponse({
      success: true,
      message: "Status updated successfully."
    });
  }

  return jsonResponse({
    success: false,
    message: "Request_ID not found."
  });
}

function listRepairRecords() {
  try {
    const sheet = ensureRepairSheet_();
    const values = sheet.getDataRange().getValues();

    if (values.length <= 1) {
      return jsonResponse({
        success: true,
        records: []
      });
    }

    const headers = values[0];
    const rows = values.slice(1);
    const records = rows
      .filter(function(row) { return row.some(function(cell) { return cell !== ""; }); })
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, index) {
          obj[header] = row[index] || "";
        });
        return obj;
      });

    return jsonResponse({
      success: true,
      records: records
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      message: err.message,
      records: []
    });
  }
}

function testEnsureRepairTabs() {
  ensureRepairTabs_();
  return {
    success: true,
    message: "Repair tabs ensured. Missing headers were appended only."
  };
}

function ensureRepairTabs_() {
  ensureRepairSheet_();
  ensureStatusLogSheet_();
}

function ensureRepairSheet_() {
  const ss = getRepairSpreadsheet_();
  return ensureSheetHeaders_(ss, SHEET_NAME, REPAIR_REQUEST_HEADERS);
}

function ensureStatusLogSheet_() {
  const ss = getRepairSpreadsheet_();
  return ensureSheetHeaders_(ss, LOG_SHEET_NAME, STATUS_LOG_HEADERS);
}

function ensureSheetHeaders_(ss, sheetName, expectedHeaders) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const lastCol = sheet.getLastColumn();
  if (!lastCol) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return sheet;
  }

  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  const missing = expectedHeaders.filter(function(header) {
    return existing.indexOf(header) === -1;
  });

  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }

  return sheet;
}

function getRepairSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
}

function normalizeRepairRow_(row) {
  const now = new Date();
  const totalCost = firstNonBlank_(row.Total_Cost, row.totalCost, row.Final_Cost, row.finalCost);
  const finalCost = firstNonBlank_(row.Final_Cost, row.finalCost, totalCost);
  const originalTotalCost = firstNonBlank_(row.Original_Total_Cost, row.originalTotalCost, totalCost);

  return {
    Request_ID: firstNonBlank_(row.Request_ID, row.requestId, generateRequestId()),
    Request_Type: firstNonBlank_(row.Request_Type, row.requestType, "Parts Request"),
    Date_Requested: firstNonBlank_(row.Date_Requested, row.dateRequested, row.date, now),
    Date_Finished: firstNonBlank_(row.Date_Finished, row.dateFinished),
    Requested_By: firstNonBlank_(row.Requested_By, row.requestedBy),
    Plate_Number: firstNonBlank_(row.Plate_Number, row.plateNumber),
    Truck_Type: firstNonBlank_(row.Truck_Type, row.truckType),
    Driver: firstNonBlank_(row.Driver, row.driver),
    Helper: firstNonBlank_(row.Helper, row.helper),
    Category: firstNonBlank_(row.Category, row.category),
    Repair_Parts: firstNonBlank_(row.Repair_Parts, row.repairParts, row.item),
    Work_Done: firstNonBlank_(row.Work_Done, row.workDone),
    Quantity: firstNonBlank_(row.Quantity, row.quantity),
    Unit_Cost: firstNonBlank_(row.Unit_Cost, row.unitCost),
    Parts_Cost: firstNonBlank_(row.Parts_Cost, row.partsCost),
    Labor_Cost: firstNonBlank_(row.Labor_Cost, row.laborCost),
    Total_Cost: totalCost,
    Supplier: firstNonBlank_(row.Supplier, row.supplier),
    Supplier_Contact: firstNonBlank_(row.Supplier_Contact, row.supplierContact),
    Payee: firstNonBlank_(row.Payee, row.payee),
    Status: firstNonBlank_(row.Status, row.status, "Draft"),
    Repair_Status: firstNonBlank_(row.Repair_Status, row.repairStatus),
    Payment_Status: firstNonBlank_(row.Payment_Status, row.paymentStatus, "Unpaid"),
    Approved_By: firstNonBlank_(row.Approved_By, row.approvedBy),
    Proof_Of_Payment: firstNonBlank_(row.Proof_Of_Payment, row.proofOfPayment),
    Receipt_Link: firstNonBlank_(row.Receipt_Link, row.receiptLink),
    Photo_Link: firstNonBlank_(row.Photo_Link, row.photoLink),
    Mechanic: firstNonBlank_(row.Mechanic, row.mechanic),
    Remarks: firstNonBlank_(row.Remarks, row.remarks),
    Source_Message: firstNonBlank_(row.Source_Message, row.sourceMessage),
    Created_At: firstNonBlank_(row.Created_At, row.createdAt, now),
    Payment_Message: firstNonBlank_(row.Payment_Message, row.paymentMessage),
    Saved_By: firstNonBlank_(row.Saved_By, row.savedBy),
    Last_Updated: firstNonBlank_(row.Last_Updated, row.lastUpdated, now),
    Odometer: firstNonBlank_(row.Odometer, row.odometer),
    Priority: firstNonBlank_(row.Priority, row.priority),
    Outside_Shop_Cost: firstNonBlank_(row.Outside_Shop_Cost, row.outsideShopCost),
    Towing_Cost: firstNonBlank_(row.Towing_Cost, row.towingCost),
    Other_Cost: firstNonBlank_(row.Other_Cost, row.otherCost),
    Original_Total_Cost: originalTotalCost,
    Final_Cost: finalCost,
    Assigned_To: firstNonBlank_(row.Assigned_To, row.assignedTo, row.mechanic),
    Shop_Name: firstNonBlank_(row.Shop_Name, row.shopName),
    Approval_Status: firstNonBlank_(row.Approval_Status, row.approvalStatus),
    Cost_Remarks: firstNonBlank_(row.Cost_Remarks, row.costRemarks),
    Approved_Cost: firstNonBlank_(row.Approved_Cost, row.approvedCost, finalCost)
  };
}

function updateCellIfPresent_(sheet, headers, rowIndex, header, value) {
  const colIndex = headers.indexOf(header);
  if (colIndex === -1 || value === undefined) return;
  if (typeof value === "string" && value.trim() === "") return;
  sheet.getRange(rowIndex, colIndex + 1).setValue(value);
}

function firstNonBlank_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return "";
}

function generateRequestId() {
  return "RR-" +
    Utilities.formatDate(
      new Date(),
      "Asia/Manila",
      "yyyyMMdd-HHmmss"
    ) +
    "-" +
    Math.floor(Math.random() * 1000);
}

function generateLogId() {
  return "LOG-" +
    Utilities.formatDate(
      new Date(),
      "Asia/Manila",
      "yyyyMMdd-HHmmss"
    ) +
    "-" +
    Math.floor(Math.random() * 1000);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function listGarageTrucks() {
  const dispatchFiles = [
    {
      id: "1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4",
      sheet: "Bottle",
      source: "Bottle"
    },
    {
      id: "1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE",
      sheet: "Sugar",
      source: "Sugar"
    },
    {
      id: "1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw",
      sheet: "CapsCrown",
      source: "CapsCrown"
    },
    {
      id: "1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw",
      sheet: "PreformResin",
      source: "PreformResin"
    }
  ];

  let trucks = [];

  dispatchFiles.forEach(function(file) {
    try {
      const ss = SpreadsheetApp.openById(file.id);
      const sheet = ss.getSheetByName(file.sheet);

      if (!sheet) return;

      const values = sheet.getDataRange().getValues();
      const headers = values[1];

      const plateCol = headers.indexOf("Plate Number");
      const driverCol = headers.indexOf("Driver");
      const helperCol = headers.indexOf("Helper");
      const statusCol = headers.indexOf("Status");
      const remarksCol = headers.indexOf("Remarks");
      const addressCol = headers.indexOf("Full Address");
      const mapCol = headers.indexOf("Map Link");
      const timestampCol = headers.indexOf("Timestamp");

      for (let i = 2; i < values.length; i++) {
        const row = values[i];
        const address = String(row[addressCol] || "");
        let garageLocation = "";

        if (address.toLowerCase().includes("majada")) {
          garageLocation = "Majada Garage";
        }

        if (address.toLowerCase().includes("valenzuela")) {
          garageLocation = "Valenzuela Garage";
        }

        if (!garageLocation) continue;

        trucks.push({
          Plate_Number: row[plateCol] || "",
          Driver: row[driverCol] || "",
          Helper: row[helperCol] || "",
          Status: row[statusCol] || "",
          Remarks: row[remarksCol] || "",
          Full_Address: address,
          Map_Link: row[mapCol] || "",
          Timestamp: row[timestampCol] || "",
          Garage_Location: garageLocation,
          Source: file.source
        });
      }

    } catch (err) {
      Logger.log(err);
    }
  });

  return jsonResponse({
    success: true,
    trucks: trucks
  });
}
