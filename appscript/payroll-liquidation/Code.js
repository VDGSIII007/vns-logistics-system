// ============================================================
// VNS PAYROLL / LIQUIDATION — Google Apps Script
// Sheet: VNS_Payroll_Liquidation_Master
//
// First backend version for cloud saving, review/approval state,
// cash links, plate sheet directory lookup, and guarded posting.
// ============================================================

const SPREADSHEET_ID = "1Xeq7P9eJR8ggwv1rZtpZ1hjWYJ3NLHzS15pRUnYvHoA";
const SYNC_KEY       = "vns-payroll-liquidation-sync-2026-Jay";

const BATCH_HEADERS = [
  "Liquidation_ID","Liquidation_Number","Payroll_Number","Liquidation_Date",
  "Period_Start","Period_End","Year_Tab","Plate_Number","Group_Category",
  "Truck_Type","Driver_Name","Helper_Name","Encoded_By","Reviewed_By",
  "Approved_By","Approval_Status","Workflow_Status","Review_Notes",
  "Return_Reason","Reject_Reason","Submitted_At","Approved_At",
  "Returned_At","Rejected_At","Posted_To_Truck_Sheet","Posted_At",
  "Posted_By","Posted_Row_Count","Posting_Error","Total_Diesel",
  "Total_Driver_Salary","Total_Helper_Salary","Total_Toll","Total_Passway",
  "Total_Parking","Total_Lagay_Loaded","Total_Lagay_Empty","Total_Mano",
  "Total_Vulcanize","Total_Driver_Allowance","Total_Helper_Allowance",
  "Total_Truck_Wash","Total_Checkpoint","Total_Other_Expenses",
  "Total_Budget_Released","Remarks","Created_At","Updated_At",
  "Deleted_At","Deleted_By","Is_Deleted"
];

const TRIP_LINE_HEADERS = [
  "Line_ID","Liquidation_ID","Line_No","Trip_Date","Plate_Number",
  "Group_Category","Driver_Name","Helper_Name","Diesel","Cost_Per_Liter",
  "PO_Number","Source","Destination","Ref","Shipment_Number","Van_Number",
  "Container_Type","Commodity","Driver_Salary","Helper_Salary","Toll",
  "Passway","Parking","Lagay_Loaded","Lagay_Empty","Mano","Vulcanize",
  "Driver_Allowance","Helper_Allowance","Truck_Wash","Checkpoint",
  "Other_Expenses","Budget_Released","Remarks","Cash_Link_IDs",
  "Posted_To_Truck_Sheet","Posted_Row_Number","Posted_At","Posting_Error",
  "Created_At","Updated_At","Deleted_At","Deleted_By","Is_Deleted"
];

const CASH_LINK_HEADERS = [
  "Link_ID","Liquidation_ID","Line_ID","Cash_ID","Cash_Date",
  "Transaction_Type","Plate_Number","Person_Name","Role","PO_Number",
  "Amount","Liters","Review_Status","Match_Method","Match_Notes",
  "Created_At","Updated_At","Deleted_At","Deleted_By","Is_Deleted"
];

const PLATE_DIRECTORY_HEADERS = [
  "Plate_Number","Spreadsheet_ID","Spreadsheet_Name","Sheet_URL",
  "Default_Year_Tab","Active","Group_Category","Truck_Type","Owner_Notes",
  "Last_Posted_At","Last_Posting_Batch_ID","Last_Error","Created_At",
  "Updated_At"
];

const POSTING_LOG_HEADERS = [
  "Posting_ID","Liquidation_ID","Line_ID","Plate_Number","Target_Spreadsheet_ID",
  "Target_Year_Tab","Target_Row","Action","Status","Message","Posted_By",
  "Posted_At","Created_At"
];

const SETTINGS_HEADERS = [
  "Key","Value","Category","Description","Updated_At"
];

const TAB_CONFIGS = [
  { name: "Liquidation_Batches", headers: BATCH_HEADERS },
  { name: "Liquidation_Trip_Lines", headers: TRIP_LINE_HEADERS },
  { name: "Liquidation_Cash_Links", headers: CASH_LINK_HEADERS },
  { name: "Plate_Sheet_Directory", headers: PLATE_DIRECTORY_HEADERS },
  { name: "Posting_Log", headers: POSTING_LOG_HEADERS },
  { name: "Settings", headers: SETTINGS_HEADERS }
];

