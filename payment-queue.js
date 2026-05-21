"use strict";

const STORAGE_KEYS = {
  payroll: "vnsPayrollRecords",
  repair: "vnsRepairChangeRequests",
  diesel: "vnsDieselPOEntries",
  budget: "vnsTripBudgets",
  bali: "vnsBaliCashAdvances"
};
const CASH_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyu1N444S_vthjIoxcy081CdDZJuy6EwHt5ktKU42U4qNY_HL4F2HHKEQl6HDSZZItf/exec";
const CASH_SYNC_KEY = "vns-cash-sync-2026-Jay";
const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";
const VNS_WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";

const PAYMENT_READY_STATUSES = [
  "approved",
  "for payment",
  "for release",
  "unpaid",
  "pending payment",
  "ready for payment",
  "ready for release"
];
const PAYMENT_FINAL_STATUSES = [
  "paid",
  "deposited",
  "used",
  "released",
  "completed",
  "done",
  "rejected",
  "returned",
  "cancelled",
  "canceled",
  "deleted",
  "draft"
];
const PAYMENT_PAID_STATUSES = [
  "paid",
  "deposited",
  "used",
  "released",
  "completed",
  "done"
];

const state = {
  items: [],
  filtered: [],
  activeModule: "payroll",
  activeSubtab: "for-payment",
  group: "all",
  sort: "date-desc",
  search: ""
};

function $(id) {
  return document.getElementById(id);
}

function canOpenPaymentQueue() {
  return !window.VNSAuth || window.VNSAuth.can("payment:queue");
}

function setPaymentAccess() {
  const page = $("pq-page-content");
  const banner = $("pq-dev-access-banner");
  const allowed = canOpenPaymentQueue();
  if (page) page.hidden = false;
  if (banner) banner.hidden = allowed;
  return true;
}

function readJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function text(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  return "PHP " + (Number(value) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function normalizeGroup(value) {
  const raw = text(value, "");
  const lower = raw.toLowerCase();
  if (!raw) return "Other";
  if (lower.includes("bottle")) return "Bottle";
  if (lower.includes("sugar")) return "Sugar";
  if (lower.includes("preform") || lower.includes("resin")) return "Preform / Resin";
  if (lower.includes("cap") || lower.includes("crown")) return "Caps / Crown";
  return raw;
}

function valueFrom(record, keys) {
  for (const key of keys) {
    const value = String(record?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function normalizeSupabaseRepairRecord(record = {}) {
  return {
    ...record,
    Request_ID: record.Request_ID || record.request_id || record.requestId,
    Request_Type: record.Request_Type || record.request_type || record.requestType,
    Date_Requested: record.Date_Requested || record.date_requested || record.dateRequested,
    Date_Finished: record.Date_Finished || record.date_finished || record.dateFinished,
    Requested_By: record.Requested_By || record.requested_by || record.requestedBy,
    Plate_Number: record.Plate_Number || record.plate_number || record.plateNumber,
    Truck_Type: record.Truck_Type || record.truck_type || record.truckType,
    Driver: record.Driver || record.driver,
    Helper: record.Helper || record.helper,
    Category: record.Category || record.category,
    Repair_Parts: record.Repair_Parts || record.repair_parts || record.repairParts,
    Work_Done: record.Work_Done || record.work_done || record.workDone,
    Quantity: record.Quantity || record.quantity,
    Unit_Cost: record.Unit_Cost || record.unit_cost || record.unitCost,
    Parts_Cost: record.Parts_Cost || record.parts_cost || record.partsCost,
    Labor_Cost: record.Labor_Cost || record.labor_cost || record.laborCost,
    Total_Cost: record.Total_Cost || record.total_cost || record.totalCost,
    Original_Total_Cost: record.Original_Total_Cost || record.original_total_cost || record.originalTotalCost || record.total_cost,
    Final_Cost: record.Final_Cost || record.final_cost || record.finalCost || record.total_cost,
    Supplier: record.Supplier || record.supplier,
    Payee: record.Payee || record.payee,
    Status: record.Status || record.status,
    Repair_Status: record.Repair_Status || record.repair_status || record.repairStatus,
    Approval_Status: record.Approval_Status || record.approval_status || record.approvalStatus,
    Payment_Status: record.Payment_Status || record.payment_status || record.paymentStatus,
    Approved_By: record.Approved_By || record.approved_by || record.approvedBy,
    Source_Message: record.Source_Message || record.source_message || record.sourceMessage,
    Remarks: record.Remarks || record.remarks,
    Created_At: record.Created_At || record.created_at || record.createdAt,
    Last_Updated: record.Last_Updated || record.updated_at || record.updatedAt,
    Is_Deleted: record.Is_Deleted || record.is_deleted || record.isDeleted
  };
}

function normalizedValue(record, keys) {
  return valueFrom(record, keys).toLowerCase();
}

function valuesFrom(record, keys) {
  return keys.map(key => String(record?.[key] ?? "").trim().toLowerCase()).filter(Boolean);
}

function statusMatches(value, statuses) {
  const status = String(value || "").trim().toLowerCase();
  return statuses.some(target => status === target || (target.length > 4 && status.includes(target)));
}

function isPaid(record) {
  const statuses = valuesFrom(record, ["payment_status", "paymentStatus", "Payment_Status", "Posted_Status", "postedStatus", "status", "Status", "Review_Status", "reviewStatus"]);
  return statuses.some(status => statusMatches(status, PAYMENT_PAID_STATUSES));
}

function isPaymentUnpaid(record, allowed = ["", "unpaid", "for payment"]) {
  const paymentStatus = normalizedValue(record, ["paymentStatus", "Payment_Status", "payment_status", "Posted_Status", "postedStatus"]);
  return !paymentStatus || allowed.includes(paymentStatus) || paymentStatus !== "paid";
}

function normalizeCashStatus(record = {}) {
  return normalizedValue(record, ["status", "Status", "Review_Status", "reviewStatus"]);
}

function normalizeCashApprovalStatus(record = {}) {
  return normalizedValue(record, ["approval_status", "approvalStatus", "Approval_Status"]);
}

function normalizeCashPaymentStatus(record = {}) {
  return normalizedValue(record, ["payment_status", "paymentStatus", "Payment_Status", "Posted_Status", "postedStatus"]);
}

function isCashDeleted(record = {}) {
  if (record?.isDeleted || record?.is_deleted || String(record?.Is_Deleted || "").trim().toLowerCase() === "true") return true;
  return [normalizeCashStatus(record), normalizeCashApprovalStatus(record), normalizeCashPaymentStatus(record)]
    .some(value => ["deleted", "cancelled", "canceled"].includes(value));
}

function isCashPendingApproval(record = {}) {
  if (isCashDeleted(record)) return false;
  const pending = new Set(["for approval", "pending", "pending approval", "submitted", "for review"]);
  return pending.has(normalizeCashStatus(record)) || pending.has(normalizeCashApprovalStatus(record));
}

function isCashApprovalHistory(record = {}) {
  if (isCashDeleted(record) || isCashPendingApproval(record)) return false;
  const history = new Set(["approved", "rejected", "returned", "paid", "deposited", "used"]);
  return [normalizeCashStatus(record), normalizeCashApprovalStatus(record), normalizeCashPaymentStatus(record)]
    .some(value => history.has(value));
}

function isCashPaidHistory(record = {}) {
  if (isCashDeleted(record)) return false;
  return normalizeCashPaymentStatus(record) === "paid" || normalizeCashStatus(record) === "paid";
}

function isCashApprovedUnpaid(record = {}) {
  if (isCashDeleted(record) || isPaid(record)) return false;
  const status = normalizeCashStatus(record);
  const approvalStatus = normalizeCashApprovalStatus(record);
  const paymentStatus = normalizeCashPaymentStatus(record);
  const approved = status === "approved" || approvalStatus === "approved";
  const unpaid = !paymentStatus || ["unpaid", "pending"].includes(paymentStatus);

  return approved && unpaid;
}

function isCashPaymentReady(record = {}) {
  return isCashApprovedUnpaid(record);
}

function isRepairPaymentReady(record) {
  if (record?.isDeleted || String(record?.Is_Deleted || "").trim().toLowerCase() === "true") return false;

  const statuses = valuesFrom(record, [
    "Approval_Status",
    "approvalStatus",
    "Status",
    "status",
    "Repair_Status",
    "repairStatus",
    "Payment_Status",
    "paymentStatus"
  ]);
  if (statuses.some(value => statusMatches(value, PAYMENT_FINAL_STATUSES))) return false;

  const approvalStatus = normalizedValue(record, ["Approval_Status", "approvalStatus"]);
  const status = normalizedValue(record, ["Status", "status"]);
  const paymentStatus = normalizedValue(record, ["Payment_Status", "paymentStatus"]);
  const approvedForPayment = [approvalStatus, status].some(value => statusMatches(value, [
    "approved",
    "for payment",
    "for release",
    "ready for payment",
    "ready for release"
  ]));
  const unpaidPaymentStatus = !paymentStatus && status === "approved"
    ? true
    : statusMatches(paymentStatus, ["unpaid", "pending payment", "for payment", "ready for payment"]);

  return approvedForPayment && unpaidPaymentStatus;
}

function isApprovedForPayment(type, record) {
  if (isPaid(record) || record?.isDeleted) return false;
  const status = normalizedValue(record, ["status", "Status"]);
  const approvalStatus = normalizedValue(record, ["Approval_Status", "approvalStatus"]);
  const workflowStatus = normalizedValue(record, ["Workflow_Status", "workflowStatus"]);
  const reviewStatus = normalizedValue(record, ["Review_Status", "reviewStatus"]);

  if (type === "payroll") {
    return (status === "approved" || approvalStatus === "approved" || workflowStatus === "approved") && isPaymentUnpaid(record);
  }
  if (type === "cash") {
    return isCashPaymentReady(record);
  }
  if (type === "repair") return isRepairPaymentReady(record);
  return (status === "approved" || approvalStatus === "approved") && isPaymentUnpaid(record, ["", "unpaid", "for deposit"]);
}

function getPaymentModule(record = {}) {
  const explicit = String(record.type || record.moduleType || "").trim().toLowerCase();
  if (["payroll", "cash", "repair"].includes(explicit)) return explicit;
  if (record.request_type || record.requestType || record.Transaction_Type || record.Cash_ID || record.cashId) return "cash";
  if (record.Request_Type || record.repair_status || record.Repair_Status || record.Repair_Record_ID) return "repair";
  return "payroll";
}

function getPaymentSubtab(record = {}) {
  return isPaymentHistoryRecord(record, getPaymentModule(record)) ? "history" : "for-payment";
}

function isForPaymentRecord(record = {}, module = getPaymentModule(record)) {
  if (module === "cash") return isCashApprovedUnpaid(record);
  if (module === "repair") return isRepairPaymentReady(record);
  if (module === "payroll") return isApprovedForPayment("payroll", record);
  return false;
}

function isPaymentHistoryRecord(record = {}, module = getPaymentModule(record)) {
  if (module === "cash") return isCashPaidHistory(record);
  if (module === "repair") return isPaid(record) && !record?.isDeleted && String(record?.Is_Deleted || "").trim().toLowerCase() !== "true";
  if (module === "payroll") return isPaid(record) && !record?.isDeleted;
  return false;
}

function slug(value = "") {
  return String(value || "other").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getRequestTypeClass(type, module) {
  const normalized = String(type || "").toLowerCase();
  if (module === "cash") {
    if (normalized.includes("diesel")) return "request-chip-diesel";
    if (normalized.includes("trip budget")) return "request-chip-trip-budget";
    if (normalized.includes("bali") || normalized.includes("cash advance")) return "request-chip-bali";
    return "request-chip-other";
  }
  if (module === "repair") {
    if (normalized.includes("labor")) return "request-chip-labor";
    if (normalized.includes("part")) return "request-chip-parts";
    if (normalized.includes("equipment") || normalized.includes("tool")) return "request-chip-equipment";
    if (normalized.includes("tire") || normalized.includes("wheel")) return "request-chip-tire";
    return "request-chip-other";
  }
  if (normalized.includes("liquidation")) return "request-chip-liquidation";
  if (normalized.includes("bali") || normalized.includes("deduction") || normalized.includes("balance")) return "request-chip-bali";
  return "request-chip-payroll";
}

function renderRequestTypeChip(type, module) {
  return `<span class="request-chip ${getRequestTypeClass(type, module)}">${escapeHtml(type || "Other")}</span>`;
}

function renderPaymentStatusChip(status) {
  const label = text(status, "Unknown");
  const normalized = label.toLowerCase();
  let cls = "payment-status-draft";
  if (normalized === "approved") cls = "payment-status-approved";
  else if (["unpaid", "pending", "pending payment", "for payment"].includes(normalized)) cls = "payment-status-unpaid";
  else if (["paid", "deposited", "used", "released", "completed", "done"].includes(normalized)) cls = "payment-status-paid";
  else if (["reported issue", "issue", "rejected", "returned"].includes(normalized)) cls = "payment-status-issue";
  return `<span class="payment-status-chip ${cls}">${escapeHtml(label)}</span>`;
}

function paymentStatusLabel(record) {
  if (isPaid(record)) return "Paid";
  return text(valueFrom(record, ["payment_status", "paymentStatus", "Payment_Status"]), "For Payment");
}

function approvalStatusLabel(record) {
  return text(valueFrom(record, ["approval_status", "Approval_Status", "approvalStatus", "Review_Status", "reviewStatus", "status", "Status"]), "Approved");
}

function repairRequestType(record) {
  const requestType = text(record.Request_Type || record.requestType || record.request_type || record.Category || record.category || record.type || record.Type, "Repair / Labor");
  return requestType === "Repair Monitoring Update" ? "Other Repair Request" : requestType;
}

function repairDetails(record) {
  return text(record.Work_Done || record.workDone || record.Repair_Issue || record.repairIssue || record.Repair_Parts || record.repairParts || record.Parts_Item || record.partsItem || record.Description || record.description || record.Remarks || record.remarks, "View details");
}

function cashRequestType(record) {
  const requestId = text(record.request_id || record.requestId || record.Cash_ID || record.id, "");
  const displayType = text(
    record.request_type ||
    record.requestType ||
    record.Request_Type ||
    record.Transaction_Type ||
    record.Type ||
    record.transactionType ||
    record.type ||
    record.cashType,
    "Cash Request"
  );
  console.log("Cash type source check", {
    request_id: requestId,
    canonical: record.request_type,
    rawTransactionType: record.Transaction_Type,
    rawType: record.Type || record.type,
    displayType
  });
  return displayType;
}

function cashDetails(record) {
  return text(record.Description || record.description || record.Reason || record.reason || record.Remarks || record.remarks || record.Source_Message || record.sourceMessage || record.Route || record.route, "View details");
}

function friendlySequence(value) {
  const raw = String(value || "").trim();
  const numeric = raw.match(/(\d{1,6})(?!.*\d)/);
  if (numeric) return numeric[1].slice(-4).padStart(4, "0");
  return raw.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "0000";
}

function isFriendlyRef(value) {
  return /^[A-Z]+-\d{8}-\d{3,}$/.test(String(value || "").trim());
}

function cashFriendlyPrefix(record = {}) {
  const type = cashRequestType(record).toLowerCase();
  return type.includes("bali") || type.includes("advance") ? "BALI" : "CPO";
}

function isBaliRecord(record = {}) {
  const type = String(
    record.request_type || record.requestType || record.Request_Type ||
    record.Transaction_Type || record.Type || record.type || ""
  ).toLowerCase();
  return /(bali|cash.?advance)/i.test(type);
}

function cashDisplayRef(record = {}, fallback = "") {
  const ref = text(record.request_no || record.requestNo || record.Request_No || record.cash_ref_id || record.cashRefId || record.Cash_Ref_ID || record.reference_id || record.referenceId || record.Reference_ID, "");
  if (ref) return ref;
  const raw = text(record.request_id || record.requestId || record.Request_ID || record.Cash_ID || record.Record_ID || record.id || fallback, "");
  return isFriendlyRef(raw) ? raw : "Pending Ref";
}

function repairDisplayRef(record = {}, fallback = "") {
  const ref = text(record.request_no || record.requestNo || record.Request_No || record.repair_ref_id || record.repairRefId || record.Repair_Ref_ID || record.truck_repair_ref_id || record.truckRepairRefId || record.Truck_Repair_Ref_ID, "");
  if (ref) return ref;
  const raw = text(record.Request_ID || record.request_id || record.requestId || record.Repair_Record_ID || record.repairRecordId || record.forRepairId || record.id || fallback, "");
  return isFriendlyRef(raw) ? raw : "Pending Ref";
}

function payrollDisplayRef(record = {}, fallback = "") {
  const friendly = text(record.payroll_ref_id || record.payrollRefId || record.Payroll_Ref_ID, "");
  if (friendly) return friendly;
  const raw = text(record.payroll_id || record.payrollId || record.Payroll_ID || record.payrollNumber || record.Payroll_Number || fallback, "");
  return isFriendlyRef(raw) ? raw : (raw ? "Pending Ref" : "");
}

function paymentDisplayRef(record = {}) {
  return text(record.payment_ref_id || record.paymentRefId || record.Payment_Ref_ID || record.payment_reference || record.paymentReference || record.Payment_Reference, "");
}

function showPaymentToast(type, title, item, options = {}) {
  window.showAppToast?.({
    type,
    title,
    message: options.message || "",
    refLabel: options.refLabel || "Source Ref",
    refValue: item?.displayRef || item?.sourceRefId || "Pending Ref",
    extra: options.paymentRef ? `Payment Ref: ${options.paymentRef}` : options.extra || "",
    duration: options.duration || 4500
  });
}

function makeItem(type, module, record, fallbackId) {
  const internalId = text(record.request_id || record.Request_ID || record.requestId || record.Repair_Record_ID || record.repairRecordId || record.Record_ID || record.Cash_ID || record.id || record.referenceId || record.Reference_ID || record.poNumber || record.PO_Number || fallbackId);
  const displayRef = type === "payroll"
    ? payrollDisplayRef(record, fallbackId)
    : type === "cash"
      ? cashDisplayRef(record, internalId)
      : repairDisplayRef(record, internalId);
  const common = {
    source: module,
    type,
    raw: record,
    id: internalId,
    displayRef,
    sourceRefId: displayRef,
    paymentRefId: paymentDisplayRef(record),
    plate: text(record.plate_number || record.plateNumber || record.Plate_Number || record.plate || record.truckPlate, "No Plate"),
    group: normalizeGroup(record.groupCategory || record.Group_Category || record.plateGroup || record.group),
    requestType: module,
    details: text(record.description || record.Description || record.remarks || record.Remarks, "View details"),
    approvalStatus: approvalStatusLabel(record),
    status: paymentStatusLabel(record),
    paid: isPaid(record),
    cloudId: type === "cash"
      ? String(record.request_id || record.requestId || record.Cash_ID || record.cashId || record.bali_id || record.baliId || record.Record_ID || record.id || "").trim()
      : type === "repair"
        ? String(record.Request_ID || record.request_id || record.requestId || record.Repair_Record_ID || record.id || "").trim()
        : type === "payroll"
          ? String(record.payroll_id || record.payrollId || record.Payroll_ID || record.id || "").trim()
          : ""
  };

  if (type === "payroll") {
    const driverAmt = Number(record.driverNetPay || record.driver_net_pay || record.Driver_Net_Pay || record.totals?.driverNetPay) || 0;
    const helperAmt = Number(record.helperNetPay || record.helper_net_pay || record.Helper_Net_Pay || record.totals?.helperNetPay) || 0;
    return {
      ...common,
      payee: text([record.driverName || record.driver_name || record.Driver_Name, record.helperName || record.helper_name || record.Helper_Name].filter(Boolean).join(" / ")),
      requestType: "Payroll",
      details: text(record.payrollNumber || record.payroll_number || record.Payroll_Number || record.Liquidation_Number || record.remarks || record.Remarks, "Payroll liquidation"),
      date: record.date || record.payrollDate || record.payroll_date || record.Liquidation_Date || record.cutoffEnd || record.Period_End || record.createdAt,
      amount: driverAmt + helperAmt,
      driverName: text(record.driverName || record.driver_name || record.Driver_Name, ""),
      helperName: text(record.helperName || record.helper_name || record.Helper_Name, ""),
      driverAmount: driverAmt,
      helperAmount: helperAmt,
      driverPaymentStatus: text(record.driver_payment_status || record.driverPaymentStatus, "Unpaid"),
      helperPaymentStatus: text(record.helper_payment_status || record.helperPaymentStatus, "Unpaid"),
      driverPaidAt: text(record.driver_paid_at || record.driverPaidAt, ""),
      helperPaidAt: text(record.helper_paid_at || record.helperPaidAt, ""),
      driverPaymentRefId: text(record.driver_payment_ref_id || record.driverPaymentRefId, ""),
      helperPaymentRefId: text(record.helper_payment_ref_id || record.helperPaymentRefId, "")
    };
  }

  if (type === "repair") {
    return {
      ...common,
      payee: text(record.payee || record.Payee || record.mechanic || record.shopName || record.supplierName || record.requestedBy),
      requestType: repairRequestType(record),
      details: repairDetails(record),
      date: record.dateRequested || record.Date_Requested || record.Date_Finished || record.date || record.timestamp || record.createdAt || record.Created_At,
      amount: Number(record.Final_Cost || record.finalCost || record.Approved_Cost || record.approvedCost || record.Total_Cost || record.totalCost || record.Labor_Cost || record.laborCost || record.Parts_Cost || record.partsCost || record.Original_Total_Cost || record.originalTotalCost) || 0
    };
  }

  return {
    ...common,
    payee: text(record.personName || record.Person_Name || record.payee || record.Payee || record.supplierName || record.driverName || record.receiverName || record.fuelStation),
    requestType: cashRequestType(record),
    details: cashDetails(record),
    date: record.date || record.Date || record.createdAt || record.Created_At || record.timestamp,
    amount: Number(record.amount ?? record.Amount ?? record.budgetAmount ?? record.Budget_Amount ?? record.Diesel_Amount ?? record.totalAmount) || 0
  };
}

function isCloudSuccess(result) {
  return result?.ok === true || result?.success === true || result?.status === "success";
}

function currentUser() {
  try {
    return String(window.VNSAuth?.user?.name || window.VNSAuth?.user?.email || "Payment User").trim() || "Payment User";
  } catch {
    return "Payment User";
  }
}

async function cashMarkPaidPost(raw, paymentDate = "", paymentReference = "", paymentNotes = "") {
  const now = new Date().toISOString();
  const user = currentUser();
  const requestId = String(raw.request_id || raw.requestId || raw.Cash_ID || raw.cashId || raw.Record_ID || raw.id || "").trim();
  if (!requestId) throw new Error("Cash record has no request ID - cannot mark paid.");
  const paidAt = paymentDate ? new Date(paymentDate).toISOString() : now;
  const notes = paymentNotes || String(raw.notes || raw.Notes || raw.remarks || raw.Remarks || "").trim();
  const record = {
    ...raw,
    request_id: requestId,
    Cash_ID: requestId,
    Review_Status: "Paid",
    Status: "Paid",
    Posted_Status: "Paid",
    Payment_Status: "Paid",
    Paid_By: user,
    Paid_At: paidAt,
    Released_By: user,
    Released_At: paidAt,
    Updated_At: now
  };

  const payload = {
    request_id: requestId,
    status: "Paid",
    payment_status: "Paid",
    paid_by: user,
    paid_at: paidAt,
    payment_reference: paymentReference || "",
    payment_notes: notes,
    notes
  };

  try {
    console.log("Calling cash payment API", requestId, payload);
    const response = await fetch(`${VNS_WORKER_API_BASE}/api/cash/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    console.log("Cash payment Supabase response", result);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Cash Supabase update failed (${response.status})`);
    }
    backupCashPaymentToSheets(record);
    return result;
  } catch (error) {
    console.warn("Cash payment Supabase update failed; using Sheets fallback.", error);
  }

  const response = await fetch(CASH_APP_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ syncKey: CASH_SYNC_KEY, action: "updateEntry", record })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cash update failed (${response.status}): ${text || response.statusText}`);
  }
  const result = await response.json();
  if (!isCloudSuccess(result)) throw new Error(result?.error || result?.message || "Cash update returned an error.");
  return result;
}

function cashRecordFromPaymentResult(result, fallback = {}) {
  if (result?.record && typeof result.record === "object") return result.record;
  if (Array.isArray(result?.records) && result.records[0]) return result.records[0];
  return fallback;
}

function updateCashPaidState(requestId, record = {}) {
  const paidRecord = {
    ...record,
    request_id: record.request_id || record.requestId || requestId,
    requestId,
    Cash_ID: record.Cash_ID || requestId,
    status: record.status || "Paid",
    payment_status: record.payment_status || record.paymentStatus || "Paid",
    paymentStatus: record.paymentStatus || record.payment_status || "Paid"
  };
  state.items = state.items.filter(item => item.type !== "cash" || item.id !== requestId);
  state.items.unshift(makeItem("cash", "Cash / PO / Bali", paidRecord, requestId));
  console.log("Cash paid item moved to history", requestId);
  console.log("Paid history refreshed", state.items.filter(item => item.type === "cash" && item.paid).length);
  console.log("Paid history source", "cash-supabase-list");
  applyFilters();
}

function backupCashPaymentToSheets(record) {
  console.log("Cash payment backup started");
  fetch(CASH_APP_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ syncKey: CASH_SYNC_KEY, action: "updateEntry", record })
  })
    .then(response => response.json())
    .then(result => {
      if (!isCloudSuccess(result)) throw new Error(result?.error || result?.message || "Cash payment backup failed.");
      console.log("Cash payment backup succeeded");
      return cashBackupStatusPost(record.request_id || record.Cash_ID, "synced");
    })
    .catch(error => {
      console.log("Cash payment backup failed", error);
      cashBackupStatusPost(record.request_id || record.Cash_ID, "failed", error?.message || "Cash payment backup failed");
    });
}

function cashBackupStatusPost(requestId, backupStatus, backupError = "") {
  if (!requestId) return Promise.resolve();
  return fetch(`${VNS_WORKER_API_BASE}/api/cash/backup-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      backup_status: backupStatus,
      backup_error: backupError
    })
  }).catch(error => console.warn("Cash backup status update failed", error));
}

