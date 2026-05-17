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
  tab: "all",
  type: "all",
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
  const statuses = valuesFrom(record, ["paymentStatus", "Payment_Status", "Posted_Status", "postedStatus", "status", "Status"]);
  return statuses.some(status => statusMatches(status, PAYMENT_PAID_STATUSES));
}

function isPaymentUnpaid(record, allowed = ["", "unpaid", "for payment"]) {
  const paymentStatus = normalizedValue(record, ["paymentStatus", "Payment_Status"]);
  return !paymentStatus || allowed.includes(paymentStatus) || paymentStatus !== "paid";
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
    const statuses = valuesFrom(record, ["Review_Status", "reviewStatus", "Status", "status", "Approval_Status", "approvalStatus", "Payment_Status", "paymentStatus", "Posted_Status", "postedStatus"]);
    if (statuses.some(value => statusMatches(value, PAYMENT_FINAL_STATUSES))) return false;
    return statuses.some(value => statusMatches(value, PAYMENT_READY_STATUSES)) && isPaymentUnpaid(record);
  }
  if (type === "repair") return isRepairPaymentReady(record);
  return (status === "approved" || approvalStatus === "approved") && isPaymentUnpaid(record, ["", "unpaid", "for deposit"]);
}

function paymentStatusLabel(record) {
  if (isPaid(record)) return "Paid";
  return text(valueFrom(record, ["paymentStatus", "Payment_Status"]), "For Payment");
}

function approvalStatusLabel(record) {
  return text(valueFrom(record, ["Approval_Status", "approvalStatus", "Review_Status", "reviewStatus", "Status", "status"]), "Approved");
}

function repairRequestType(record) {
  return text(record.Request_Type || record.requestType || record.Category || record.category || record.type || record.Type, "Repair / Labor");
}

function repairDetails(record) {
  return text(record.Work_Done || record.workDone || record.Repair_Issue || record.repairIssue || record.Repair_Parts || record.repairParts || record.Parts_Item || record.partsItem || record.Description || record.description || record.Remarks || record.remarks, "View details");
}

function cashRequestType(record) {
  return text(record.Transaction_Type || record.transactionType || record.Request_Type || record.requestType || record.Type || record.type || record.cashType, "Cash / PO / Bali");
}

function cashDetails(record) {
  return text(record.Description || record.description || record.Reason || record.reason || record.Remarks || record.remarks || record.Source_Message || record.sourceMessage || record.Route || record.route, "View details");
}