const VALID_CASH_STATUSES = ["APPROVED", "DEPOSITED", "USED"];
const POSTED_TRUE = "TRUE";

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonResponse_({ ok: true, status: "VNS Payroll/Liquidation API running", ts: new Date().toISOString() });
    }
    if (!validateKey_(e.parameter && e.parameter.syncKey)) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }
    ensureAllTabs_();

    if (action === "ensureTabs") return jsonResponse_(ensureAllTabs_());
    if (action === "listLiquidationBatches") return jsonResponse_({ ok: true, batches: listBatches_(e.parameter || {}) });
    if (action === "getLiquidationBatch") return jsonResponse_(getLiquidationBatch_(e.parameter || {}));
    if (action === "listTripLines") return jsonResponse_({ ok: true, tripLines: listTripLines_(e.parameter || {}) });
    if (action === "listCashLinks") return jsonResponse_({ ok: true, cashLinks: listCashLinks_(e.parameter || {}) });
    if (action === "getPlateSheetDirectory") return jsonResponse_({ ok: true, directory: readRecords_("Plate_Sheet_Directory", PLATE_DIRECTORY_HEADERS, false) });

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

  return jsonResponse_(withLock_(function() {
    ensureAllTabs_();
    switch (body.action) {
      case "saveLiquidationBatch":
        return saveLiquidationBatch_(body.record || body.batch || {});
      case "saveLiquidationTripLines":
        return saveLiquidationTripLines_(body.liquidationId || "", body.records || body.tripLines || []);
      case "linkCashRecords":
        return linkCashRecords_(body.liquidationId || "", body.records || body.cashLinks || []);
      case "submitLiquidationForReview":
        return transitionBatch_(body.liquidationId, {
          Workflow_Status: "For Review",
          Approval_Status: "For Review",
          Submitted_At: new Date().toISOString(),
          Reviewed_By: body.reviewedBy || "",
          Review_Notes: body.reviewNotes || ""
        });
      case "approveLiquidationByMother":
        return transitionBatch_(body.liquidationId, {
          Workflow_Status: "Approved by Mother",
          Approval_Status: "Approved",
          Approved_By: body.approvedBy || "Mother",
          Approved_At: new Date().toISOString(),
          Review_Notes: body.reviewNotes || body.approvalNotes || ""
        });
      case "returnLiquidationForRevision":
        return transitionBatch_(body.liquidationId, {
          Workflow_Status: "Returned",
          Approval_Status: "Returned",
          Returned_At: new Date().toISOString(),
          Return_Reason: body.returnReason || body.reason || "",
          Review_Notes: body.reviewNotes || ""
        });
      case "rejectLiquidation":
        return transitionBatch_(body.liquidationId, {
          Workflow_Status: "Rejected",
          Approval_Status: "Rejected",
          Rejected_At: new Date().toISOString(),
          Reject_Reason: body.rejectReason || body.reason || "",
          Review_Notes: body.reviewNotes || ""
        });
      case "postApprovedLiquidationToPlateSheet":
        return postApprovedLiquidationToPlateSheet_(body.liquidationId, body.postedBy || "");
      default:
        return { ok: false, error: "Unknown action: " + body.action };
    }
  }));
}

// ============================================================
// Actions
// ============================================================
function saveLiquidationBatch_(record) {
  var normalized = normalizeBatch_(record);
  var result = upsertRecord_("Liquidation_Batches", BATCH_HEADERS, "Liquidation_ID", normalized);
  return { ok: true, result: result, batch: normalized };
}

function saveLiquidationTripLines_(liquidationId, records) {
  if (!records || !records.length) return { ok: true, imported: 0, updated: 0, skipped: 0 };
  var normalized = records.map(function(record, index) {
    return normalizeTripLine_(record, liquidationId, index + 1);
  });
  return batchUpsertRecords_("Liquidation_Trip_Lines", TRIP_LINE_HEADERS, "Line_ID", normalized);
}

function linkCashRecords_(liquidationId, records) {
  if (!records || !records.length) return { ok: true, imported: 0, updated: 0, skipped: 0 };
  var normalized = records.map(function(record) {
    return normalizeCashLink_(record, liquidationId);
  }).filter(function(record) {
    return isValidCashStatus_(record.Review_Status);
  });
  return batchUpsertRecords_("Liquidation_Cash_Links", CASH_LINK_HEADERS, "Link_ID", normalized);
}