async function repairMarkPaidPost(raw) {
  const now = new Date().toISOString();
  const requestId = String(raw.Request_ID || raw.request_id || raw.requestId || raw.Repair_Record_ID || raw.id || "").trim();
  if (!requestId) throw new Error("Repair record has no Request_ID — cannot mark paid.");
  const response = await fetch(REPAIR_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "updateStatus",
      Request_ID: requestId,
      requestId,
      Status: "Paid",
      Payment_Status: "Paid",
      Approval_Status: "Approved",
      Last_Updated: now
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Repair update failed (${response.status}): ${text || response.statusText}`);
  }
  const result = await response.json();
  if (!isCloudSuccess(result)) throw new Error(result?.error || result?.message || "Repair update returned an error.");
  return result;
}

async function repairMarkPaidSupabaseFirst(raw, paymentDate = "", paymentReference = "", paymentNotes = "") {
  const now = new Date().toISOString();
  const user = currentUser() || "Payment";
  const requestId = String(raw.Request_ID || raw.request_id || raw.requestId || raw.Repair_Record_ID || raw.id || "").trim();
  if (!requestId) throw new Error("Repair record has no Request_ID - cannot mark paid.");
  const paidAt = paymentDate ? new Date(paymentDate).toISOString() : now;
  const sheetsPayload = {
    action: "updateStatus",
    Request_ID: requestId,
    requestId,
    Status: "Paid",
    Payment_Status: "Paid",
    Approval_Status: "Approved",
    Repair_Status: "Approved",
    Paid_By: user,
    Paid_At: paidAt,
    Released_By: user,
    Released_At: paidAt,
    Last_Updated: now
  };

  try {
    const response = await fetch(`${VNS_WORKER_API_BASE}/api/repair/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        status: "Paid",
        payment_status: "Paid",
        approval_status: "Approved",
        repair_status: "Approved",
        paid_by: user,
        paid_at: paidAt,
        payment_reference: paymentReference || "",
        payment_notes: paymentNotes || "",
        updated_at: now,
        backup_status: "pending"
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Repair Supabase update failed (${response.status})`);
    }
    console.log("Repair payment saved to Supabase");
    backupRepairPaymentToSheets(sheetsPayload);
    return result;
  } catch (error) {
    console.warn("Repair payment Supabase update failed; using Sheets fallback.", error);
  }

  const result = await repairSheetsUpdateStatus(sheetsPayload);
  if (!isCloudSuccess(result)) throw new Error(result?.error || result?.message || "Repair update returned an error.");
  return result;
}

async function repairSheetsUpdateStatus(payload) {
  const response = await fetch(REPAIR_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Repair update failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
}

function backupRepairPaymentToSheets(payload) {
  console.log("Repair payment Sheets backup started");
  repairSheetsUpdateStatus(payload)
    .then(result => {
      if (!isCloudSuccess(result)) throw new Error(result?.error || result?.message || "Repair payment Sheets backup failed.");
      console.log("Repair payment Sheets backup succeeded");
      return repairBackupStatusPost(payload.requestId || payload.Request_ID, "synced");
    })
    .catch(error => {
      console.warn("Repair payment Sheets backup failed", error);
      repairBackupStatusPost(payload.requestId || payload.Request_ID, "failed", error?.message || "Repair payment Sheets backup failed");
    });
}

function repairBackupStatusPost(requestId, backupStatus, backupError = "") {
  if (!requestId) return Promise.resolve();
  return fetch(`${VNS_WORKER_API_BASE}/api/repair/backup-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      backup_status: backupStatus,
      backup_error: backupError
    })
  }).catch(error => console.warn("Repair backup status update failed", error));
}