function makeItem(type, module, record, fallbackId) {
  const common = {
    source: module,
    type,
    raw: record,
    id: text(record.Request_ID || record.requestId || record.Repair_Record_ID || record.repairRecordId || record.Record_ID || record.Cash_ID || record.id || record.referenceId || record.Reference_ID || record.poNumber || record.PO_Number || fallbackId),
    plate: text(record.plateNumber || record.Plate_Number || record.plate || record.truckPlate, "No Plate"),
    group: normalizeGroup(record.groupCategory || record.Group_Category || record.plateGroup || record.group),
    requestType: module,
    details: text(record.description || record.Description || record.remarks || record.Remarks, "View details"),
    approvalStatus: approvalStatusLabel(record),
    status: paymentStatusLabel(record),
    paid: isPaid(record)
  };

  if (type === "payroll") {
    return {
      ...common,
      payee: text([record.driverName || record.Driver_Name, record.helperName || record.Helper_Name].filter(Boolean).join(" / ")),
      requestType: "Payroll",
      details: text(record.payrollNumber || record.Payroll_Number || record.Liquidation_Number || record.remarks || record.Remarks, "Payroll liquidation"),
      date: record.date || record.payrollDate || record.Liquidation_Date || record.cutoffEnd || record.Period_End || record.createdAt,
      amount: (Number(record.driverNetPay || record.Driver_Net_Pay || record.totals?.driverNetPay) || 0) +
        (Number(record.helperNetPay || record.Helper_Net_Pay || record.totals?.helperNetPay) || 0)
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
    amount: Number(record.amount || record.Amount || record.budgetAmount || record.Budget_Amount || record.Diesel_Amount || record.totalAmount) || 0
  };
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
  const params = new URLSearchParams({
    action: "listEntries",
    syncKey: CASH_SYNC_KEY
  });
  const response = await fetch(`${CASH_APP_SCRIPT_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Cash list failed: ${response.status}`);
  const data = await response.json();
  if (data && data.ok === false) throw new Error(data.error || "Cash list returned an error.");
  const records = normalizeCashListResponse(data).filter(record => record && typeof record === "object");
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

  const approved = records.filter(record => record && !record.isDeleted && (isApprovedForPayment("cash", record) || isPaid(record)));
  console.log("Payment Queue approved cash records", approved.filter(record => !isPaid(record)).length);
  return approved.map((record, index) => makeItem("cash", "Cash / PO / Bali", record, `CASH-${index + 1}`));
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

async function loadItems() {
  const payroll = readJson(STORAGE_KEYS.payroll)
    .filter(record => record && !record.isDeleted && (isApprovedForPayment("payroll", record) || isPaid(record)))
    .map((record, index) => makeItem("payroll", "Payroll", record, `PAY-${index + 1}`));

  const [cash, repair] = await Promise.all([
    loadCashPaymentItems(),
    loadRepairPaymentItems()
  ]);

  state.items = [...payroll, ...cash, ...repair];
}

function applyFilters() {
  const query = state.search.trim().toLowerCase();
  let list = [...state.items];

  if (state.tab === "paid") list = list.filter(item => item.paid);
  if (state.tab !== "all" && state.tab !== "paid") list = list.filter(item => item.type === state.tab && !item.paid);
  if (state.tab === "all") list = list.filter(item => !item.paid);
  if (state.type !== "all") list = list.filter(item => item.type === state.type);
  if (state.group !== "all") list = list.filter(item => item.group === state.group);
  if (query) {
    list = list.filter(item => [item.source, item.id, item.plate, item.group, item.requestType, item.details, item.payee, item.approvalStatus, item.status]
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

function rowHtml(item, index) {
  return `
    <tr>
      <td>${escapeHtml(formatDate(item.date))}</td>
      <td class="ops-mono">${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.plate)}</td>
      <td><span class="ops-pill">${escapeHtml(item.requestType)}</span></td>
      <td>${escapeHtml(item.details)}</td>
      <td>${escapeHtml(item.payee)}</td>
      <td class="ops-amount">${escapeHtml(money(item.amount))}</td>
      <td>${escapeHtml(item.approvalStatus)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td class="ops-actions">
        <button type="button" class="ops-secondary-btn" data-detail="${index}">View Details</button>
        <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Mark Paid / Released</button>
        <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>
      </td>
    </tr>
  `;
}

function cardHtml(item, index) {
  return `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        <span class="ops-pill">${escapeHtml(item.source)}</span>
        <strong>${escapeHtml(money(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Reference ID</dt><dd>${escapeHtml(item.id)}</dd></div>
        <div><dt>Plate / No Plate</dt><dd>${escapeHtml(item.plate)}</dd></div>
        <div><dt>Request Type</dt><dd>${escapeHtml(item.requestType)}</dd></div>
        <div><dt>Details</dt><dd>${escapeHtml(item.details)}</dd></div>
        <div><dt>Payee / Person / Supplier</dt><dd>${escapeHtml(item.payee)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formatDate(item.date))}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(item.approvalStatus)}</dd></div>
        <div><dt>Payment Status</dt><dd>${escapeHtml(item.status)}</dd></div>
      </dl>
      <div class="ops-actions">
        <button type="button" class="ops-secondary-btn" data-detail="${index}">View Details</button>
        <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Mark Paid / Released</button>
        <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>
      </div>
    </article>
  `;
}

function renderList() {
  const body = $("pq-body");
  const mobile = $("pq-mobile-list");
  if (!body || !mobile) return;

  if (!state.filtered.length) {
    const message = `
      <div class="ops-empty-state">
        <strong>No approved unpaid records yet.</strong>
        <span>Once Mother approves payroll, cash/PO/Bali, repair, or labor requests, they will appear here for payment.</span>
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
  renderList();
}

function openDetail(index) {
  const item = state.filtered[index];
  const detail = $("pq-detail");
  const modal = $("pq-modal");
  if (!item) return;
  if (!detail || !modal) return;
  detail.innerHTML = `
    <p class="ops-eyebrow">Payment Details</p>
    <h2 id="pq-modal-title">${escapeHtml(item.source)} - ${escapeHtml(item.id)}</h2>
    <div class="ops-detail-grid">
      <div><span>Plate / No Plate</span><strong>${escapeHtml(item.plate)}</strong></div>
      <div><span>Request Type</span><strong>${escapeHtml(item.requestType)}</strong></div>
      <div><span>Details</span><strong>${escapeHtml(item.details)}</strong></div>
      <div><span>Payee / Person / Supplier</span><strong>${escapeHtml(item.payee)}</strong></div>
      <div><span>Date</span><strong>${escapeHtml(formatDate(item.date))}</strong></div>
      <div><span>Amount</span><strong>${escapeHtml(money(item.amount))}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(item.approvalStatus)}</strong></div>
      <div><span>Payment Status</span><strong>${escapeHtml(item.status)}</strong></div>
    </div>
    <div class="ops-actions modal-actions">
      <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Mark Paid / Released</button>
      <button type="button" class="ops-disabled-btn" disabled title="Backend payment action not connected yet.">Report Issue</button>
    </div>
    <p class="ops-modal-note">Technical note: backend payment action not connected yet. This central queue does not write to localStorage or call payroll, repair, cash, or Apps Script backends.</p>
  `;
  modal.hidden = false;
}

function closeDetail() {
  const modal = $("pq-modal");
  if (modal) modal.hidden = true;
}

function bindEvents() {
  document.querySelectorAll(".ops-tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".ops-tab").forEach(tab => {
        tab.classList.toggle("active", tab === button);
        tab.setAttribute("aria-selected", tab === button ? "true" : "false");
      });
      state.tab = button.dataset.tab;
      applyFilters();
    });
  });

  const search = $("pq-search");
  const type = $("pq-type");
  const group = $("pq-group");
  const sort = $("pq-sort");
  const refresh = $("pq-refresh");
  const close = $("pq-close");
  const modal = $("pq-modal");

  if (search) search.addEventListener("input", event => {
    state.search = event.target.value;
    applyFilters();
  });
  if (type) type.addEventListener("change", event => {
    state.type = event.target.value;
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
    if (trigger) openDetail(Number(trigger.dataset.detail));
  });
  if (close) close.addEventListener("click", closeDetail);
  if (modal) modal.addEventListener("click", event => {
    if (event.target.id === "pq-modal") closeDetail();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setPaymentAccess();
  bindEvents();
  await loadItems();
  applyFilters();
});