function transitionBatch_(liquidationId, updates) {
  liquidationId = String(liquidationId || "").trim();
  if (!liquidationId) return { ok: false, error: "Missing liquidationId." };
  var batch = getRecordByKey_("Liquidation_Batches", "Liquidation_ID", liquidationId);
  if (!batch) return { ok: false, error: "Liquidation batch not found: " + liquidationId };
  Object.keys(updates).forEach(function(key) {
    if (updates[key] !== undefined) batch[key] = updates[key];
  });
  batch.Updated_At = new Date().toISOString();
  var result = updateRecord_("Liquidation_Batches", BATCH_HEADERS, "Liquidation_ID", batch);
  return { ok: true, result: result, batch: batch };
}

function postApprovedLiquidationToPlateSheet_(liquidationId, postedBy) {
  liquidationId = String(liquidationId || "").trim();
  if (!liquidationId) return { ok: false, error: "Missing liquidationId." };

  var batch = getRecordByKey_("Liquidation_Batches", "Liquidation_ID", liquidationId);
  if (!batch) return { ok: false, error: "Liquidation batch not found: " + liquidationId };
  if (String(batch.Approval_Status || "").trim().toUpperCase() !== "APPROVED") {
    return { ok: false, error: "Liquidation is not approved." };
  }
  if (isTrue_(batch.Posted_To_Truck_Sheet)) {
    return { ok: false, error: "Liquidation has already been posted to the plate sheet." };
  }

  var plateNumber = normalizePlate_(batch.Plate_Number);
  if (!plateNumber) return { ok: false, error: "Missing Plate_Number on liquidation batch." };

  var directory = findPlateDirectory_(plateNumber);
  if (!directory) return markPostingFailure_(batch, "Plate not found in Plate_Sheet_Directory: " + plateNumber);
  if (!isDirectoryActive_(directory)) return markPostingFailure_(batch, "Plate directory entry is inactive: " + plateNumber);

  var spreadsheetId = String(directory.Spreadsheet_ID || "").trim();
  if (!spreadsheetId) return markPostingFailure_(batch, "Missing Spreadsheet_ID for plate: " + plateNumber);

  var yearTab = String(batch.Year_Tab || directory.Default_Year_Tab || new Date().getFullYear()).trim();
  var lines = listTripLines_({ liquidationId: liquidationId }).filter(function(line) {
    return !isTrue_(line.Is_Deleted) && !isTrue_(line.Posted_To_Truck_Sheet);
  });
  if (!lines.length) return { ok: false, error: "No unposted trip lines found for liquidation: " + liquidationId };

  var targetSpreadsheet;
  var targetSheet;
  try {
    targetSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
    targetSheet = targetSpreadsheet.getSheetByName(yearTab);
  } catch (err) {
    return markPostingFailure_(batch, "Unable to open target spreadsheet: " + err.message);
  }
  if (!targetSheet) return markPostingFailure_(batch, "Target year tab not found: " + yearTab);

  var existingKeys = getPostedKeysFromLog_(liquidationId);
  var rowsToAppend = [];
  var linesToMark = [];
  lines.forEach(function(line) {
    if (existingKeys[line.Line_ID]) return;
    rowsToAppend.push(buildOldPlateSheetRow_(line));
    linesToMark.push(line);
  });

  if (!rowsToAppend.length) {
    batch.Posted_To_Truck_Sheet = POSTED_TRUE;
    batch.Posted_Row_Count = "0";
    batch.Posting_Error = "";
    batch.Posted_At = new Date().toISOString();
    batch.Posted_By = postedBy || "";
    batch.Workflow_Status = "Posted to Plate Sheet";
    updateRecord_("Liquidation_Batches", BATCH_HEADERS, "Liquidation_ID", batch);
    return { ok: true, skipped: true, message: "All lines already had posting log entries." };
  }

  var startRow = targetSheet.getLastRow() + 1;
  targetSheet.getRange(startRow, 1, rowsToAppend.length, 21).setValues(rowsToAppend);

  var now = new Date().toISOString();
  var logRows = [];
  linesToMark.forEach(function(line, index) {
    var targetRow = startRow + index;
    line.Posted_To_Truck_Sheet = POSTED_TRUE;
    line.Posted_Row_Number = String(targetRow);
    line.Posted_At = now;
    line.Posting_Error = "";
    line.Updated_At = now;
    updateRecord_("Liquidation_Trip_Lines", TRIP_LINE_HEADERS, "Line_ID", line);
    logRows.push({
      Posting_ID: createId_("posting"),
      Liquidation_ID: liquidationId,
      Line_ID: line.Line_ID,
      Plate_Number: plateNumber,
      Target_Spreadsheet_ID: spreadsheetId,
      Target_Year_Tab: yearTab,
      Target_Row: String(targetRow),
      Action: "Append Trip Line",
      Status: "Posted",
      Message: "Posted to plate sheet.",
      Posted_By: postedBy || "",
      Posted_At: now,
      Created_At: now
    });
  });
  batchUpsertRecords_("Posting_Log", POSTING_LOG_HEADERS, "Posting_ID", logRows);

  batch.Posted_To_Truck_Sheet = POSTED_TRUE;
  batch.Posted_At = now;
  batch.Posted_By = postedBy || "";
  batch.Posted_Row_Count = String(rowsToAppend.length);
  batch.Posting_Error = "";
  batch.Workflow_Status = "Posted to Plate Sheet";
  batch.Updated_At = now;
  updateRecord_("Liquidation_Batches", BATCH_HEADERS, "Liquidation_ID", batch);
  updatePlateDirectoryAfterPost_(plateNumber, liquidationId, now, "");

  return {
    ok: true,
    liquidationId: liquidationId,
    plateNumber: plateNumber,
    targetSpreadsheetId: spreadsheetId,
    targetYearTab: yearTab,
    postedRowCount: rowsToAppend.length,
    firstTargetRow: startRow
  };
}

