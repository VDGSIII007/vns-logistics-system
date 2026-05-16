"use strict";

const STORAGE_KEYS = {
  payroll: "vnsPayrollRecords",
  repair: "vnsRepairChangeRequests",
  diesel: "vnsDieselPOEntries",
  budget: "vnsTripBudgets",
  bali: "vnsBaliCashAdvances"
};

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

function isPaid(record) {
  const paymentStatus = normalizedValue(record, ["paymentStatus", "Payment_Status"]);
  const status = normalizedValue(record, ["status", "Status"]);
  return paymentStatus === "paid" || status === "paid" || status === "deposited" || status === "used";
}

function isPaymentUnpaid(record, allowed = ["", "unpaid", "for payment"]) {
  const paymentStatus = normalizedValue(record, ["paymentStatus", "Payment_Status"]);
  return !paymentStatus || allowed.includes(paymentStatus) || paymentStatus !== "paid";
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
    const blockedStatus = ["deposited", "used", "paid"].includes(status);
    return !blockedStatus && (status === "approved" || reviewStatus === "approved") && isPaymentUnpaid(record);
  }
  return (status === "approved" || approvalStatus === "approved") && isPaymentUnpaid(record, ["", "unpaid", "for deposit"]);
}

function paymentStatusLabel(record) {
  if (isPaid(record)) return "Paid";
  return text(valueFrom(record, ["paymentStatus", "Payment_Status"]), "For Payment");
}

function makeItem(type, module, record, fallbackId) {
  const common = {
    source: module,
    type,
    raw: record,
    id: text(record.id || record.referenceId || record.Reference_ID || record.poNumber || record.PO_Number || fallbackId),
    plate: text(record.plateNumber || record.Plate_Number || record.plate || record.truckPlate, "No Plate"),
    group: normalizeGroup(record.groupCategory || record.Group_Category || record.plateGroup || record.group),
    status: paymentStatusLabel(record),
    paid: isPaid(record)
  };

  if (type === "payroll") {
    return {
      ...common,
      payee: text([record.driverName || record.Driver_Name, record.helperName || record.Helper_Name].filter(Boolean).join(" / ")),
      date: record.date || record.payrollDate || record.Liquidation_Date || record.cutoffEnd || record.Period_End || record.createdAt,
      amount: (Number(record.driverNetPay || record.Driver_Net_Pay || record.totals?.driverNetPay) || 0) +
        (Number(record.helperNetPay || record.Helper_Net_Pay || record.totals?.helperNetPay) || 0)
    };
  }

  if (type === "repair") {
    return {
      ...common,
      payee: text(record.payee || record.Payee || record.mechanic || record.shopName || record.supplierName || record.requestedBy),
      date: record.dateRequested || record.Date_Requested || record.date || record.timestamp || record.createdAt,
      amount: Number(record.totalCost || record.Total_Cost || record.finalCost || record.Final_Cost || record.laborCost || record.partsCost) || 0
    };
  }

  return {
    ...common,
    payee: text(record.personName || record.Person_Name || record.payee || record.Payee || record.supplierName || record.driverName || record.receiverName || record.fuelStation),
    date: record.date || record.createdAt || record.timestamp,
    amount: Number(record.amount || record.budgetAmount || record.totalAmount) || 0
  };
}

function loadItems() {
  const payroll = readJson(STORAGE_KEYS.payroll)
    .filter(record => record && !record.isDeleted && (isApprovedForPayment("payroll", record) || isPaid(record)))
    .map((record, index) => makeItem("payroll", "Payroll", record, `PAY-${index + 1}`));

  const repair = readJson(STORAGE_KEYS.repair)
    .filter(record => record && !record.isDeleted && (isApprovedForPayment("repair", record) || isPaid(record)))
    .map((record, index) => makeItem("repair", "Repair / Labor", record, `REP-${index + 1}`));

  const cash = [
    ...readJson(STORAGE_KEYS.bali),
    ...readJson(STORAGE_KEYS.budget),
    ...readJson(STORAGE_KEYS.diesel)
  ]
    .filter(record => record && !record.isDeleted && (isApprovedForPayment("cash", record) || isPaid(record)))
    .map((record, index) => makeItem("cash", "Cash / PO / Bali", record, `CASH-${index + 1}`));

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
    list = list.filter(item => [item.source, item.id, item.plate, item.group, item.payee, item.status]
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
      <td><span class="ops-pill">${escapeHtml(item.source)}</span></td>
      <td class="ops-mono">${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.plate)}</td>
      <td>${escapeHtml(item.group)}</td>
      <td>${escapeHtml(item.payee)}</td>
      <td>${escapeHtml(formatDate(item.date))}</td>
      <td class="ops-amount">${escapeHtml(money(item.amount))}</td>
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
        <div><dt>Group</dt><dd>${escapeHtml(item.group)}</dd></div>
        <div><dt>Payee / Person / Supplier</dt><dd>${escapeHtml(item.payee)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formatDate(item.date))}</dd></div>
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
    body.innerHTML = `<tr><td colspan="9" class="ops-empty">${message}</td></tr>`;
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
      <div><span>Group</span><strong>${escapeHtml(item.group)}</strong></div>
      <div><span>Payee / Person / Supplier</span><strong>${escapeHtml(item.payee)}</strong></div>
      <div><span>Date</span><strong>${escapeHtml(formatDate(item.date))}</strong></div>
      <div><span>Amount</span><strong>${escapeHtml(money(item.amount))}</strong></div>
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
  if (refresh) refresh.addEventListener("click", () => {
    loadItems();
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

document.addEventListener("DOMContentLoaded", () => {
  setPaymentAccess();
  bindEvents();
  loadItems();
  applyFilters();
});
