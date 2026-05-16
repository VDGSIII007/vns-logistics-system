"use strict";

const AC_KEYS = {
  payroll: "vnsPayrollRecords",
  repairFallback: "vnsRepairChangeRequests",
  forRepairTrucks: "vnsForRepairTrucks",
  diesel: "vnsDieselPOEntries",
  budget: "vnsTripBudgets",
  bali: "vnsBaliCashAdvances"
};
const PAYROLL_LIQUIDATION_API_URL = "https://script.google.com/macros/s/AKfycbx2JOUTm1ESJ8Ce6zGu7PzqDLBaPTjNoHeRskU-Akc5JipoUJXXPQ1BibY04paConwM/exec";
const PAYROLL_LIQUIDATION_SYNC_KEY = "vns-payroll-liquidation-sync-2026-Jay";
const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";
const CASH_APPROVAL_API_URL = "https://script.google.com/macros/s/AKfycbyu1N444S_vthjIoxcy081CdDZJuy6EwHt5ktKU42U4qNY_HL4F2HHKEQl6HDSZZItf/exec";
const CASH_APPROVAL_SYNC_KEY = "vns-cash-sync-2026-Jay";

const acState = {
  items: [],
  filtered: [],
  tab: "payroll",
  view: "approval",
  sort: "date-desc",
  search: "",
  activeItem: null,
  selectedRepairIds: new Set(),
  selectedCashIds: new Set(),
  repairRecords: [],
  repairSource: "not loaded",
  cashRecords: [],
  cashSource: "not loaded"
};

function ac$(id) {
  return document.getElementById(id);
}

function canOpenApprovalCenter() {
  return !window.VNSAuth || window.VNSAuth.can("approval:center");
}

function setApprovalAccess() {
  const page = ac$("ac-page-content");
  const banner = ac$("ac-dev-access-banner");
  const allowed = canOpenApprovalCenter();
  if (page) page.hidden = false;
  if (banner) banner.hidden = allowed;
  return true;
}

function acReadJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function acWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    setApprovalMessage("Unable to update local approval status.", "error");
  }
}