// ============================================================
// Normalizers
// ============================================================
function normalizeBatch_(record) {
  var now = new Date().toISOString();
  return copyToHeaders_(BATCH_HEADERS, {
    Liquidation_ID: firstNonBlank_(record.Liquidation_ID, record.liquidationId, createId_("liq")),
    Liquidation_Number: firstNonBlank_(record.Liquidation_Number, record.liquidationNumber, record.payrollNumber),
    Payroll_Number: firstNonBlank_(record.Payroll_Number, record.payrollNumber),
    Liquidation_Date: firstNonBlank_(record.Liquidation_Date, record.liquidationDate, record.payrollDate),
    Period_Start: firstNonBlank_(record.Period_Start, record.periodStart, record.cutoffStart),
    Period_End: firstNonBlank_(record.Period_End, record.periodEnd, record.cutoffEnd),
    Year_Tab: firstNonBlank_(record.Year_Tab, record.yearTab, getYearFromDate_(record.Liquidation_Date || record.liquidationDate || record.payrollDate)),
    Plate_Number: normalizePlate_(firstNonBlank_(record.Plate_Number, record.plateNumber)),
    Group_Category: firstNonBlank_(record.Group_Category, record.groupCategory),
    Truck_Type: firstNonBlank_(record.Truck_Type, record.truckType),
    Driver_Name: firstNonBlank_(record.Driver_Name, record.driverName),
    Helper_Name: firstNonBlank_(record.Helper_Name, record.helperName),
    Encoded_By: firstNonBlank_(record.Encoded_By, record.encodedBy, record.encoderName),
    Reviewed_By: firstNonBlank_(record.Reviewed_By, record.reviewedBy),
    Approved_By: firstNonBlank_(record.Approved_By, record.approvedBy),
    Approval_Status: firstNonBlank_(record.Approval_Status, record.approvalStatus, record.status, "Draft"),
    Workflow_Status: firstNonBlank_(record.Workflow_Status, record.workflowStatus, "Draft"),
    Review_Notes: firstNonBlank_(record.Review_Notes, record.reviewNotes, record.approvalNotes),
    Return_Reason: firstNonBlank_(record.Return_Reason, record.returnReason),
    Reject_Reason: firstNonBlank_(record.Reject_Reason, record.rejectReason),
    Submitted_At: firstNonBlank_(record.Submitted_At, record.submittedAt),
    Approved_At: firstNonBlank_(record.Approved_At, record.approvedAt),
    Returned_At: firstNonBlank_(record.Returned_At, record.returnedAt),
    Rejected_At: firstNonBlank_(record.Rejected_At, record.rejectedAt),
    Posted_To_Truck_Sheet: firstNonBlank_(record.Posted_To_Truck_Sheet, record.postedToTruckSheet, ""),
    Posted_At: firstNonBlank_(record.Posted_At, record.postedAt),
    Posted_By: firstNonBlank_(record.Posted_By, record.postedBy),
    Posted_Row_Count: firstNonBlank_(record.Posted_Row_Count, record.postedRowCount),
    Posting_Error: firstNonBlank_(record.Posting_Error, record.postingError),
    Total_Diesel: firstNonBlank_(record.Total_Diesel, record.totalDiesel),
    Total_Driver_Salary: firstNonBlank_(record.Total_Driver_Salary, record.totalDriverSalary),
    Total_Helper_Salary: firstNonBlank_(record.Total_Helper_Salary, record.totalHelperSalary),
    Total_Toll: firstNonBlank_(record.Total_Toll, record.totalToll),
    Total_Passway: firstNonBlank_(record.Total_Passway, record.totalPassway),
    Total_Parking: firstNonBlank_(record.Total_Parking, record.totalParking),
    Total_Lagay_Loaded: firstNonBlank_(record.Total_Lagay_Loaded, record.totalLagayLoaded),
    Total_Lagay_Empty: firstNonBlank_(record.Total_Lagay_Empty, record.totalLagayEmpty),
    Total_Mano: firstNonBlank_(record.Total_Mano, record.totalMano),
    Total_Vulcanize: firstNonBlank_(record.Total_Vulcanize, record.totalVulcanize),
    Total_Driver_Allowance: firstNonBlank_(record.Total_Driver_Allowance, record.totalDriverAllowance),
    Total_Helper_Allowance: firstNonBlank_(record.Total_Helper_Allowance, record.totalHelperAllowance),
    Total_Truck_Wash: firstNonBlank_(record.Total_Truck_Wash, record.totalTruckWash),
    Total_Checkpoint: firstNonBlank_(record.Total_Checkpoint, record.totalCheckpoint),
    Total_Other_Expenses: firstNonBlank_(record.Total_Other_Expenses, record.totalOtherExpenses),
    Total_Budget_Released: firstNonBlank_(record.Total_Budget_Released, record.totalBudgetReleased),
    Remarks: firstNonBlank_(record.Remarks, record.remarks),
    Created_At: firstNonBlank_(record.Created_At, record.createdAt, now),
    Updated_At: now,
    Deleted_At: firstNonBlank_(record.Deleted_At, record.deletedAt),
    Deleted_By: firstNonBlank_(record.Deleted_By, record.deletedBy),
    Is_Deleted: firstNonBlank_(record.Is_Deleted, record.isDeleted)
  });
}