function notifyPaid(module) {
  const base = window.VNS_PUSH_API_BASE || "/api/push";
  fetch(`${base}/notify-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module })
  }).catch(error => console.warn("Payment notify-paid push failed (non-blocking).", error));
}

function handleMarkPaid(index) {
  const item = state.filtered[index];
  if (!item || item.paid || !item.cloudId || (item.type !== "cash" && item.type !== "repair" && item.type !== "payroll")) return;
  if (item.type === "payroll") {
    openDetail(index);
    return;
  }
  closeDetail();
  openPaymentModal(index);
}

async function payrollMarkPersonPaidPost(payrollId, person, paymentDate, paymentReference, paymentNotes, markFullPaid) {
  const now = new Date().toISOString();
  const user = currentUser();
  const isDriver = person === "driver";
  const paidAt = paymentDate ? new Date(paymentDate).toISOString() : now;
  const payload = {
    payroll_id: payrollId,
    person_target: person,
    approved_by: user
  };
  if (isDriver) {
    payload.driver_payment_reference = paymentReference || "";
    payload.driver_payment_notes = paymentNotes || "";
    payload.driver_paid_at = paidAt;
  } else {
    payload.helper_payment_reference = paymentReference || "";
    payload.helper_payment_notes = paymentNotes || "";
    payload.helper_paid_at = paidAt;
  }
  if (markFullPaid) {
    payload.status = "Paid";
    payload.approval_status = "Approved";
    payload.payment_status = "Paid";
    payload.paid_at = paidAt;
  }
  const response = await fetch(`${VNS_WORKER_API_BASE}/api/payroll/update-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Payroll ${person} payment update failed (${response.status})`);
  }
  return result;
}

function renderPersonPaymentBadge(status) {
  const paid = String(status || "").toLowerCase() === "paid";
  return `<span class="pq-person-badge ${paid ? "pq-badge-paid" : "pq-badge-unpaid"}">${escapeHtml(paid ? "Paid" : (status || "Unpaid"))}</span>`;
}

function buildPayrollSplitDetailHtml(item, index) {
  const r = item.raw || {};
  const hasHelper = !!(item.helperName && item.helperAmount > 0);
  const driverPaid = item.driverPaymentStatus === "Paid";
  const helperPaid = !hasHelper || item.helperPaymentStatus === "Paid";
  const totalPaid = (driverPaid ? item.driverAmount : 0) + (hasHelper && helperPaid ? item.helperAmount : 0);
  const remaining = item.amount - totalPaid;

  const personCard = (role, name, amt, paid, paidAt, refId, dataVal) => {
    if (!name && amt === 0) return "";
    const payBtn = !paid
      ? `<button type="button" class="ops-primary-btn pq-person-pay-btn" data-pay-person="${dataVal}" data-pay-index="${index}">Mark ${role} as Paid</button>`
      : `<p class="pq-person-paid-note">Paid on ${escapeHtml(formatDate(paidAt) || "—")}${refId ? ` · <span class="ops-mono">${escapeHtml(refId)}</span>` : ""}</p>`;
    return `
      <div class="pq-person-card${paid ? " pq-person-card--paid" : ""}">
        <span class="pq-person-role">${escapeHtml(role)}</span>
        <div class="pq-person-name">${escapeHtml(name || "—")}</div>
        <div class="pq-person-amount">${escapeHtml(money(amt))}</div>
        <div class="pq-person-status-row">${renderPersonPaymentBadge(paid ? "Paid" : "Unpaid")}</div>
        ${payBtn}
      </div>`;
  };

  const driverCard = personCard("Driver", item.driverName, item.driverAmount, driverPaid, item.driverPaidAt, item.driverPaymentRefId, "driver");
  const helperCard = personCard("Helper", item.helperName, item.helperAmount, item.helperPaymentStatus === "Paid", item.helperPaidAt, item.helperPaymentRefId, "helper");

  return `
    <p class="ops-eyebrow">Payroll Payment Details</p>
    <h2 id="pq-modal-title">${escapeHtml(item.displayRef || item.id)}</h2>
    <div class="ops-detail-grid pq-payroll-split-summary">
      <div><span>Plate / No Plate</span><strong>${escapeHtml(item.plate)}</strong></div>
      <div><span>Payroll Date</span><strong>${escapeHtml(formatDate(item.date))}</strong></div>
      <div><span>Approval Status</span><strong>${renderPaymentStatusChip(item.approvalStatus)}</strong></div>
      <div><span>Overall Payment</span><strong>${renderPaymentStatusChip(item.status)}</strong></div>
    </div>
    <div class="pq-person-cards">
      ${driverCard}
      ${helperCard}
    </div>
    <div class="pq-payroll-totals">
      <div class="pq-total-row"><span>Total Payable</span><strong>${escapeHtml(money(item.amount))}</strong></div>
      <div class="pq-total-row"><span>Total Paid</span><strong>${escapeHtml(money(totalPaid))}</strong></div>
      <div class="pq-total-row${remaining > 0 ? " pq-total-remaining" : ""}"><span>Remaining</span><strong>${escapeHtml(money(remaining))}</strong></div>
    </div>
  `;
}

function openPaymentModal(index, person = null) {
  const item = state.filtered[index];
  if (!item || !item.cloudId) return;
  const modal = $("pq-pay-modal");
  if (!modal) return;
  const form = $("pq-pay-form");
  if (form) form.reset();
  const isPayrollPerson = item.type === "payroll" && !!person;
  const displayName = isPayrollPerson
    ? (person === "driver" ? item.driverName : item.helperName)
    : item.payee;
  const displayAmt = isPayrollPerson
    ? (person === "driver" ? item.driverAmount : item.helperAmount)
    : item.amount;
  let title;
  if (item.type === "payroll") {
    title = person === "driver" ? "Driver Payment" : "Helper Payment";
  } else if (item.type === "repair") {
    title = "Repair / Labor Payment";
  } else {
    title = isBaliRecord(item.raw) ? "Bali / Cash Advance Payment" : "Cash PO Payment";
  }
  const titleEl = $("pq-pay-modal-title");
  if (titleEl) titleEl.textContent = title;
  const refLabel = $("pq-pay-ref-label");
  if (refLabel) refLabel.textContent = "Source Ref: " + (item.displayRef || item.id || "—");
  const summary = $("pq-pay-summary");
  if (summary) {
    const nameLabel = item.type === "payroll" ? "Person" : (item.type === "repair" ? "Payee / Supplier" : "Payee / Person");
    summary.innerHTML = [
      [nameLabel, displayName || "—"],
      ["Amount", money(displayAmt)],
      ["Plate / No Plate", item.plate || "—"],
      ["Payment Ref ID", "Auto-generated after payment"]
    ].map(([l, v]) =>
      `<div class="pq-pay-summary-item"><span class="pq-pay-summary-label">${escapeHtml(l)}</span><span class="pq-pay-summary-value">${escapeHtml(v)}</span></div>`
    ).join("");
  }
  const dateInput = $("pq-pay-date");
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  const statusEl = $("pq-pay-status");
  if (statusEl) statusEl.textContent = "";
  const submitBtn = $("pq-pay-submit");
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Confirm Payment"; }
  modal.dataset.itemIndex = String(index);
  modal.dataset.itemType = item.type;
  if (isPayrollPerson) {
    const hasHelper = !!(item.helperName && item.helperAmount > 0);
    const otherAlreadyPaid = person === "driver"
      ? (!hasHelper || item.helperPaymentStatus === "Paid")
      : (item.driverPaymentStatus === "Paid");
    modal.dataset.payrollPerson = person;
    modal.dataset.markFullPaid = String(otherAlreadyPaid);
  } else {
    delete modal.dataset.payrollPerson;
    delete modal.dataset.markFullPaid;
  }
  modal.hidden = false;
}

function closePaymentModal() {
  const modal = $("pq-pay-modal");
  if (modal) modal.hidden = true;
}

async function handlePaymentModalSubmit(event) {
  event.preventDefault();
  const modal = $("pq-pay-modal");
  if (!modal) return;
  const index = Number(modal.dataset.itemIndex ?? modal.dataset.payrollIndex);
  const item = state.filtered[index];
  if (!item || !item.cloudId) return;
  const itemType = modal.dataset.itemType || item.type;
  const person = modal.dataset.payrollPerson || null;
  const markFullPaid = modal.dataset.markFullPaid === "true";
  const submitBtn = $("pq-pay-submit");
  const statusEl = $("pq-pay-status");
  const paymentDate = $("pq-pay-date")?.value?.trim() || "";
  const paymentReference = $("pq-pay-ref")?.value?.trim() || "";
  const paymentNotes = $("pq-pay-notes")?.value?.trim() || "";
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving..."; }
  if (statusEl) statusEl.textContent = "";
  try {
    if (itemType === "payroll") {
      const result = await payrollMarkPersonPaidPost(item.cloudId, person, paymentDate, paymentReference, paymentNotes, markFullPaid);
      notifyPaid(item.source);
      closePaymentModal();
      closeDetail();
      await loadItems();
      applyFilters();
      showPaymentToast("success", person === "helper" ? "Helper payment completed" : "Driver payment completed", item, {
        paymentRef: paymentDisplayRef(result?.record || {}) || "Generated by system"
      });
    } else if (itemType === "cash") {
      const result = await cashMarkPaidPost(item.raw, paymentDate, paymentReference, paymentNotes);
      notifyPaid(item.source);
      closePaymentModal();
      closeDetail();
      updateCashPaidState(item.cloudId || item.id, cashRecordFromPaymentResult(result, {
        ...item.raw,
        request_id: item.cloudId || item.id,
        status: "Paid",
        payment_status: "Paid",
        paid_at: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
      }));
      showPaymentToast("success", `${item.requestType || "Cash"} payment completed`, item, {
        paymentRef: paymentDisplayRef(result?.record || result || {}) || "Generated by system"
      });
    } else if (itemType === "repair") {
      const result = await repairMarkPaidSupabaseFirst(item.raw, paymentDate, paymentReference, paymentNotes);
      notifyPaid(item.source);
      closePaymentModal();
      closeDetail();
      await loadItems();
      applyFilters();
      showPaymentToast("success", "Repair / Labor payment completed", item, {
        paymentRef: paymentDisplayRef(result?.record || result || {}) || "Generated by system"
      });
    }
  } catch (error) {
    console.error("Payment failed:", error?.message || error);
    if (statusEl) statusEl.textContent = error?.message || "Could not mark as paid. Please try again.";
    showPaymentToast("error", "Payment failed", item, {
      message: error?.message || "Could not mark as paid. Please try again."
    });
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Confirm Payment"; }
  }
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

const normalizeCashListResponse = normalizeListResponse;

async function loadCloudCashRecords() {
  try {
    const response = await fetch(`${VNS_WORKER_API_BASE}/api/cash/list?limit=500`);
    if (!response.ok) throw new Error(`Cash Supabase list failed: ${response.status}`);
    const data = await response.json();
    if (data && data.ok === false) throw new Error(data.error || data.message || "Cash Supabase list returned an error.");
    const records = normalizeCashListResponse(data).filter(record => record && typeof record === "object");
    console.log("Payment queue cash loaded", records.length);
    console.log("Payment Queue Supabase cash records loaded", records.length);
    return records;
  } catch (error) {
    console.warn("Payment Queue cash Supabase load failed; using Google Sheets fallback.", error);
  }

  const params = new URLSearchParams({
    action: "listEntries",
    syncKey: CASH_SYNC_KEY
  });
  const response = await fetch(`${CASH_APP_SCRIPT_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Cash list failed: ${response.status}`);
  const data = await response.json();
  if (data && data.ok === false) throw new Error(data.error || "Cash list returned an error.");
  const records = normalizeCashListResponse(data).filter(record => record && typeof record === "object");
  console.log("Payment queue cash loaded", records.length);
  console.log("Payment Queue cloud cash records loaded", records.length);
  return records;
}

function loadLocalCashRecords() {
  return [
    ...readJson(STORAGE_KEYS.bali),
    ...readJson(STORAGE_KEYS.budget),
    ...readJson(STORAGE_KEYS.diesel)
  ];
}

async function loadCloudRepairRecords() {
  try {
    const response = await fetch(`${VNS_WORKER_API_BASE}/api/repair/list?limit=500`);
    if (!response.ok) throw new Error(`Repair Supabase list failed: ${response.status}`);
    const data = await response.json();
    if (data && data.ok === false) throw new Error(data.error || data.message || "Repair Supabase list returned an error.");
    const records = normalizeListResponse(data)
      .filter(record => record && typeof record === "object")
      .map(normalizeSupabaseRepairRecord);
    console.log("Payment Queue cloud repair records loaded", records.length);
    return records;
  } catch (error) {
    console.warn("Payment Queue repair Supabase load failed; using Google Sheets fallback.", error);
  }

  const response = await fetch(`${REPAIR_WEB_APP_URL}?action=list`);
  if (!response.ok) throw new Error(`Repair list failed: ${response.status}`);
  const data = await response.json();
  if (data && data.ok === false) throw new Error(data.error || data.message || "Repair list returned an error.");
  if (data && data.success === false) throw new Error(data.error || data.message || "Repair list returned an error.");
  const records = normalizeListResponse(data).filter(record => record && typeof record === "object");
  console.log("Payment Queue cloud repair records loaded", records.length);
  return records;
}

function loadLocalRepairRecords() {
  return readJson(STORAGE_KEYS.repair);
}

async function loadCashPaymentItems() {
  let records;
  try {
    records = await loadCloudCashRecords();
  } catch (error) {
    console.warn("Payment Queue cash cloud load failed; using local fallback.", error);
    records = loadLocalCashRecords();
  }

  const approved = records.filter(record => record && isCashPaymentReady(record));
  const paid = records.filter(record => record && isCashPaidHistory(record));
  console.log("Payment queue approved unpaid filtered", approved.length);
  console.log("Payment Queue approved cash records", approved.length);
  console.log("Paid history refreshed", paid.length);
  console.log("Paid history source", "cash-supabase-first");
  return [...approved, ...paid].map((record, index) => makeItem("cash", "Cash / PO / Bali", record, `CASH-${index + 1}`));
}

async function loadRepairPaymentItems() {
  let records;
  try {
    records = await loadCloudRepairRecords();
  } catch (error) {
    console.warn("Payment Queue repair cloud load failed; using local fallback.", error);
    records = loadLocalRepairRecords();
  }

  const approved = records.filter(record => record && (isRepairPaymentReady(record) || isPaid(record)));
  console.log("Payment Queue approved repair records", approved.filter(record => !isPaid(record)).length);
  return approved.map((record, index) => makeItem("repair", "Repair / Labor", record, `REP-${index + 1}`));
}

async function loadPayrollPaymentItems() {
  let records;
  try {
    const response = await fetch(`${VNS_WORKER_API_BASE}/api/payroll/list?limit=500`);
    if (!response.ok) throw new Error(`Payroll Supabase list failed: ${response.status}`);
    const data = await response.json();
    if (data && data.ok === false) throw new Error(data.error || data.message || "Payroll Supabase list returned an error.");
    records = normalizeListResponse(data).filter(record => record && typeof record === "object");
    console.log("Payment Queue cloud payroll records loaded", records.length);
  } catch (error) {
    console.warn("Payment Queue payroll Supabase load failed; using local fallback.", error);
    records = readJson(STORAGE_KEYS.payroll);
  }
  return records
    .filter(record => record && !record.isDeleted && (isForPaymentRecord(record, "payroll") || isPaymentHistoryRecord(record, "payroll")))
    .map((record, index) => makeItem("payroll", "Payroll", record, `PAY-${index + 1}`));
}

async function loadItems() {
  const [payroll, cash, repair] = await Promise.all([
    loadPayrollPaymentItems(),
    loadCashPaymentItems(),
    loadRepairPaymentItems()
  ]);

  state.items = [...payroll, ...cash, ...repair];
}

function applyFilters() {
  const query = state.search.trim().toLowerCase();
  let list = state.items.filter(item => item.type === state.activeModule);
  list = state.activeSubtab === "history"
    ? list.filter(item => item.paid)
    : list.filter(item => !item.paid);
  if (state.group !== "all") list = list.filter(item => item.group === state.group);
  if (query) {
    list = list.filter(item => [item.source, item.id, item.displayRef, item.sourceRefId, item.paymentRefId, item.plate, item.group, item.requestType, item.details, item.payee, item.approvalStatus, item.status]
      .join(" ")
      .toLowerCase()
      .includes(query));
  }

  list.sort((a, b) => {
    if (state.sort === "date-asc") return new Date(a.date || 0) - new Date(b.date || 0);
    if (state.sort === "amount-desc") return b.amount - a.amount;
    if (state.sort === "amount-asc") return a.amount - b.amount;
    if (state.sort === "module-asc") return a.source.localeCompare(b.source);
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  state.filtered = list;
  if (state.activeSubtab === "history") console.log("Payment history filtered", state.activeModule, list.length);
  else console.log("For payment filtered", state.activeModule, list.length);
  render();
}

function count(type) {
  return state.items.filter(item => !item.paid && (type === "all" || item.type === type)).length;
}

function renderSummary() {
  const summary = $("pq-summary");
  if (!summary) return;
  const pending = state.items.filter(item => !item.paid);
  const total = pending.reduce((sum, item) => sum + item.amount, 0);
  const cards = [
    ["Total Pending Payment", pending.length, money(total), true],
    ["Payroll", count("payroll"), money(pending.filter(item => item.type === "payroll").reduce((sum, item) => sum + item.amount, 0))],
    ["Cash / PO / Bali", count("cash"), money(pending.filter(item => item.type === "cash").reduce((sum, item) => sum + item.amount, 0))],
    ["Repair / Labor", count("repair"), money(pending.filter(item => item.type === "repair").reduce((sum, item) => sum + item.amount, 0))]
  ];

  summary.innerHTML = cards.map(card => `
    <article class="ops-summary-card${card[3] ? " accent" : ""}">
      <span>${escapeHtml(card[0])}</span>
      <strong>${escapeHtml(card[1])}</strong>
      <small>${escapeHtml(card[2])}</small>
    </article>
  `).join("");
}

function activeViewText() {
  return state.activeSubtab === "history"
    ? "Paid records are shown here for review."
    : "Approved records waiting for payment or release.";
}

function renderViewNote() {
  const note = $("pq-view-note");
  if (note) note.textContent = activeViewText();
}

function rowHtml(item, index) {
  const canMarkPaid = state.activeSubtab === "for-payment" && !item.paid && !!item.cloudId && (item.type === "cash" || item.type === "repair" || item.type === "payroll");
  const markPaidLabel = item.type === "payroll" ? "Mark as Paid" : "Mark Paid / Released";
  const markPaidBtn = canMarkPaid
    ? `<button type="button" class="ops-secondary-btn" data-mark-paid="${index}">${markPaidLabel}</button>`
    : "";
  const issueBtn = state.activeSubtab === "for-payment"
    ? `<button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>`
    : "";
  return `
    <tr>
      <td>${escapeHtml(formatDate(item.date))}</td>
      <td class="ops-mono">${escapeHtml(item.displayRef || item.id)}</td>
      <td>${escapeHtml(item.plate)}</td>
      <td>${renderRequestTypeChip(item.requestType, item.type)}</td>
      <td><span class="details-clamp" title="${escapeHtml(item.details)}">${escapeHtml(item.details)}</span></td>
      <td>${escapeHtml(item.payee)}</td>
      <td class="ops-amount">${escapeHtml(money(item.amount))}</td>
      <td>${renderPaymentStatusChip(item.approvalStatus)}</td>
      <td>${renderPaymentStatusChip(item.status)}</td>
      <td class="ops-actions">
        <button type="button" class="ops-secondary-btn" data-detail="${index}">View Details</button>
        ${markPaidBtn}
        ${issueBtn}
      </td>
    </tr>
  `;
}

function cardHtml(item, index) {
  const canMarkPaid = state.activeSubtab === "for-payment" && !item.paid && !!item.cloudId && (item.type === "cash" || item.type === "repair" || item.type === "payroll");
  const markPaidLabel = item.type === "payroll" ? "Mark as Paid" : "Mark Paid / Released";
  const markPaidBtn = canMarkPaid
    ? `<button type="button" class="ops-secondary-btn" data-mark-paid="${index}">${markPaidLabel}</button>`
    : "";
  const issueBtn = state.activeSubtab === "for-payment"
    ? `<button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>`
    : "";
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        <span class="ops-pill">${escapeHtml(item.source)}</span>
        <strong>${escapeHtml(money(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Source Ref ID</dt><dd>${escapeHtml(item.displayRef || item.id)}</dd></div>
        ${item.paymentRefId ? `<div><dt>Payment Ref ID</dt><dd>${escapeHtml(item.paymentRefId)}</dd></div>` : ""}
        <div><dt>Plate / No Plate</dt><dd>${escapeHtml(item.plate)}</dd></div>
        <div><dt>Request Type</dt><dd>${renderRequestTypeChip(item.requestType, item.type)}</dd></div>
        <div><dt>Details</dt><dd><span class="details-clamp" title="${escapeHtml(item.details)}">${escapeHtml(item.details)}</span></dd></div>
        <div><dt>Payee / Person / Supplier</dt><dd>${escapeHtml(item.payee)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formatDate(item.date))}</dd></div>
        <div><dt>Status</dt><dd>${renderPaymentStatusChip(item.approvalStatus)}</dd></div>
        <div><dt>Payment Status</dt><dd>${renderPaymentStatusChip(item.status)}</dd></div>
      </dl>
      <div class="ops-actions">
        <button type="button" class="ops-secondary-btn" data-detail="${index}">View Details</button>
        ${markPaidBtn}
        ${issueBtn}
      </div>
    </article>
  `;
}

function renderList() {
  const body = $("pq-body");
  const mobile = $("pq-mobile-list");
  if (!body || !mobile) return;

  if (!state.filtered.length) {
    const heading = state.activeSubtab === "history" ? "No paid records yet." : "No approved unpaid records yet.";
    const copy = state.activeSubtab === "history"
      ? "Paid records are shown here for review."
      : "Approved records waiting for payment or release.";
    const message = `
      <div class="ops-empty-state">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(copy)}</span>
      </div>
    `;
    body.innerHTML = `<tr><td colspan="10" class="ops-empty">${message}</td></tr>`;
    mobile.innerHTML = message;
    return;
  }

  body.innerHTML = state.filtered.map(rowHtml).join("");
  mobile.innerHTML = state.filtered.map(cardHtml).join("");
}

function render() {
  renderSummary();
  renderViewNote();
  renderList();
}

function openDetail(index) {
  const item = state.filtered[index];
  const detail = $("pq-detail");
  const modal = $("pq-modal");
  if (!item) return;
  if (!detail || !modal) return;

  if (item.type === "payroll") {
    detail.innerHTML = buildPayrollSplitDetailHtml(item, index);
    modal.hidden = false;
    return;
  }

  const canMarkPaid = state.activeSubtab === "for-payment" && !item.paid && !!item.cloudId && (item.type === "cash" || item.type === "repair");
  const markPaidBtn = canMarkPaid
    ? `<button type="button" class="ops-secondary-btn" data-mark-paid="${index}">Mark Paid / Released</button>`
    : "";
  const issueBtn = state.activeSubtab === "for-payment"
    ? `<button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>`
    : "";
  detail.innerHTML = `
    <p class="ops-eyebrow">Payment Details</p>
    <h2 id="pq-modal-title">${escapeHtml(item.source)} - ${escapeHtml(item.displayRef || item.id)}</h2>
    <div class="ops-detail-grid">
      <div><span>Source Ref ID</span><strong>${escapeHtml(item.displayRef || item.id)}</strong></div>
      ${item.paymentRefId ? `<div><span>Payment Ref ID</span><strong>${escapeHtml(item.paymentRefId)}</strong></div>` : ""}
      <div><span>Plate / No Plate</span><strong>${escapeHtml(item.plate)}</strong></div>
      <div><span>Request Type</span><strong>${renderRequestTypeChip(item.requestType, item.type)}</strong></div>
      <div><span>Details</span><strong>${escapeHtml(item.details)}</strong></div>
      <div><span>Payee / Person / Supplier</span><strong>${escapeHtml(item.payee)}</strong></div>
      <div><span>Date</span><strong>${escapeHtml(formatDate(item.date))}</strong></div>
      <div><span>Amount</span><strong>${escapeHtml(money(item.amount))}</strong></div>
      <div><span>Status</span><strong>${renderPaymentStatusChip(item.approvalStatus)}</strong></div>
      <div><span>Payment Status</span><strong>${renderPaymentStatusChip(item.status)}</strong></div>
    </div>
    <div class="ops-actions modal-actions">
      ${markPaidBtn}
      ${issueBtn}
    </div>
  `;
  modal.hidden = false;
}

function closeDetail() {
  const modal = $("pq-modal");
  if (modal) modal.hidden = true;
}

function bindEvents() {
  document.querySelectorAll("[data-module]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-module]").forEach(tab => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", tab === button ? "true" : "false");
      });
      state.activeModule = button.dataset.module;
      state.activeSubtab = "for-payment";
      document.querySelectorAll("[data-subtab]").forEach(tab => {
        const active = tab.dataset.subtab === state.activeSubtab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      console.log("Payment module changed", state.activeModule);
      applyFilters();
    });
  });
  document.querySelectorAll("[data-subtab]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-subtab]").forEach(tab => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", tab === button ? "true" : "false");
      });
      state.activeSubtab = button.dataset.subtab;
      console.log("Payment subtab changed", state.activeSubtab);
      applyFilters();
    });
  });

  const search = $("pq-search");
  const group = $("pq-group");
  const sort = $("pq-sort");
  const refresh = $("pq-refresh");
  const close = $("pq-close");
  const modal = $("pq-modal");

  if (search) search.addEventListener("input", event => {
    state.search = event.target.value;
    applyFilters();
  });
  if (group) group.addEventListener("change", event => {
    state.group = event.target.value;
    applyFilters();
  });
  if (sort) sort.addEventListener("change", event => {
    state.sort = event.target.value;
    applyFilters();
  });
  if (refresh) refresh.addEventListener("click", async () => {
    await loadItems();
    applyFilters();
  });
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-detail]");
    if (trigger) { openDetail(Number(trigger.dataset.detail)); return; }
    const payPersonTrigger = event.target.closest("[data-pay-person]");
    if (payPersonTrigger) {
      const person = payPersonTrigger.dataset.payPerson;
      const idx = Number(payPersonTrigger.dataset.payIndex);
      closeDetail();
      openPaymentModal(idx, person);
      return;
    }
    const markPaidTrigger = event.target.closest("[data-mark-paid]");
    if (markPaidTrigger) handleMarkPaid(Number(markPaidTrigger.dataset.markPaid), markPaidTrigger);
  });
  if (close) close.addEventListener("click", closeDetail);
  if (modal) modal.addEventListener("click", event => {
    if (event.target.id === "pq-modal") closeDetail();
  });

  const payClose = $("pq-pay-close");
  const payCancel = $("pq-pay-cancel");
  const payModal = $("pq-pay-modal");
  const payForm = $("pq-pay-form");
  if (payClose) payClose.addEventListener("click", closePaymentModal);
  if (payCancel) payCancel.addEventListener("click", closePaymentModal);
  if (payModal) payModal.addEventListener("click", event => {
    if (event.target.id === "pq-pay-modal") closePaymentModal();
  });
  if (payForm) payForm.addEventListener("submit", handlePaymentModalSubmit);
}

document.addEventListener("DOMContentLoaded", async () => {
  setPaymentAccess();
  const params = new URLSearchParams(window.location.search);
  const urlModule = params.get("module") || params.get("tab");
  const urlSubtab = params.get("view") || params.get("subtab");
  if (urlModule && ["payroll", "cash", "repair"].includes(urlModule)) {
    state.activeModule = urlModule;
    document.querySelectorAll("[data-module]").forEach(tab => {
      const active = tab.dataset.module === urlModule;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }
  if (urlSubtab && ["for-payment", "history"].includes(urlSubtab)) {
    state.activeSubtab = urlSubtab;
    document.querySelectorAll("[data-subtab]").forEach(tab => {
      const active = tab.dataset.subtab === urlSubtab;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }
  bindEvents();
  await loadItems();
  applyFilters();
});