function acText(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function acDisplay(value) {
  return acEscape(acText(value, "—"));
}

function acEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function acMoney(value) {
  return "PHP " + (Number(value) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function acNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function acDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return acText(value);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function acBestValue(record, keys, fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
}

function getRepairDateValue(record = {}) {
  return acBestValue(record, ["Date_Requested", "dateRequested", "Request_Date", "requestDate", "Created_At", "createdAt", "timestamp", "Timestamp"]);
}

function acGroup(value) {
  const raw = acText(value, "");
  const lower = raw.toLowerCase();
  if (!raw) return "Other / Needs Update";
  if (lower.includes("bottle")) return "Bottle";
  if (lower.includes("sugar")) return "Sugar";
  if (lower.includes("preform") || lower.includes("resin")) return "Preform / Resin";
  if (lower.includes("cap") || lower.includes("crown")) return "Caps / Crown";
  return raw;
}

function repairTextBlob(record) {
  return [
    record?.Request_Type,
    record?.requestType,
    record?.type,
    record?.category,
    record?.itemType,
    record?.Item_Type,
    record?.workDone,
    record?.Work_Done,
    record?.partsItem,
    record?.Parts_Item,
    record?.Parts_Item_Name,
    record?.Repair_Parts,
    record?.equipmentName,
    record?.toolName,
    record?.Shop_Name,
    record?.Mechanic,
    record?.Supplier,
    record?.remarks,
    record?.Remarks
  ].map(value => String(value || "").toLowerCase()).join(" ");
}

function normalizeRepairRequestCategory(record = {}) {
  const blob = repairTextBlob(record);
  const rawType = acFirst(record, ["Request_Type", "requestType", "type", "category", "itemType", "Item_Type"]).toLowerCase();
  const typeValue = rawType.includes("delete") ? "" : rawType;
  const laborCost = acNumber(record.laborCost || record.Labor_Cost);
  const partsCost = acNumber(record.partsCost || record.Parts_Cost);
  const partsItem = acFirst(record, ["partsItem", "Parts_Item", "Parts_Item_Name", "Repair_Parts", "item", "Item"]);

  if (typeValue.includes("labor") || laborCost > 0) return "Labor Payment Request";
  if (typeValue.includes("parts") || typeValue.includes("part ") || partsCost > 0 || partsItem) return "Repair Parts Request";
  if (/(equipment|tool|jack|battery charger|compressor|welding|safety gear)/.test(typeValue) || /(equipment|tool|jack|battery charger|compressor|welding|safety gear)/.test(blob)) return "Equipment / Tools Request";
  if (/(tire|wheel|rim|vulcanize)/.test(typeValue) || /(tire|wheel|rim|vulcanize)/.test(blob)) return "Tire / Wheel Request";
  return "Other Repair Request";
}

function repairAmount(record = {}) {
  const direct = acNumber(record.totalCost || record.Total_Cost || record.Total_Amount || record.amount || record.Amount || record.finalCost || record.Final_Cost || record.Approved_Cost || record.Original_Total_Cost);
  if (direct) return direct;
  const laborAndParts = acNumber(record.laborCost || record.Labor_Cost) + acNumber(record.partsCost || record.Parts_Cost);
  if (laborAndParts) return laborAndParts;
  return acNumber(record.estimatedCost || record.Estimated_Cost);
}

function friendlyRepairCategory(category) {
  const map = {
    "Labor Payment Request": "Labor Payment",
    "Repair Parts Request": "Parts Request",
    "Equipment / Tools Request": "Equipment / Tools",
    "Tire / Wheel Request": "Tire / Wheel",
    "Other Repair Request": "Other Repair"
  };
  return map[category] || "Other Repair";
}

function repairRequestPrefix(category) {
  const map = {
    "Labor Payment Request": "LAB",
    "Repair Parts Request": "PARTS",
    "Equipment / Tools Request": "EQUIP",
    "Tire / Wheel Request": "TIRE",
    "Other Repair Request": "REPAIR"
  };
  return map[category] || "REPAIR";
}

function isFriendlyRequestNo(value) {
  return /^[A-Z]+[-\s]?\d{2,6}$/i.test(String(value || "").trim());
}

function shortRequestSequence(value) {
  const text = String(value || "").trim();
  const numeric = text.match(/(\d{1,6})(?!.*\d)/);
  if (numeric) return numeric[1].slice(-4).padStart(4, "0");
  const compact = text.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return compact || "0000";
}

function getRepairFriendlyRequestNo(record = {}) {
  const category = normalizeRepairRequestCategory(record);
  const friendly = acBestValue(record, ["Request_No", "Request_Number"]);
  if (friendly && isFriendlyRequestNo(friendly)) return String(friendly).trim().toUpperCase();
  const raw = acBestValue(record, ["Request_ID", "id", "Record_ID", "forRepairId"]);
  return `${repairRequestPrefix(category)}-${shortRequestSequence(raw || friendly)}`;
}

function getItemRequestNo(item = {}) {
  if (item.type === "repair") return getRepairFriendlyRequestNo(item.raw || {});
  if (item.type === "cash") return acText(item.raw?.Request_No || item.raw?.Reference_ID || item.id);
  return acText(item.raw?.Liquidation_Number || item.raw?.payrollNumber || item.raw?.Payroll_Number || item.id);
}

function getItemSystemReference(item = {}) {
  const record = item.raw || {};
  if (item.type === "repair") return acText(record.Request_ID || record.id || record.Record_ID || record.forRepairId || item.id, "");
  return acText(record.id || record.Reference_ID || record.Liquidation_ID || item.id, "");
}

function repairCategoryClass(category) {
  return friendlyRepairCategory(category).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function friendlyApprovalStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["for approval", "pending", "pending owner approval", "submitted", "for review"].includes(normalized)) return "Waiting Approval";
  if (normalized === "returned") return "Needs Revision";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "approved") return "Approved";
  return acText(status, "Waiting Approval");
}

function repairCategoryChip(category) {
  const label = friendlyRepairCategory(category);
  return `<span class="repair-chip repair-chip-${repairCategoryClass(category)}">${acEscape(label)}</span>`;
}

function repairStatusChip(status) {
  const label = friendlyApprovalStatus(status);
  const normalized = label.toLowerCase();
  let cls = "ops-status-waiting";
  if (normalized === "approved") cls = "ops-status-approved";
  else if (normalized === "rejected") cls = "ops-status-rejected";
  else if (normalized === "needs revision") cls = "ops-status-revision";
  return `<span class="ops-status-chip ${cls}">${acEscape(label)}</span>`;
}

function normalizeCashRequestType(record = {}) {
  const explicit = acFirst(record, ["Transaction_Type", "Type", "transactionType", "type"]);
  const blob = [
    explicit,
    record.budgetType,
    record.Budget_Type,
    record.poNumber,
    record.PO_Number,
    record.fuelStation,
    record.Fuel_Station,
    record.Route_Trip,
    record.Route,
    record.reason,
    record.Reason,
    record.description,
    record.Description,
    record.Source_Message,
    record.sourceMessage,
    record.Remarks,
    record.remarks
  ].map(value => String(value || "").toLowerCase()).join(" ");

  if (blob.includes("diesel") || blob.includes("fuel") || record.poNumber || record.PO_Number || record.fuelStation || record.Fuel_Station || record.liters || record.Liters || record.dieselLiters) return "Diesel PO";
  if (blob.includes("trip budget") || blob.includes("budget") || record.Route_Trip || record.budgetAmount || record.Budget_Amount || record.shipmentNumber || record.Shipment_Number) return "Trip Budget";
  if (blob.includes("bali") || blob.includes("bale") || blob.includes("cash advance") || blob.includes("advance") || record.currentBalance || record.Current_Balance || record.Balance_After_Payroll) return "Bali / Cash Advance";
  const role = acFirst(record, ["Role", "personType", "role"]).toLowerCase();
  if (["driver", "helper", "mechanic"].includes(role) && !record.poNumber && !record.PO_Number) {
    return acFirst(record, ["Reason", "reason", "Source_Message", "sourceMessage", "Remarks", "remarks"]) ? "Bali / Cash Advance" : "Other Cash Request";
  }
  return "Other Cash Request";
}

function cashStatusValue(record = {}) {
  return acStatusValue(record, ["Review_Status", "reviewStatus", "Status", "status", "Approval_Status", "approvalStatus"]);
}

function cashPaymentStatusValue(record = {}) {
  return acStatusValue(record, ["Payment_Status", "paymentStatus", "Posted_Status", "postedStatus"]);
}

function cashTypeClass(type) {
  return String(type || "Other Cash Request").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cashTypeChip(type) {
  return `<span class="cash-chip cash-chip-${cashTypeClass(type)}">${acEscape(type || "Other Cash Request")}</span>`;
}

function getCashLoggedBy(record = {}) {
  return acFirst(record, ["loggedBy", "Logged_By", "Encoded_By", "encodedBy"]);
}

function getCashDisplayPerson(record = {}) {
  const type = normalizeCashRequestType(record);
  if (type === "Diesel PO" || type === "Trip Budget") {
    return acText(getCashLoggedBy(record) || [record.driverName || record.Driver_Name, record.helperName || record.Helper_Name].filter(Boolean).join(" / "));
  }
  return acText(record.personName || record.Person_Name || getCashLoggedBy(record) || record.payee || record.Payee || record.driverName || record.receiverName || record.fuelStation);
}

function routeText(record = {}) {
  const route = acFirst(record, ["Route_Trip", "Route", "route"]);
  if (route) return route;
  const source = acFirst(record, ["source", "Source"]);
  const destination = acFirst(record, ["destination", "Destination"]);
  return [source, destination].filter(Boolean).join(" → ");
}

function getCashShortDetails(record = {}) {
  const type = normalizeCashRequestType(record);

  if (type === "Diesel PO") {
    return acText(joinUsefulParts([
      acFirst(record, ["poNumber", "PO_Number"]),
      acFirst(record, ["fuelStation", "Fuel_Station"]),
      acFirst(record, ["liters", "Liters", "dieselLiters"]) ? `${acFirst(record, ["liters", "Liters", "dieselLiters"])} L` : "",
      routeText(record),
      acFirst(record, ["Source_Message", "sourceMessage"])
    ]), "Review details");
  }

  if (type === "Trip Budget") {
    return acText(joinUsefulParts([
      routeText(record),
      acFirst(record, ["shipmentNumber", "Shipment_Number"]),
      acFirst(record, ["budgetType", "Budget_Type"]),
      acFirst(record, ["Source_Message", "sourceMessage"])
    ]), "Review details");
  }

  if (type === "Bali / Cash Advance") {
    return acText(joinUsefulParts([
      acFirst(record, ["Source_Message", "sourceMessage", "remarks", "Remarks", "reason", "Reason", "description", "Description"]),
      acFirst(record, ["currentBalance", "Current_Balance", "Balance_After_Payroll"]) ? `Balance ${acMoney(acFirst(record, ["currentBalance", "Current_Balance", "Balance_After_Payroll"]))}` : "",
      acFirst(record, ["amount", "Amount"]) ? acMoney(acFirst(record, ["amount", "Amount"])) : ""
    ]), "Review details");
  }

  return acText(
    acFirst(record, ["Source_Message", "sourceMessage", "remarks", "Remarks", "Route_Trip", "Route", "route", "Type", "Transaction_Type", "type", "reason", "Reason", "description", "Description"]),
    "Review details"
  );
}

function cashDetailsCell(details) {
  const shortText = truncateDetails(details);
  return `<span class="repair-details-text" title="${acEscape(details)}">${acEscape(shortText)}</span>`;
}

function joinUsefulParts(parts) {
  return parts
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" — ");
}

function truncateDetails(value, maxLength = 80) {
  const text = acText(value, "Review details");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function getRepairShortDetails(record = {}) {
  const category = normalizeRepairRequestCategory(record);

  if (category === "Labor Payment Request") {
    return acText(
      acFirst(record, ["workDone", "Work_Done", "description", "Description", "remarks", "Remarks"]),
      "Review details"
    );
  }

  if (category === "Repair Parts Request") {
    return acText(joinUsefulParts([
      acFirst(record, ["partsItem", "Parts_Item", "Parts_Item_Name", "Repair_Parts", "item", "Item"]),
      acFirst(record, ["brand", "Brand", "specification", "Specification"]),
      acFirst(record, ["quantity", "Quantity"]) ? `Qty ${acFirst(record, ["quantity", "Quantity"])}` : "",
      acFirst(record, ["supplierName", "Supplier", "shopName", "Shop", "Shop_Name"])
    ]), "Review details");
  }

  if (category === "Equipment / Tools Request") {
    return acText(joinUsefulParts([
      acFirst(record, ["equipmentName", "toolName", "Tool_Name", "Parts_Item_Name", "Repair_Parts", "item", "Item"]),
      acFirst(record, ["purpose", "Purpose", "description", "Description", "Work_Done"])
    ]), "Review details");
  }

  if (category === "Tire / Wheel Request") {
    return acText(joinUsefulParts([
      acFirst(record, ["partsItem", "Parts_Item", "Parts_Item_Name", "Repair_Parts", "tireItem", "Tire_Item", "wheelItem", "Wheel_Item"]),
      acFirst(record, ["tirePosition", "Tire_Position", "position", "Position"]),
      acFirst(record, ["quantity", "Quantity"]) ? `Qty ${acFirst(record, ["quantity", "Quantity"])}` : "",
      acFirst(record, ["remarks", "Remarks"])
    ]), "Review details");
  }

  return acText(
    acFirst(record, ["description", "Description", "requestDescription", "Request_Description", "workDone", "Work_Done", "Repair_Issue", "remarks", "Remarks"]),
    "Review details"
  );
}

function repairDetailsCell(details) {
  const shortText = truncateDetails(details);
  return `<span class="repair-details-text" title="${acEscape(details)}">${acEscape(shortText)}</span>`;
}

function acStatusValue(record, keys) {
  for (const key of keys) {
    const value = String(record?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function acFirst(record, keys, fallback = "") {
  const value = acStatusValue(record, keys);
  return value || fallback;
}

function acIsStatus(record, keys, allowed) {
  const value = acStatusValue(record, keys).toLowerCase();
  return allowed.some(item => value === item || value.includes(item));
}

function normalizeRepairListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function readRealLocalRepairRecords() {
  return acReadJson(AC_KEYS.forRepairTrucks)
    .filter(record => record && !record.isDeleted)
    .map(record => ({
      ...record,
      Request_Type: record.Request_Type || record.requestType || "Other Repair Request",
      Request_ID: record.Request_ID || record.forRepairId,
      Date_Requested: record.Date_Requested || record.startDate || record.createdAt,
      Requested_By: record.Requested_By || "Repair Module",
      Group_Category: record.Group_Category || record.groupCategory,
      Plate_Number: record.Plate_Number || record.plateNumber,
      Work_Done: record.Work_Done || record.repairIssue,
      Repair_Status: record.Repair_Status || record.repairStatus,
      Remarks: record.Remarks || record.remarks,
      __approvalCenterSource: AC_KEYS.forRepairTrucks
    }));
}

function readFallbackRepairRecords() {
  return acReadJson(AC_KEYS.repairFallback).map(record => ({
    ...record,
    __approvalCenterSource: AC_KEYS.repairFallback
  }));
}

async function loadRepairRecordsForApproval() {
  try {
    const response = await fetch(`${REPAIR_WEB_APP_URL}?action=list`);
    if (!response.ok) throw new Error(`Repair list failed: ${response.status}`);
    const records = normalizeRepairListResponse(await response.json()).map(record => ({
      ...record,
      __approvalCenterSource: "repair-cloud-list"
    }));
    acState.repairSource = "Repair cloud list action";
    return records;
  } catch (error) {
    console.warn("Approval Center repair cloud list unavailable; using local fallback.", error);
  }

  const localRecords = readRealLocalRepairRecords();
  if (localRecords.length) {
    acState.repairSource = AC_KEYS.forRepairTrucks;
    return localRecords;
  }

  acState.repairSource = AC_KEYS.repairFallback;
  return readFallbackRepairRecords();
}

function normalizeCashListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

function normalizeCashBackendRecord(record = {}, index = 0, source = "cash-cloud-list") {
  const cashId = acFirst(record, ["Record_ID", "Cash_ID", "id", "recordId", "cashId"], `CASH-${index + 1}`);
  const transactionType = acFirst(record, ["Transaction_Type", "Type", "transactionType", "type"]);
  const date = acFirst(record, ["Date", "Message_Date", "Created_At", "createdAt"]);
  const amount = acFirst(record, ["Amount", "amount", "Diesel_Amount", "dieselAmount", "Budget_Amount", "budgetAmount"]);
  const loggedBy = acFirst(record, ["Logged_By", "loggedBy", "Encoded_By", "encodedBy"]);
  const personName = acFirst(record, ["Person_Name", "personName"]);
  const role = acFirst(record, ["Role", "personType", "role"]);

  return {
    ...record,
    id: cashId,
    cashId,
    recordId: cashId,
    type: transactionType,
    transactionType,
    date,
    plateNumber: acFirst(record, ["Plate_Number", "plateNumber"]),
    groupCategory: acFirst(record, ["Group_Category", "Truck_Group", "groupCategory"]),
    loggedBy,
    personName,
    personType: role,
    role,
    amount: acNumber(amount),
    poNumber: acFirst(record, ["PO_Number", "poNumber"]),
    liters: acFirst(record, ["Liters", "dieselLiters"]),
    fuelStation: acFirst(record, ["Fuel_Station", "fuelStation"]),
    route: acFirst(record, ["Route_Trip", "Route", "route"]),
    source: acFirst(record, ["Source", "source"]),
    destination: acFirst(record, ["Destination", "destination"]),
    shipmentNumber: acFirst(record, ["Shipment_Number", "shipmentNumber"]),
    budgetType: acFirst(record, ["Budget_Type", "budgetType"]),
    budgetAmount: acNumber(acFirst(record, ["Budget_Amount", "budgetAmount", "Amount", "amount"])),
    currentBalance: acFirst(record, ["Balance_After_Payroll", "currentBalance"]),
    reason: acFirst(record, ["Source_Message", "sourceMessage", "Reason", "reason", "Remarks", "remarks"]),
    remarks: acFirst(record, ["Source_Message", "sourceMessage", "Remarks", "remarks"]),
    reviewStatus: cashStatusValue(record),
    paymentStatus: cashPaymentStatusValue(record),
    __approvalCenterSource: source
  };
}

function readLocalCashRecords() {
  return [
    ...acReadJson(AC_KEYS.bali),
    ...acReadJson(AC_KEYS.budget),
    ...acReadJson(AC_KEYS.diesel)
  ].map((record, index) => normalizeCashBackendRecord(record, index, "local-storage-fallback"));
}

async function loadCashRecordsForApproval() {
  try {
    const params = new URLSearchParams({
      action: "listEntries",
      syncKey: CASH_APPROVAL_SYNC_KEY
    });
    const response = await fetch(`${CASH_APPROVAL_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Cash list failed: ${response.status}`);
    const data = await response.json();
    if (data && data.ok === false) throw new Error(data.error || "Cash list returned an error.");
    const records = normalizeCashListResponse(data)
      .filter(record => record && typeof record === "object")
      .map((record, index) => normalizeCashBackendRecord(record, index, "cash-cloud-list"));
    if (records.length) {
      acState.cashSource = "Cash cloud listEntries";
      return records;
    }
  } catch (error) {
    console.warn("Approval Center cash cloud list unavailable; using local fallback.", error);
  }

  acState.cashSource = "localStorage fallback";
  return readLocalCashRecords();
}

function repairStatusValues(record) {
  return ["Approval_Status", "approvalStatus", "Status", "status", "Repair_Status", "repairStatus", "Payment_Status", "paymentStatus"]
    .map(key => acStatusValue(record, [key]).toLowerCase())
    .filter(Boolean);
}

function repairApprovalStatusValue(record) {
  return acStatusValue(record, ["Approval_Status", "approvalStatus", "Status", "status", "Repair_Status", "repairStatus", "Payment_Status", "paymentStatus"]);
}

function isRepairExcludedStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "paid") return true;
  return ["approved", "completed", "done", "rejected", "returned", "deleted", "cancelled", "canceled"].some(status => normalized === status || normalized.includes(status));
}

function repairNeedsApproval(record) {
  if (!record || record.isDeleted || String(record.Is_Deleted || "").toUpperCase() === "TRUE") return false;
  if (repairStatusValues(record).some(isRepairExcludedStatus)) return false;
  const approvalCandidates = ["Approval_Status", "approvalStatus", "Status", "status", "Repair_Status", "repairStatus"]
    .map(key => acStatusValue(record, [key]).toLowerCase())
    .filter(Boolean);
  return approvalCandidates.some(value =>
    ["for approval", "pending", "pending owner approval", "submitted", "for review"].some(status => value === status || value.includes(status))
  );
}

function recordStatusValues(record, keys) {
  return keys.map(key => acStatusValue(record, [key]).toLowerCase()).filter(Boolean);
}

function isDeletedOrCancelled(record) {
  if (record?.isDeleted || String(record?.Is_Deleted || "").toUpperCase() === "TRUE") return true;
  return recordStatusValues(record, ["status", "Status", "Review_Status", "reviewStatus", "Approval_Status", "approvalStatus", "Repair_Status", "repairStatus", "Payment_Status", "paymentStatus"])
    .some(value => ["deleted", "cancelled", "canceled"].some(status => value === status || value.includes(status)));
}

function historyStatusValues(type, record) {
  if (type === "repair") return repairStatusValues(record);
  if (type === "cash") return recordStatusValues(record, ["Review_Status", "reviewStatus", "Status", "status", "Approval_Status", "approvalStatus", "Payment_Status", "paymentStatus", "Posted_Status", "postedStatus"]);
  return recordStatusValues(record, ["status", "Status", "Approval_Status", "approvalStatus", "Workflow_Status", "workflowStatus", "Payment_Status", "paymentStatus"]);
}

function isHistoryStatus(type, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  const map = {
    repair: ["approved", "returned", "rejected", "paid", "completed", "done"],
    cash: ["approved", "returned", "rejected", "deposited", "used", "paid"],
    payroll: ["approved", "returned", "rejected", "paid", "posted"]
  };
  return (map[type] || []).some(status => normalized === status || normalized.includes(status));
}

function isApprovalHistory(type, record) {
  if (!record || isDeletedOrCancelled(record) || needsApproval(type, record)) return false;
  return historyStatusValues(type, record).some(value => isHistoryStatus(type, value));
}

function needsApproval(type, record) {
  if (type === "repair") return repairNeedsApproval(record);
  if (type === "cash") {
    if (record?.isDeleted || String(record?.Is_Deleted || "").toUpperCase() === "TRUE") return false;
    const status = cashStatusValue(record).toLowerCase();
    if (!status || ["draft", "approved", "paid", "deposited", "used", "rejected", "returned", "deleted", "cancelled", "canceled"].includes(status)) return false;
    return ["for approval", "pending", "pending approval", "submitted", "for review"].some(item => status === item || status.includes(item));
  }
  const status = acStatusValue(record, ["status", "Status", "Workflow_Status", "workflowStatus"]).toLowerCase();
  if (record.isDeleted) return false;
  if (["approved", "paid", "posted", "completed", "deposited", "used", "rejected", "returned", "deleted"].includes(status)) return false;
  if (type === "payroll") {
    return acIsStatus(record, ["status", "Status", "Approval_Status", "Workflow_Status", "approvalStatus", "workflowStatus"], ["submitted", "for review"]);
  }
  return false;
}

function makeApprovalItem(type, module, record, fallbackId) {
  const base = {
    type,
    module,
    raw: record,
    id: acText(record.id || record.Record_ID || record.Cash_ID || record.cashId || record.recordId || record.Request_ID || record.For_Repair_ID || record.forRepairId || record.Liquidation_ID || record.referenceId || record.Reference_ID || record.poNumber || record.PO_Number || fallbackId),
    plate: acText(record.plateNumber || record.Plate_Number || record.plate || record.truckPlate, "No Plate"),
    group: acGroup(record.groupCategory || record.Group_Category || record.Truck_Group || record.plateGroup || record.group),
    status: acText(acStatusValue(record, ["approvalStatus", "Approval_Status", "Workflow_Status", "Review_Status", "status", "Status", "Payment_Status", "paymentStatus"]), "Pending Approval"),
    isPending: needsApproval(type, record),
    isHistory: isApprovalHistory(type, record)
  };

  if (type === "payroll") {
    const item = {
      ...base,
      payee: acText([record.driverName || record.Driver_Name, record.helperName || record.Helper_Name].filter(Boolean).join(" / ")),
      date: record.payrollDate || record.Liquidation_Date || record.date || record.cutoffEnd || record.Period_End || record.createdAt,
      amount: acNumber(record.driverNetPay || record.Driver_Net_Pay || record.totals?.driverNetPay) +
        acNumber(record.helperNetPay || record.Helper_Net_Pay || record.totals?.helperNetPay)
    };
    return {
      ...item,
      requestNo: getItemRequestNo(item),
      systemReference: getItemSystemReference(item)
    };
  }

  if (type === "repair") {
    const requestCategory = normalizeRepairRequestCategory(record);
    const shortDetails = getRepairShortDetails(record);
    const item = {
      ...base,
      status: acText(repairApprovalStatusValue(record), "Pending"),
      requestCategory,
      shortDetails,
      payee: acText(record.Requested_By || record.requestedBy || record.payee || record.Payee || record.Mechanic || record.mechanic || record.Supplier || record.shopName || record.Shop_Name || record.supplierName),
      date: getRepairDateValue(record) || record.date,
      amount: repairAmount(record)
    };
    return {
      ...item,
      requestNo: getRepairFriendlyRequestNo(record),
      systemReference: getItemSystemReference(item)
    };
  }

  const item = {
    ...base,
    cashType: normalizeCashRequestType(record),
    shortDetails: getCashShortDetails(record),
    status: acText(cashStatusValue(record), "Pending Approval"),
    payee: getCashDisplayPerson(record),
    date: record.date || record.Date || record.Message_Date || record.createdAt || record.Created_At || record.timestamp,
    amount: acNumber(record.amount || record.Amount || record.Diesel_Amount || record.dieselAmount || record.budgetAmount || record.Budget_Amount || record.totalAmount)
  };
  return {
    ...item,
    requestNo: getItemRequestNo(item),
    systemReference: getItemSystemReference(item)
  };
}

function loadApprovalItems(repairRecords = acState.repairRecords, cashRecords = acState.cashRecords) {
  const payroll = acReadJson(AC_KEYS.payroll)
    .filter(record => record && !isDeletedOrCancelled(record))
    .map((record, index) => makeApprovalItem("payroll", "Payroll", record, `PAY-${index + 1}`));

  const cash = cashRecords
    .filter(record => record && !isDeletedOrCancelled(record))
    .map((record, index) => makeApprovalItem("cash", "Cash / PO / Bali", record, `CASH-${index + 1}`));

  const repair = repairRecords
    .filter(record => record && !isDeletedOrCancelled(record))
    .map((record, index) => makeApprovalItem("repair", "Repair / Labor", record, `REP-${index + 1}`));

  acState.items = [...payroll, ...cash, ...repair];
}

async function refreshApprovalItems(message = "") {
  const previousRepairRecords = acState.repairRecords;
  const previousCashRecords = acState.cashRecords;
  try {
    const [repairRecords, cashRecords] = await Promise.all([
      loadRepairRecordsForApproval(),
      loadCashRecordsForApproval()
    ]);
    acState.repairRecords = repairRecords;
    acState.cashRecords = cashRecords;
  } catch (error) {
    console.warn("Unable to refresh approval records.", error);
    acState.repairRecords = previousRepairRecords;
    acState.cashRecords = previousCashRecords;
  }
  loadApprovalItems(acState.repairRecords, acState.cashRecords);
  applyApprovalFilters();
  if (message) setApprovalMessage(message, "success");
}

function applyApprovalFilters() {
  const query = acState.search.trim().toLowerCase();
  let list = acState.items.filter(item => item.type === acState.tab && (acState.view === "history" ? item.isHistory : item.isPending));

  if (query) {
    list = list.filter(item => [item.module, item.id, item.systemReference, item.requestNo, acDate(item.date), item.plate, item.group, item.requestCategory, friendlyRepairCategory(item.requestCategory), item.cashType, item.shortDetails, item.payee, item.status, finalStatusLabel(item), friendlyApprovalStatus(item.status), item.amount]
      .join(" ")
      .toLowerCase()
      .includes(query));
  }

  list.sort((a, b) => {
    if (acState.sort === "date-asc") return new Date(a.date || 0) - new Date(b.date || 0);
    if (acState.sort === "amount-desc") return b.amount - a.amount;
    if (acState.sort === "amount-asc") return a.amount - b.amount;
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  acState.filtered = list;
  renderApproval();
}

function acCount(type) {
  return acState.items.filter(item => item.type === type && item.isPending).length;
}

function renderApprovalSummary() {
  const summary = ac$("ac-summary");
  if (!summary) return;
  const cards = [
    ["Pending Payroll", acCount("payroll"), "Payroll records"],
    ["Pending Cash / PO / Bali", acCount("cash"), "Cash module records"],
    ["Pending Repair / Labor", acCount("repair"), "Repair and labor records"]
  ];

  summary.innerHTML = cards.map((card, index) => `
    <article class="ops-summary-card${index === 0 ? " accent" : ""}">
      <span>${acEscape(card[0])}</span>
      <strong>${acEscape(card[1])}</strong>
      <small>${acEscape(card[2])}</small>
    </article>
  `).join("");
}

function renderApprovalHeaders() {
  const headRow = document.querySelector(".ops-table thead tr");
  if (!headRow) return;
  let headers = ["Module", "Reference ID", "Date", "Plate / No Plate", "Group", "Payee / Driver / Person", "Amount", "Approval Status", "Actions"];
  if (acState.view === "history") headers = ["Date", "Request No.", "Plate", "Request", "Details", "Requested By", "Amount", "Final Status", "View"];
  else if (acState.tab === "repair") headers = ["Select", "Date", "Request No.", "Plate", "Request", "Details", "Requested By", "Amount", "Status", "View"];
  else if (acState.tab === "cash") headers = ["Select", "Date", "Type", "Details", "Plate / No Plate", "Person / Logged By", "Amount", "Status", "View"];
  headRow.innerHTML = headers.map((label, index) => {
    if (acState.view !== "history" && acState.tab === "repair" && index === 0) {
      return '<th><input id="ac-repair-select-all" class="repair-select-checkbox" type="checkbox" aria-label="Select all visible repair requests"></th>';
    }
    if (acState.view !== "history" && acState.tab === "cash" && index === 0) {
      return '<th><input id="ac-cash-select-all" class="repair-select-checkbox" type="checkbox" aria-label="Select all visible cash requests"></th>';
    }
    return `<th>${acEscape(label)}</th>`;
  }).join("");
  bindRepairSelectAll();
  bindCashSelectAll();
  updateRepairBatchUi();
}

function approvalActions(index) {
  return `
    <div class="ops-actions">
      <button type="button" class="ops-secondary-btn" data-detail="${index}">View Details</button>
    </div>
  `;
}

function approvalRow(item, index) {
  if (acState.view === "history") return approvalHistoryRow(item, index);
  if (item.type === "repair") return repairApprovalRow(item, index);
  if (item.type === "cash") return cashApprovalRow(item, index);
  return `
    <tr>
      <td><span class="ops-pill">${acEscape(item.module)}</span></td>
      <td class="ops-mono">${acEscape(item.id)}</td>
      <td>${acEscape(acDate(item.date))}</td>
      <td>${acEscape(item.plate)}</td>
      <td>${acEscape(item.group)}</td>
      <td>${acEscape(item.payee)}</td>
      <td class="ops-amount">${acEscape(acMoney(item.amount))}</td>
      <td>${acEscape(item.status)}</td>
      <td>${approvalActions(index)}</td>
    </tr>
  `;
}

function requestLabel(item) {
  if (item.type === "repair") return repairCategoryChip(item.requestCategory);
  if (item.type === "cash") return cashTypeChip(item.cashType);
  return `<span class="ops-pill">${acEscape(item.module)}</span>`;
}

function finalStatusLabel(item) {
  const payment = acStatusValue(item.raw || {}, ["Payment_Status", "paymentStatus"]);
  if (/^(paid|deposited|used)$/i.test(payment)) return payment;
  return item.status;
}

function approvalHistoryRow(item, index) {
  return `
    <tr>
      <td>${acEscape(acDate(item.date))}</td>
      <td class="ops-request-no">${acEscape(item.requestNo || item.id)}</td>
      <td>${acEscape(item.plate)}</td>
      <td>${requestLabel(item)}</td>
      <td>${repairDetailsCell(item.shortDetails || item.module)}</td>
      <td>${acEscape(item.payee)}</td>
      <td class="ops-amount">${acEscape(acMoney(item.amount))}</td>
      <td>${repairStatusChip(finalStatusLabel(item))}</td>
      <td>${approvalActions(index)}</td>
    </tr>
  `;
}

function cashApprovalRow(item, index) {
  const checked = acState.selectedCashIds?.has(item.id) ? " checked" : "";
  return `
    <tr>
      <td><input class="cash-row-checkbox repair-select-checkbox" type="checkbox" data-cash-id="${acEscape(item.id)}" aria-label="Select cash request"${checked}></td>
      <td>${acEscape(acDate(item.date))}</td>
      <td>${cashTypeChip(item.cashType)}</td>
      <td>${cashDetailsCell(item.shortDetails)}</td>
      <td>${acEscape(item.plate)}</td>
      <td>${acEscape(item.payee)}</td>
      <td class="ops-amount">${acEscape(acMoney(item.amount))}</td>
      <td>${repairStatusChip(item.status)}</td>
      <td>${approvalActions(index)}</td>
    </tr>
  `;
}

function repairApprovalRow(item, index) {
  const checked = acState.selectedRepairIds.has(item.id) ? " checked" : "";
  return `
    <tr>
      <td><input class="repair-row-checkbox repair-select-checkbox" type="checkbox" data-repair-id="${acEscape(item.id)}" aria-label="Select repair request"${checked}></td>
      <td>${acEscape(acDate(item.date))}</td>
      <td class="ops-request-no">${acEscape(item.requestNo || item.id)}</td>
      <td>${acEscape(item.plate)}</td>
      <td>${repairCategoryChip(item.requestCategory)}</td>
      <td>${repairDetailsCell(item.shortDetails)}</td>
      <td>${acEscape(item.payee)}</td>
      <td class="ops-amount">${acEscape(acMoney(item.amount))}</td>
      <td>${repairStatusChip(item.status)}</td>
      <td>${approvalActions(index)}</td>
    </tr>
  `;
}

function bindRepairSelectAll() {
  const selectAll = ac$("ac-repair-select-all");
  if (!selectAll) return;
  const visibleRepairIds = acState.filtered.filter(item => item.type === "repair").map(item => item.id);
  selectAll.checked = visibleRepairIds.length > 0 && visibleRepairIds.every(id => acState.selectedRepairIds.has(id));
  selectAll.indeterminate = visibleRepairIds.some(id => acState.selectedRepairIds.has(id)) && !selectAll.checked;
  selectAll.addEventListener("change", () => {
    visibleRepairIds.forEach(id => {
      if (selectAll.checked) acState.selectedRepairIds.add(id);
      else acState.selectedRepairIds.delete(id);
    });
    renderApprovalList();
    bindRepairSelectAll();
    updateRepairBatchUi();
  });
}

function bindRepairRowSelection() {
  document.querySelectorAll(".repair-row-checkbox").forEach(input => {
    input.addEventListener("change", () => {
      const id = input.dataset.repairId;
      if (!id) return;
      if (input.checked) acState.selectedRepairIds.add(id);
      else acState.selectedRepairIds.delete(id);
      bindRepairSelectAll();
      updateRepairBatchUi();
    });
  });
}

function bindCashSelectAll() {
  const selectAll = ac$("ac-cash-select-all");
  if (!selectAll) return;
  const visibleCashIds = acState.filtered.filter(item => item.type === "cash").map(item => item.id);
  selectAll.checked = visibleCashIds.length > 0 && visibleCashIds.every(id => acState.selectedCashIds.has(id));
  selectAll.indeterminate = visibleCashIds.some(id => acState.selectedCashIds.has(id)) && !selectAll.checked;
  selectAll.addEventListener("change", () => {
    visibleCashIds.forEach(id => {
      if (selectAll.checked) acState.selectedCashIds.add(id);
      else acState.selectedCashIds.delete(id);
    });
    renderApprovalList();
    bindCashSelectAll();
    updateRepairBatchUi();
  });
}

function bindCashRowSelection() {
  document.querySelectorAll(".cash-row-checkbox").forEach(input => {
    input.addEventListener("change", () => {
      const id = input.dataset.cashId;
      if (!id) return;
      if (input.checked) acState.selectedCashIds.add(id);
      else acState.selectedCashIds.delete(id);
      bindCashSelectAll();
      updateRepairBatchUi();
    });
  });
}

function updateRepairBatchUi() {
  const button = ac$("ac-approve-selected");
  const note = ac$("ac-preview-note");
  if (button) {
    button.hidden = acState.view === "history" || (acState.tab !== "repair" && acState.tab !== "cash");
    button.disabled = true;
    button.title = acState.tab === "cash"
      ? "Batch approval will be enabled after cash approval actions are connected."
      : "Batch approval will be enabled after repair backend approval actions are connected.";
    const selectedCount = acState.tab === "cash" ? acState.selectedCashIds.size : acState.selectedRepairIds.size;
    button.textContent = selectedCount ? `Approve Selected (${selectedCount})` : "Approve Selected";
  }
  if (note) {
    if (acState.view === "history") note.textContent = "Approval History is read-only.";
    else if (acState.tab === "repair") note.textContent = "Preview mode: repair approval buttons are temporarily disabled.";
    else if (acState.tab === "cash") note.textContent = "Preview mode: cash approval buttons are temporarily disabled.";
    else note.textContent = "Preview mode: central approval actions are disabled until backend role checks are connected.";
  }
  const tableNote = ac$("ac-table-note");
  if (tableNote) {
    if (acState.tab === "repair" && acState.view === "approval") {
      tableNote.textContent = "Showing only repair/labor requests waiting for approval. Approved, paid, completed, rejected, returned, and deleted records are hidden here.";
    } else if (acState.tab === "cash" && acState.view === "approval") {
      tableNote.textContent = acState.cashSource === "Cash cloud listEntries"
        ? "Showing Cash / PO / Bali requests waiting for approval from the Cash backend."
        : "Showing Cash / PO / Bali requests waiting for approval from local fallback data.";
    } else if (acState.view === "history") {
      tableNote.textContent = "Approval History shows records that are no longer waiting for approval. Deleted and cancelled records are not shown.";
    } else {
      tableNote.textContent = "";
    }
  }
}

function approvalCard(item, index) {
  if (acState.view === "history") return approvalHistoryCard(item, index);
  if (item.type === "repair") return repairApprovalCard(item, index);
  if (item.type === "cash") return cashApprovalCard(item, index);
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        <span class="ops-pill">${acEscape(item.module)}</span>
        <strong>${acEscape(acMoney(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Request No.</dt><dd>${acEscape(item.requestNo || item.id)}</dd></div>
        <div><dt>Date</dt><dd>${acEscape(acDate(item.date))}</dd></div>
        <div><dt>Plate / No Plate</dt><dd>${acEscape(item.plate)}</dd></div>
        <div><dt>Group</dt><dd>${acEscape(item.group)}</dd></div>
        <div><dt>Payee / Driver / Person</dt><dd>${acEscape(item.payee)}</dd></div>
        <div><dt>Approval Status</dt><dd>${acEscape(item.status)}</dd></div>
      </dl>
      ${approvalActions(index)}
    </article>
  `;
}

function approvalHistoryCard(item, index) {
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        ${requestLabel(item)}
        <strong>${acEscape(acMoney(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Date</dt><dd>${acEscape(acDate(item.date))}</dd></div>
        <div><dt>Request No.</dt><dd>${acEscape(item.requestNo || item.id)}</dd></div>
        <div><dt>Plate</dt><dd>${acEscape(item.plate)}</dd></div>
        <div><dt>Details</dt><dd>${acEscape(item.shortDetails || item.module)}</dd></div>
        <div><dt>Requested By</dt><dd>${acEscape(item.payee)}</dd></div>
        <div><dt>Final Status</dt><dd>${acEscape(friendlyApprovalStatus(finalStatusLabel(item)))}</dd></div>
      </dl>
      ${approvalActions(index)}
    </article>
  `;
}

function cashApprovalCard(item, index) {
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        ${cashTypeChip(item.cashType)}
        <strong>${acEscape(acMoney(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Date</dt><dd>${acEscape(acDate(item.date))}</dd></div>
        <div><dt>Details</dt><dd>${acEscape(item.shortDetails || "Review details")}</dd></div>
        <div><dt>Plate / No Plate</dt><dd>${acEscape(item.plate)}</dd></div>
        <div><dt>Person</dt><dd>${acEscape(item.payee)}</dd></div>
        <div><dt>Status</dt><dd>${acEscape(friendlyApprovalStatus(item.status))}</dd></div>
      </dl>
      ${approvalActions(index)}
    </article>
  `;
}

function repairApprovalCard(item, index) {
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        ${repairCategoryChip(item.requestCategory)}
        <strong>${acEscape(acMoney(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Request No.</dt><dd>${acEscape(item.requestNo || item.id)}</dd></div>
        <div><dt>Date</dt><dd>${acEscape(acDate(item.date))}</dd></div>
        <div><dt>Plate</dt><dd>${acEscape(item.plate)}</dd></div>
        <div><dt>Details</dt><dd>${acEscape(item.shortDetails || "Review details")}</dd></div>
        <div><dt>Requested By</dt><dd>${acEscape(item.payee)}</dd></div>
        <div><dt>Status</dt><dd>${acEscape(friendlyApprovalStatus(item.status))}</dd></div>
      </dl>
      ${approvalActions(index)}
    </article>
  `;
}

function renderApprovalList() {
  const body = ac$("ac-body");
  const mobile = ac$("ac-mobile-list");
  if (!body || !mobile) return;

  if (!acState.filtered.length) {
    const colspan = acState.view === "history" ? 9 : acState.tab === "repair" ? 10 : 9;
    const emptyText = acState.view === "history" ? "No approval history records match this view." : "No pending approval records match this view.";
    body.innerHTML = `<tr><td colspan="${colspan}" class="ops-empty">${acEscape(emptyText)}</td></tr>`;
    mobile.innerHTML = `<div class="ops-empty">${acEscape(emptyText)}</div>`;
    return;
  }

  body.innerHTML = acState.filtered.map(approvalRow).join("");
  mobile.innerHTML = acState.filtered.map(approvalCard).join("");
  bindRepairRowSelection();
  bindCashRowSelection();
}

function renderApproval() {
  renderApprovalHeaders();
  renderApprovalSummary();
  renderApprovalList();
}

function openApprovalDetail(index) {
  const item = acState.filtered[index];
  const detail = ac$("ac-detail");
  const modal = ac$("ac-modal");
  if (!item) return;
  if (!detail || !modal) return;
  acState.activeItem = item;

  detail.innerHTML = buildApprovalDetailHtml(item);
  bindModalApprovalButtons();
  modal.hidden = false;
}

function closeApprovalDetail() {
  const modal = ac$("ac-modal");
  if (modal) modal.hidden = true;
  acState.activeItem = null;
}

function detailField(label, value) {
  return `<div><span>${acEscape(label)}</span><strong>${acDisplay(value)}</strong></div>`;
}

function buildApprovalDetailHtml(item) {
  if (item.type === "repair") return buildRepairModalHtml(item);
  if (item.type === "cash") return buildCashModalHtml(item);
  const body = item.type === "payroll"
    ? buildPayrollDetailHtml(item)
    : buildRepairDetailHtml(item);
  return `
    <div class="approval-modal-header">
      <span class="ops-pill">${acEscape(item.module)}</span>
      <div>
        <h2 id="ac-modal-title">${acDisplay(item.id)}</h2>
        <p>Current approval status: <strong>${acDisplay(item.status)}</strong></p>
      </div>
    </div>
    ${body}
    ${buildModalActions(item)}
  `;
}

function cashModalTitle(type) {
  if (type === "Diesel PO") return "Diesel PO Request";
  if (type === "Trip Budget") return "Trip Budget Request";
  if (type === "Bali / Cash Advance") return "Bali / Cash Advance Request";
  return "Other Cash Request";
}

function buildCashModalHtml(item) {
  return `
    <div class="approval-modal-header">
      ${cashTypeChip(item.cashType)}
      <div>
        <h2 id="ac-modal-title">${acEscape(cashModalTitle(item.cashType))}</h2>
        <p>Request No: <strong>${acEscape(item.requestNo || item.id)}</strong></p>
        <p>Please review the details before approving.</p>
      </div>
    </div>
    ${buildCashDetailHtml(item)}
    ${buildModalActions(item)}
  `;
}

function repairModalTitle(category) {
  const label = friendlyRepairCategory(category);
  if (label === "Labor Payment") return "Labor Payment Request";
  if (label === "Parts Request") return "Parts Request";
  if (label === "Equipment / Tools") return "Equipment / Tools Request";
  if (label === "Tire / Wheel") return "Tire / Wheel Request";
  return "Other Repair Request";
}

function buildRepairModalHtml(item) {
  return `
    <div class="approval-modal-header">
      ${repairCategoryChip(item.requestCategory)}
      <div>
        <h2 id="ac-modal-title">${acEscape(repairModalTitle(item.requestCategory))}</h2>
        <p>Request No: <strong>${acEscape(item.requestNo || item.id)}</strong></p>
        <p>Please review the details before approving.</p>
      </div>
    </div>
    ${buildRepairDetailHtml(item)}
    ${buildModalActions(item)}
  `;
}

function buildPayrollDetailHtml(item) {
  const record = item.raw || {};
  const totals = record.totals || {};
  const lines = Array.isArray(record.lines) ? record.lines : [];
  return `
    <section class="approval-detail-section">
      <h3>Payroll Details</h3>
      <div class="ops-detail-grid">
        ${detailField("Payroll Number", record.payrollNumber || record.Payroll_Number || record.Liquidation_Number || item.id)}
        ${detailField("Plate Number", record.plateNumber || record.Plate_Number || item.plate)}
        ${detailField("Group", record.groupCategory || record.Group_Category || item.group)}
        ${detailField("Driver", record.driverName || record.Driver_Name)}
        ${detailField("Helper", record.helperName || record.Helper_Name)}
        ${detailField("Payroll Date", acDate(record.payrollDate || record.Liquidation_Date || item.date))}
        ${detailField("Cutoff Start", acDate(record.cutoffStart || record.Period_Start))}
        ${detailField("Cutoff End", acDate(record.cutoffEnd || record.Period_End))}
        ${detailField("Encoder", record.encoderName || record.Encoded_By || record.createdBy)}
        ${detailField("Remarks", record.remarks || record.Remarks)}
        ${detailField("Total Diesel", acMoney(totals.totalDiesel || record.Total_Diesel))}
        ${detailField("Total Driver Salary", acMoney(totals.totalDriverSalary || record.Total_Driver_Salary))}
        ${detailField("Total Helper Salary", acMoney(totals.totalHelperSalary || record.Total_Helper_Salary))}
        ${detailField("Total Expenses", acMoney(totals.totalExpenses || record.Total_Expenses || item.amount))}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Trip Lines</h3>
      <div class="approval-lines-scroll">
        <table class="approval-detail-table">
          <thead>
            <tr><th>Trip Date</th><th>Source</th><th>Destination</th><th>PO No.</th><th>Shipment / DR No.</th><th>Driver Salary</th><th>Helper Salary</th><th>Diesel</th><th>Remarks</th></tr>
          </thead>
          <tbody>${renderPayrollTripLines(lines)}</tbody>
        </table>
      </div>
    </section>
    <label class="approval-notes-field">
      <span>Review Notes</span>
      <textarea id="ac-review-notes" rows="3" placeholder="Optional approval notes"></textarea>
    </label>
  `;
}

function renderPayrollTripLines(lines) {
  const visibleLines = lines.filter(line => line && Object.values(line).some(value => String(value ?? "").trim()));
  if (!visibleLines.length) return '<tr><td colspan="9" class="ops-empty">No trip lines available.</td></tr>';
  return visibleLines.map(line => `
    <tr>
      <td>${acDisplay(acDate(line.tripDate || line.Trip_Date))}</td>
      <td>${acDisplay(line.source || line.Source)}</td>
      <td>${acDisplay(line.destination || line.Destination)}</td>
      <td>${acDisplay(line.poNumber || line.PO_Number)}</td>
      <td>${acDisplay(line.shipmentNumber || line.Shipment_Number || line.drNumber || line.DR_Number)}</td>
      <td>${acEscape(acMoney(line.driverSalary || line.Driver_Salary))}</td>
      <td>${acEscape(acMoney(line.helperSalary || line.Helper_Salary))}</td>
      <td>${acEscape(acMoney(line.diesel || line.Diesel))}</td>
      <td>${acDisplay(line.remarks || line.Remarks)}</td>
    </tr>
  `).join("");
}

function buildCashDetailHtml(item) {
  const record = item.raw || {};
  const type = item.cashType || normalizeCashRequestType(record);
  const isPersonBasedCash = type === "Bali / Cash Advance" || type === "Other Cash Request";
  const role = record.personType || record.Role || record.personRole || record.role;
  return `
    <section class="approval-detail-section">
      <h3>Request Info</h3>
      <div class="ops-detail-grid">
        ${detailField("Date", acDate(record.date || item.date))}
        ${detailField("Type", type)}
        ${detailField("Plate / No Plate", record.plateNumber || record.Plate_Number || item.plate)}
        ${detailField("Group", record.groupCategory || record.Group_Category || item.group)}
        ${detailField("Current Status", friendlyApprovalStatus(item.status))}
        ${detailField("Payment Status", cashPaymentStatusValue(record))}
        ${detailField("Created At", acDate(record.createdAt || record.Created_At || record.updatedAt))}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Person / Receiver</h3>
      <div class="ops-detail-grid">
        ${detailField("Logged By", getCashLoggedBy(record))}
        ${detailField("Person", isPersonBasedCash ? (record.personName || record.Person_Name || item.payee) : item.payee)}
        ${detailField("Role", isPersonBasedCash ? role : "")}
        ${detailField("Driver", record.driverName || record.Driver_Name)}
        ${detailField("Helper", record.helperName || record.Helper_Name)}
        ${detailField("Receiver", record.receiverName || record.Receiver_Name)}
        ${detailField("Deposit To", record.depositTo || record.Deposit_To)}
        ${detailField("Deposit Number", record.depositNumber || record.Deposit_Number)}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Cash / PO Details</h3>
      <div class="ops-detail-grid">
        ${buildCashTypeFields(type, record, item)}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Notes</h3>
      <div class="ops-detail-grid">
        ${detailField("Remarks / Source Message", record.remarks || record.Remarks || record.Source_Message || record.sourceMessage)}
      </div>
    </section>
    <p class="ops-modal-note">Internal ID: ${acDisplay(record.Record_ID || record.Cash_ID || record.id || record.cashId || record.referenceId || record.Reference_ID || item.id)}</p>
  `;
}

function buildCashTypeFields(type, record, item) {
  if (type === "Diesel PO") {
    const depositNeeded = record.depositNeeded === true ? "Yes" : record.depositNeeded === false ? "No" : "";
    return `
      ${detailField("PO Number", record.poNumber || record.PO_Number)}
      ${detailField("Fuel Station", record.fuelStation || record.Fuel_Station)}
      ${detailField("Diesel Amount", acMoney(record.Diesel_Amount || record.dieselAmount || record.amount || record.Amount || item.amount))}
      ${detailField("Liters", acFirst(record, ["liters", "Liters", "dieselLiters"]) ? `${acFirst(record, ["liters", "Liters", "dieselLiters"])} L` : "")}
      ${detailField("Source", record.source || record.Source)}
      ${detailField("Destination", record.destination || record.Destination)}
      ${detailField("Route", record.route || record.Route || record.Route_Trip || routeText(record))}
      ${detailField("Amount", acMoney(record.amount || record.Amount || item.amount))}
      ${detailField("Deposit Needed", depositNeeded)}
      ${detailField("Payment Reference", record.reference || record.Reference)}
    `;
  }
  if (type === "Trip Budget") {
    return `
      ${detailField("Budget Type", record.budgetType || record.Budget_Type)}
      ${detailField("Source", record.source || record.Source)}
      ${detailField("Destination", record.destination || record.Destination)}
      ${detailField("Shipment Number", record.shipmentNumber || record.Shipment_Number)}
      ${detailField("Budget Amount", acMoney(record.budgetAmount || record.Budget_Amount || record.amount || item.amount))}
      ${detailField("Amount", acMoney(record.amount || record.Amount || item.amount))}
      ${detailField("Payment Reference", record.reference || record.Reference)}
    `;
  }
  if (type === "Bali / Cash Advance") {
    return `
      ${detailField("Reason", record.reason || record.Reason || record.description || record.Description)}
      ${detailField("Current Balance", acMoney(record.currentBalance || record.Current_Balance || record.Balance_After_Payroll))}
      ${detailField("Amount", acMoney(record.amount || record.Amount || item.amount))}
      ${detailField("Approved By", record.approvedBy || record.Approved_By)}
      ${detailField("Payment Date", acDate(record.paymentDate || record.Payment_Date))}
      ${detailField("Payment Reference", record.reference || record.Reference)}
    `;
  }
  return `
    ${detailField("Description / Reason", record.description || record.Description || record.reason || record.Reason)}
    ${detailField("Amount", acMoney(record.amount || record.Amount || item.amount))}
    ${detailField("Payment Reference", record.reference || record.Reference)}
  `;
}

function buildRepairDetailHtml(item) {
  const record = item.raw || {};
  const category = item.requestCategory || normalizeRepairRequestCategory(record);
  const action = acFirst(record, ["action", "Action", "recordAction", "Record_Action", "type", "Request_Type"]);
  const showAction = String(action || "").toLowerCase() === "delete";
  const categoryFields = buildRepairCategoryFields(category, record, item);
  return `
    <section class="approval-detail-section">
      <h3>Truck / Request Info</h3>
      <div class="ops-detail-grid">
        ${detailField("Plate Number", record.plateNumber || record.Plate_Number || item.plate)}
        ${detailField("Request No", item.requestNo || getRepairFriendlyRequestNo(record))}
        ${detailField("Group", record.groupCategory || record.Group_Category || item.group)}
        ${detailField("Requested By", record.requestedBy || record.Requested_By || item.payee)}
        ${detailField("Date Requested", acDate(record.dateRequested || record.Date_Requested || record.Created_At || item.date))}
        ${detailField("Current Status", friendlyApprovalStatus(item.status))}
        ${detailField("Payment Status", record.paymentStatus || record.Payment_Status)}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Work / Item Details</h3>
      <div class="ops-detail-grid">
        ${categoryFields}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Amount</h3>
      <div class="ops-detail-grid">
        ${detailField("Total Amount", acMoney(repairAmount(record) || item.amount))}
      </div>
    </section>
    <section class="approval-detail-section">
      <h3>Notes</h3>
      <div class="ops-detail-grid">
        ${detailField("Remarks", record.remarks || record.Remarks)}
      </div>
    </section>
    <p class="ops-modal-note">System Reference: ${acDisplay(item.systemReference || record.id || record.requestId || record.Request_ID || item.id)}${showAction ? ` · Record Action: ${acDisplay(action)}` : ""}</p>
  `;
}

function buildRepairCategoryFields(category, record, item) {
  if (category === "Labor Payment Request") {
    return `
      ${detailField("Mechanic / Laborer", record.mechanic || record.laborer || record.Laborer || record.payee || item.payee)}
      ${detailField("Work Done", record.workDone || record.Work_Done || record.Repair_Issue || record.description || record.Description)}
      ${detailField("Labor Amount", acMoney(record.laborCost || record.Labor_Cost || item.amount))}
      ${detailField("Final Cost", acMoney(record.finalCost || record.Final_Cost || record.Approved_Cost || record.totalCost || record.Total_Cost))}
    `;
  }
  if (category === "Repair Parts Request") {
    return `
      ${detailField("Part Name / Item", record.partsItem || record.Parts_Item || record.Parts_Item_Name || record.Repair_Parts || record.item || record.Item)}
      ${detailField("Brand / Specification", record.brand || record.Brand || record.specification || record.Specification)}
      ${detailField("Quantity", record.quantity || record.Quantity)}
      ${detailField("Unit Cost", acMoney(record.unitCost || record.Unit_Cost))}
      ${detailField("Parts Cost", acMoney(record.partsCost || record.Parts_Cost || item.amount))}
      ${detailField("Supplier / Shop", record.supplierName || record.shopName || record.Shop_Name || record.Supplier || record.Shop || item.payee)}
    `;
  }
  if (category === "Equipment / Tools Request") {
    return `
      ${detailField("Equipment / Tool Name", record.equipmentName || record.toolName || record.Tool_Name || record.Parts_Item_Name || record.Repair_Parts || record.item || record.Item)}
      ${detailField("Purpose", record.purpose || record.Purpose || record.Work_Done || record.reason || record.Reason)}
      ${detailField("Quantity", record.quantity || record.Quantity)}
      ${detailField("Estimated Cost", acMoney(record.estimatedCost || record.Estimated_Cost || item.amount))}
      ${detailField("Supplier", record.supplierName || record.Supplier || record.shopName || record.Shop_Name || item.payee)}
    `;
  }
  if (category === "Tire / Wheel Request") {
    return `
      ${detailField("Tire / Wheel Item", record.tireItem || record.Tire_Item || record.wheelItem || record.Wheel_Item || record.partsItem || record.Parts_Item_Name || record.Repair_Parts || record.item)}
      ${detailField("Tire Position", record.tirePosition || record.Tire_Position || record.position || record.Position)}
      ${detailField("Quantity", record.quantity || record.Quantity)}
      ${detailField("Unit Cost", acMoney(record.unitCost || record.Unit_Cost))}
      ${detailField("Total Cost", acMoney(record.totalCost || record.Total_Cost || record.Original_Total_Cost || item.amount))}
      ${detailField("Supplier", record.supplierName || record.Supplier || record.shopName || record.Shop_Name || item.payee)}
    `;
  }
  return `
    ${detailField("Request Description", record.description || record.Description || record.workDone || record.Work_Done || record.Repair_Issue || record.partsItem || record.Parts_Item || record.Repair_Parts)}
    ${detailField("Estimated Cost", acMoney(record.estimatedCost || record.Estimated_Cost || item.amount))}
    ${detailField("Supporting Remarks", record.remarks || record.Remarks || record.reason || record.Reason)}
  `;
}

function buildModalActions(item) {
  const disabled = item.type !== "payroll";
  const disabledMessage = item.type === "repair"
    ? "Repair approval is not active yet. This screen is for review/testing only."
    : item.type === "cash"
      ? "Cash approval is not active yet. This screen is for review/testing only."
      : "Approval button is not active yet for this request.";
  const disabledAttr = disabled ? ` disabled title="${acEscape(disabledMessage)}"` : "";
  const disabledClass = disabled ? " ops-disabled-btn" : "";
  const note = disabled ? `<p class="ops-modal-note">${acEscape(disabledMessage)}</p>` : "";
  return `
    <div class="approval-modal-actions">
      <button type="button" class="ops-primary-btn${disabledClass}" data-modal-action="approve"${disabledAttr}>Approve</button>
      <button type="button" class="ops-secondary-btn${disabledClass}" data-modal-action="revise"${disabledAttr}>Ask to Revise</button>
      <button type="button" class="ops-danger-btn${disabledClass}" data-modal-action="reject"${disabledAttr}>Reject</button>
      <button type="button" class="ops-secondary-btn" data-modal-action="close">Close</button>
    </div>
    ${note}
  `;
}

function bindModalApprovalButtons() {
  const detail = ac$("ac-detail");
  if (!detail) return;
  detail.querySelectorAll("[data-modal-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.modalAction;
      if (action === "close") closeApprovalDetail();
      if (button.disabled) return;
      if (action === "approve") approvePayrollFromModal();
      if (action === "revise") returnPayrollFromModal();
      if (action === "reject") rejectPayrollFromModal();
    });
  });
}

function payrollCloudPost(action, payload = {}) {
  return fetch(PAYROLL_LIQUIDATION_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      syncKey: PAYROLL_LIQUIDATION_SYNC_KEY,
      action,
      ...payload
    })
  }).then(response => response.json());
}

function isCloudSuccess(result) {
  return result?.ok === true || result?.success === true || result?.status === "success";
}

function getActivePayrollId() {
  const item = acState.activeItem;
  if (!item || item.type !== "payroll") return "";
  return acText(item.raw?.id || item.raw?.Liquidation_ID || item.id, "");
}

function approvePayrollFromModal() {
  const id = getActivePayrollId();
  if (!id) return;
  if (!confirm("Approve this liquidation?")) return;
  const reviewNotes = ac$("ac-review-notes")?.value.trim() || "";
  setApprovalMessage("Approving liquidation...", "info");
  payrollCloudPost("approveLiquidationByMother", {
    Liquidation_ID: id,
    approvedBy: "Mother",
    reviewNotes
  })
    .then(result => {
      if (!isCloudSuccess(result)) throw new Error(result?.error || "Approval failed.");
      updateLocalPayrollStatus(id, "Approved", { approverName: "Mother", approvalNotes: reviewNotes });
      closeApprovalDetail();
      reloadApprovalList("Approved and synced to cloud.");
    })
    .catch(error => {
      console.warn("Approval failed", error);
      setApprovalMessage("Approval failed. Please try again.", "error");
    });
}

function returnPayrollFromModal() {
  const id = getActivePayrollId();
  if (!id) return;
  const reason = prompt("Why should this be revised?");
  if (!reason || !reason.trim()) {
    setApprovalMessage("Revision reason is required.", "warning");
    return;
  }
  setApprovalMessage("Returning liquidation for revision...", "info");
  payrollCloudPost("returnLiquidationForRevision", {
    Liquidation_ID: id,
    returnedBy: "Mother",
    returnReason: reason.trim()
  })
    .then(result => {
      if (!isCloudSuccess(result)) throw new Error(result?.error || "Return failed.");
      updateLocalPayrollStatus(id, "Returned", { approverName: "Mother", revisionReason: reason.trim() });
      closeApprovalDetail();
      reloadApprovalList("Returned for revision and synced to cloud.");
    })
    .catch(error => {
      console.warn("Return failed", error);
      setApprovalMessage("Return failed. Please try again.", "error");
    });
}

function rejectPayrollFromModal() {
  const id = getActivePayrollId();
  if (!id) return;
  const reason = prompt("Reason for rejection?");
  if (!reason || !reason.trim()) {
    setApprovalMessage("Rejection reason is required.", "warning");
    return;
  }
  setApprovalMessage("Rejecting liquidation...", "info");
  payrollCloudPost("rejectLiquidation", {
    Liquidation_ID: id,
    rejectedBy: "Mother",
    rejectReason: reason.trim()
  })
    .then(result => {
      if (!isCloudSuccess(result)) throw new Error(result?.error || "Reject failed.");
      updateLocalPayrollStatus(id, "Rejected", { approverName: "Mother", revisionReason: reason.trim() });
      closeApprovalDetail();
      reloadApprovalList("Rejected and synced to cloud.");
    })
    .catch(error => {
      console.warn("Reject failed", error);
      setApprovalMessage("Reject failed. Please try again.", "error");
    });
}

function updateLocalPayrollStatus(id, status, approvalPatch = {}) {
  const records = acReadJson(AC_KEYS.payroll);
  const now = new Date().toISOString();
  const updated = records.map(record => {
    const recordId = acText(record.id || record.Liquidation_ID, "");
    if (recordId !== id) return record;
    return {
      ...record,
      status,
      Approval_Status: status,
      Workflow_Status: status,
      approval: {
        ...(record.approval || {}),
        ...approvalPatch
      },
      updatedAt: now
    };
  });
  acWriteJson(AC_KEYS.payroll, updated);
}

function reloadApprovalList(message) {
  refreshApprovalItems(message);
}

function setApprovalMessage(message, type = "info") {
  const target = ac$("ac-status-message");
  if (!target) return;
  target.textContent = message || "";
  target.className = `ops-status-line ${type}`;
}

function bindApprovalEvents() {
  document.querySelectorAll(".ops-tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".ops-tab").forEach(tab => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", tab === button ? "true" : "false");
      });
      acState.tab = button.dataset.tab;
      applyApprovalFilters();
    });
  });
  document.querySelectorAll(".ops-view-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".ops-view-btn").forEach(viewButton => {
        viewButton.classList.toggle("active", viewButton === button);
        viewButton.setAttribute("aria-selected", viewButton === button ? "true" : "false");
      });
      acState.view = button.dataset.view || "approval";
      acState.selectedRepairIds.clear();
      acState.selectedCashIds.clear();
      applyApprovalFilters();
    });
  });

  const search = ac$("ac-search");
  const sort = ac$("ac-sort");
  const refresh = ac$("ac-refresh");
  const close = ac$("ac-close");
  const modal = ac$("ac-modal");

  if (search) search.addEventListener("input", event => {
    acState.search = event.target.value;
    applyApprovalFilters();
  });
  if (sort) sort.addEventListener("change", event => {
    acState.sort = event.target.value;
    applyApprovalFilters();
  });
  if (refresh) refresh.addEventListener("click", () => {
    refreshApprovalItems();
  });
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-detail]");
    if (trigger) openApprovalDetail(Number(trigger.dataset.detail));
  });
  if (close) close.addEventListener("click", closeApprovalDetail);
  if (modal) modal.addEventListener("click", event => {
    if (event.target.id === "ac-modal") closeApprovalDetail();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setApprovalAccess();
  bindApprovalEvents();
  acState.repairRecords = readRealLocalRepairRecords();
  if (!acState.repairRecords.length) acState.repairRecords = readFallbackRepairRecords();
  acState.cashRecords = readLocalCashRecords();
  acState.cashSource = "localStorage fallback";
  loadApprovalItems(acState.repairRecords, acState.cashRecords);
  applyApprovalFilters();
  refreshApprovalItems();
});