function normalizeTripLine_(record, fallbackLiquidationId, fallbackLineNo) {
  var now = new Date().toISOString();
  return copyToHeaders_(TRIP_LINE_HEADERS, {
    Line_ID: firstNonBlank_(record.Line_ID, record.lineId, createId_("line")),
    Liquidation_ID: firstNonBlank_(record.Liquidation_ID, record.liquidationId, fallbackLiquidationId),
    Line_No: firstNonBlank_(record.Line_No, record.lineNo, fallbackLineNo),
    Trip_Date: firstNonBlank_(record.Trip_Date, record.tripDate, record.date),
    Plate_Number: normalizePlate_(firstNonBlank_(record.Plate_Number, record.plateNumber)),
    Group_Category: firstNonBlank_(record.Group_Category, record.groupCategory),
    Driver_Name: firstNonBlank_(record.Driver_Name, record.driverName),
    Helper_Name: firstNonBlank_(record.Helper_Name, record.helperName),
    Diesel: firstNonBlank_(record.Diesel, record.diesel),
    Cost_Per_Liter: firstNonBlank_(record.Cost_Per_Liter, record.costPerLiter),
    PO_Number: firstNonBlank_(record.PO_Number, record.poNumber),
    Source: firstNonBlank_(record.Source, record.source),
    Destination: firstNonBlank_(record.Destination, record.destination),
    Ref: firstNonBlank_(record.Ref, record.ref, record.reference, record.shipmentNumber),
    Shipment_Number: firstNonBlank_(record.Shipment_Number, record.shipmentNumber),
    Van_Number: firstNonBlank_(record.Van_Number, record.vanNumber),
    Container_Type: firstNonBlank_(record.Container_Type, record.containerType),
    Commodity: firstNonBlank_(record.Commodity, record.commodity),
    Driver_Salary: firstNonBlank_(record.Driver_Salary, record.driverSalary),
    Helper_Salary: firstNonBlank_(record.Helper_Salary, record.helperSalary),
    Toll: firstNonBlank_(record.Toll, record.toll, record.tollFee),
    Passway: firstNonBlank_(record.Passway, record.passway),
    Parking: firstNonBlank_(record.Parking, record.parking),
    Lagay_Loaded: firstNonBlank_(record.Lagay_Loaded, record.lagayLoaded, record.lagayTao),
    Lagay_Empty: firstNonBlank_(record.Lagay_Empty, record.lagayEmpty, record.lagayPlanta),
    Mano: firstNonBlank_(record.Mano, record.mano),
    Vulcanize: firstNonBlank_(record.Vulcanize, record.vulcanize),
    Driver_Allowance: firstNonBlank_(record.Driver_Allowance, record.driverAllowance),
    Helper_Allowance: firstNonBlank_(record.Helper_Allowance, record.helperAllowance),
    Truck_Wash: firstNonBlank_(record.Truck_Wash, record.truckWash, record.hugasTruck),
    Checkpoint: firstNonBlank_(record.Checkpoint, record.checkpoint),
    Other_Expenses: firstNonBlank_(record.Other_Expenses, record.otherExpenses),
    Budget_Released: firstNonBlank_(record.Budget_Released, record.budgetReleased),
    Remarks: firstNonBlank_(record.Remarks, record.remarks),
    Cash_Link_IDs: firstNonBlank_(record.Cash_Link_IDs, record.cashLinkIds),
    Posted_To_Truck_Sheet: firstNonBlank_(record.Posted_To_Truck_Sheet, record.postedToTruckSheet),
    Posted_Row_Number: firstNonBlank_(record.Posted_Row_Number, record.postedRowNumber),
    Posted_At: firstNonBlank_(record.Posted_At, record.postedAt),
    Posting_Error: firstNonBlank_(record.Posting_Error, record.postingError),
    Created_At: firstNonBlank_(record.Created_At, record.createdAt, now),
    Updated_At: now,
    Deleted_At: firstNonBlank_(record.Deleted_At, record.deletedAt),
    Deleted_By: firstNonBlank_(record.Deleted_By, record.deletedBy),
    Is_Deleted: firstNonBlank_(record.Is_Deleted, record.isDeleted)
  });
}

function normalizeCashLink_(record, fallbackLiquidationId) {
  var now = new Date().toISOString();
  return copyToHeaders_(CASH_LINK_HEADERS, {
    Link_ID: firstNonBlank_(record.Link_ID, record.linkId, createId_("cash_link")),
    Liquidation_ID: firstNonBlank_(record.Liquidation_ID, record.liquidationId, fallbackLiquidationId),
    Line_ID: firstNonBlank_(record.Line_ID, record.lineId),
    Cash_ID: firstNonBlank_(record.Cash_ID, record.cashId, record.id),
    Cash_Date: firstNonBlank_(record.Cash_Date, record.cashDate, record.date),
    Transaction_Type: firstNonBlank_(record.Transaction_Type, record.transactionType, record.type),
    Plate_Number: normalizePlate_(firstNonBlank_(record.Plate_Number, record.plateNumber)),
    Person_Name: firstNonBlank_(record.Person_Name, record.personName),
    Role: firstNonBlank_(record.Role, record.role, record.personType),
    PO_Number: firstNonBlank_(record.PO_Number, record.poNumber),
    Amount: firstNonBlank_(record.Amount, record.amount, record.budgetAmount),
    Liters: firstNonBlank_(record.Liters, record.liters),
    Review_Status: firstNonBlank_(record.Review_Status, record.reviewStatus, record.status),
    Match_Method: firstNonBlank_(record.Match_Method, record.matchMethod),
    Match_Notes: firstNonBlank_(record.Match_Notes, record.matchNotes),
    Created_At: firstNonBlank_(record.Created_At, record.createdAt, now),
    Updated_At: now,
    Deleted_At: firstNonBlank_(record.Deleted_At, record.deletedAt),
    Deleted_By: firstNonBlank_(record.Deleted_By, record.deletedBy),
    Is_Deleted: firstNonBlank_(record.Is_Deleted, record.isDeleted)
  });
}

// ============================================================
// Posting helpers
// ============================================================
function buildOldPlateSheetRow_(line) {
  return [
    line.Trip_Date || "",
    line.Diesel || "",
    line.Cost_Per_Liter || "",
    line.PO_Number || "",
    line.Source || "",
    line.Destination || "",
    line.Ref || line.Shipment_Number || "",
    line.Driver_Salary || "",
    line.Helper_Salary || "",
    line.Toll || "",
    line.Passway || "",
    line.Parking || "",
    line.Lagay_Loaded || "",
    line.Lagay_Empty || "",
    line.Mano || "",
    line.Vulcanize || "",
    line.Driver_Allowance || "",
    line.Helper_Allowance || "",
    line.Truck_Wash || "",
    line.Checkpoint || "",
    line.Other_Expenses || ""
  ];
}

function markPostingFailure_(batch, message) {
  var now = new Date().toISOString();
  batch.Posting_Error = message;
  batch.Updated_At = now;
  updateRecord_("Liquidation_Batches", BATCH_HEADERS, "Liquidation_ID", batch);
  if (batch.Plate_Number) updatePlateDirectoryAfterPost_(batch.Plate_Number, batch.Liquidation_ID, "", message);
  appendPostingLog_({
    Posting_ID: createId_("posting"),
    Liquidation_ID: batch.Liquidation_ID,
    Line_ID: "",
    Plate_Number: batch.Plate_Number || "",
    Target_Spreadsheet_ID: "",
    Target_Year_Tab: batch.Year_Tab || "",
    Target_Row: "",
    Action: "Post Liquidation",
    Status: "Failed",
    Message: message,
    Posted_By: "",
    Posted_At: now,
    Created_At: now
  });
  return { ok: false, error: message };
}

function appendPostingLog_(row) {
  return upsertRecord_("Posting_Log", POSTING_LOG_HEADERS, "Posting_ID", copyToHeaders_(POSTING_LOG_HEADERS, row));
}

function getPostedKeysFromLog_(liquidationId) {
  var rows = readRecords_("Posting_Log", POSTING_LOG_HEADERS, false);
  var keys = {};
  rows.forEach(function(row) {
    if (row.Liquidation_ID === liquidationId && row.Line_ID && String(row.Status || "").toUpperCase() === "POSTED") {
      keys[row.Line_ID] = true;
    }
  });
  return keys;
}

function findPlateDirectory_(plateNumber) {
  var normalized = normalizePlate_(plateNumber);
  return readRecords_("Plate_Sheet_Directory", PLATE_DIRECTORY_HEADERS, false).find(function(row) {
    return normalizePlate_(row.Plate_Number) === normalized;
  }) || null;
}

function isDirectoryActive_(directory) {
  var value = String(directory.Active || "").trim().toUpperCase();
  return value === "" || value === "TRUE" || value === "YES" || value === "ACTIVE";
}

function updatePlateDirectoryAfterPost_(plateNumber, liquidationId, postedAt, error) {
  var directory = findPlateDirectory_(plateNumber);
  if (!directory) return;
  directory.Last_Posted_At = postedAt || directory.Last_Posted_At || "";
  directory.Last_Posting_Batch_ID = liquidationId || directory.Last_Posting_Batch_ID || "";
  directory.Last_Error = error || "";
  directory.Updated_At = new Date().toISOString();
  updateRecord_("Plate_Sheet_Directory", PLATE_DIRECTORY_HEADERS, "Plate_Number", directory);
}

// ============================================================
// Readers
// ============================================================
function listBatches_(params) {
  var rows = readRecords_("Liquidation_Batches", BATCH_HEADERS, params.includeDeleted === "true");
  return rows.filter(function(row) {
    if (params.plateNumber && normalizePlate_(row.Plate_Number) !== normalizePlate_(params.plateNumber)) return false;
    if (params.status && String(row.Approval_Status || "") !== String(params.status)) return false;
    if (params.from && String(row.Liquidation_Date || "") < String(params.from)) return false;
    if (params.to && String(row.Liquidation_Date || "") > String(params.to)) return false;
    return true;
  });
}

function getLiquidationBatch_(params) {
  var liquidationId = String(params.liquidationId || params.Liquidation_ID || "").trim();
  if (!liquidationId) return { ok: false, error: "Missing liquidationId." };
  var batch = getRecordByKey_("Liquidation_Batches", "Liquidation_ID", liquidationId);
  if (!batch) return { ok: false, error: "Liquidation batch not found: " + liquidationId };
  return {
    ok: true,
    batch: batch,
    tripLines: listTripLines_({ liquidationId: liquidationId }),
    cashLinks: listCashLinks_({ liquidationId: liquidationId })
  };
}

function listTripLines_(params) {
  return readRecords_("Liquidation_Trip_Lines", TRIP_LINE_HEADERS, params.includeDeleted === "true").filter(function(row) {
    if (params.liquidationId && row.Liquidation_ID !== params.liquidationId) return false;
    if (params.plateNumber && normalizePlate_(row.Plate_Number) !== normalizePlate_(params.plateNumber)) return false;
    return true;
  });
}

function listCashLinks_(params) {
  return readRecords_("Liquidation_Cash_Links", CASH_LINK_HEADERS, params.includeDeleted === "true").filter(function(row) {
    if (params.liquidationId && row.Liquidation_ID !== params.liquidationId) return false;
    if (params.lineId && row.Line_ID !== params.lineId) return false;
    if (params.plateNumber && normalizePlate_(row.Plate_Number) !== normalizePlate_(params.plateNumber)) return false;
    return true;
  });
}

// ============================================================
// Tab / data helpers
// ============================================================
function ensureAllTabs_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var result = { ok: true };
  TAB_CONFIGS.forEach(function(config) {
    result[config.name] = ensureSheet_(ss, config.name, config.headers);
  });
  return result;
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
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  var missing = headers.filter(function(header) {
    return existing.indexOf(header) === -1;
  });
  if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  return { created: isNew, addedColumns: missing };
}

function readRecords_(sheetName, headers, includeDeleted) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var actual = getHeaders_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, actual.length)
    .getValues()
    .filter(function(row) { return row.some(function(value) { return value !== ""; }); })
    .map(function(row) {
      var obj = {};
      actual.forEach(function(header, index) {
        if (header) obj[header] = cellStr_(row[index]);
      });
      return obj;
    })
    .filter(function(obj) {
      return includeDeleted || String(obj.Is_Deleted || "").toUpperCase() !== "TRUE";
    });
}

function getRecordByKey_(sheetName, keyField, keyValue) {
  keyValue = String(keyValue || "").trim();
  if (!keyValue) return null;
  return readRecords_(sheetName, [], true).find(function(row) {
    return String(row[keyField] || "").trim() === keyValue;
  }) || null;
}

function upsertRecord_(sheetName, headers, keyField, record) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual = getHeaders_(sheet);
  var keyValue = String(record[keyField] || "").trim();
  if (!keyValue) return { skipped: true, reason: "Empty key" };
  var rowIdx = findRowByKey_(sheet, actual, keyField, keyValue);
  record.Updated_At = record.Updated_At || new Date().toISOString();
  var rowValues = actual.map(function(header) {
    return record[header] !== undefined ? String(record[header] || "") : "";
  });
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, actual.length).setValues([rowValues]);
    return { updated: true, key: keyValue };
  }
  record.Created_At = record.Created_At || new Date().toISOString();
  sheet.appendRow(actual.map(function(header) {
    return record[header] !== undefined ? String(record[header] || "") : "";
  }));
  return { created: true, key: keyValue };
}

function batchUpsertRecords_(sheetName, headers, keyField, records) {
  if (!records || !records.length) return { ok: true, imported: 0, updated: 0, skipped: 0 };
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  var actual = getHeaders_(sheet);
  var keyIdx = actual.indexOf(keyField);
  var now = new Date().toISOString();
  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow >= 2 && keyIdx !== -1) {
    sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues().forEach(function(row, index) {
      var key = String(row[0] || "").trim();
      if (key) existingMap[key] = index + 2;
    });
  }

  var imported = 0;
  var updated = 0;
  var skipped = 0;
  var appends = [];
  records.forEach(function(record) {
    var key = String(record[keyField] || "").trim();
    if (!key) { skipped++; return; }
    record.Updated_At = record.Updated_At || now;
    var rowValues = actual.map(function(header) {
      return record[header] !== undefined ? String(record[header] || "") : "";
    });
    if (existingMap[key]) {
      sheet.getRange(existingMap[key], 1, 1, actual.length).setValues([rowValues]);
      updated++;
    } else {
      record.Created_At = record.Created_At || now;
      appends.push(actual.map(function(header) {
        return record[header] !== undefined ? String(record[header] || "") : "";
      }));
      imported++;
    }
  });
  appends.forEach(function(rowValues) {
    sheet.appendRow(rowValues);
  });
  return { ok: true, imported: imported, updated: updated, skipped: skipped };
}

function updateRecord_(sheetName, headers, keyField, record) {
  return upsertRecord_(sheetName, headers, keyField, record);
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

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (!lastCol) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
}

// ============================================================
// Utilities
// ============================================================
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return { ok: false, error: "System busy. Please try again." };
  }
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

function copyToHeaders_(headers, source) {
  var output = {};
  headers.forEach(function(header) {
    output[header] = source[header] !== undefined && source[header] !== null ? source[header] : "";
  });
  return output;
}

function firstNonBlank_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizePlate_(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function getYearFromDate_(value) {
  var text = String(value || "").trim();
  if (/^\d{4}/.test(text)) return text.slice(0, 4);
  return String(new Date().getFullYear());
}

function isValidCashStatus_(status) {
  return VALID_CASH_STATUSES.indexOf(String(status || "").trim().toUpperCase()) !== -1;
}

function isTrue_(value) {
  var text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "YES" || text === "1";
}

function createId_(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function cellStr_(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function validateKey_(key) {
  return key === SYNC_KEY;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
