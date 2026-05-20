const BBC_WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";

const bbcState = {
  summary: null,
  transactions: [],
  activeTransaction: null,
  filters: {
    group: "",
    plate: "",
    person: "",
    date_from: "",
    date_to: "",
    status: ""
  }
};

function bbc$(id) {
  return document.getElementById(id);
}

function bbcCanOpen() {
  return !window.VNSAuth || window.VNSAuth.can("approval:center") || window.VNSAuth.can("payroll:approve");
}

function bbcSetAccess() {
  const page = bbc$("bbc-page-content");
  const banner = bbc$("bbc-dev-access-banner");
  const allowed = bbcCanOpen();
  if (page) page.hidden = false;
  if (banner) banner.hidden = allowed;
}

function bbcEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bbcText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function bbcMoney(value) {
  return "PHP " + (Number(value) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function bbcDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return bbcText(value);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function bbcSetMessage(message, type = "") {
  const el = bbc$("bbc-status-message");
  if (!el) return;
  el.textContent = message || "";
  el.className = `ops-status-line${type ? ` ${type}` : ""}`;
}

function bbcReadFilters() {
  bbcState.filters = {
    group: bbc$("bbc-group")?.value || "",
    plate: bbc$("bbc-plate")?.value.trim() || "",
    person: bbc$("bbc-person")?.value.trim() || "",
    date_from: bbc$("bbc-date-from")?.value || "",
    date_to: bbc$("bbc-date-to")?.value || "",
    status: bbc$("bbc-status")?.value || ""
  };
  console.log("Budget Balance filters changed", bbcState.filters);
  return bbcState.filters;
}

function bbcParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

async function bbcFetchJson(path, filters) {
  const params = bbcParams(filters);
  const url = `${BBC_WORKER_API_BASE}${path}${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Budget Balance load failed (${response.status})`);
  return data;
}

async function bbcLoadData() {
  const filters = bbcReadFilters();
  bbcSetMessage("Loading Budget Balance Center data...");
  try {
    const [summaryPayload, transactionsPayload] = await Promise.all([
      bbcFetchJson("/api/budget-balance/summary", filters),
      bbcFetchJson("/api/budget-balance/transactions", filters)
    ]);
    bbcState.summary = summaryPayload.summary || null;
    bbcState.transactions = Array.isArray(transactionsPayload.transactions) ? transactionsPayload.transactions : [];
    console.log("Budget Balance summary loaded", bbcState.summary);
    console.log("Budget Balance transactions loaded", bbcState.transactions.length);
    bbcSetMessage(`Loaded ${bbcState.transactions.length} balance transaction${bbcState.transactions.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    console.warn("Budget Balance load failed", error);
    bbcState.summary = null;
    bbcState.transactions = [];
    bbcSetMessage("Budget Balance data could not be loaded from the worker.", "warning");
  }
  bbcRender();
}

function bbcSummaryCard(title, rows, accent = false) {
  return `
    <article class="ops-summary-card budget-summary-card${accent ? " accent" : ""}">
      <span>${bbcEscape(title)}</span>
      ${rows.map((row, index) => index === 0
        ? `<strong>${bbcEscape(row.value)}</strong><small>${bbcEscape(row.label)}</small>`
        : `<div class="budget-summary-line"><em>${bbcEscape(row.label)}</em><b>${bbcEscape(row.value)}</b></div>`
      ).join("")}
    </article>
  `;
}

function bbcRenderSummary() {
  const el = bbc$("bbc-summary");
  if (!el) return;
  const summary = bbcState.summary || {};
  const truck = summary.truckBudget || {};
  const driver = summary.driverBalance || {};
  const helper = summary.helperBalance || {};
  const readiness = summary.payrollReadiness || {};

  el.innerHTML = [
    bbcSummaryCard("Truck Budget", [
      { label: "Selected plate", value: bbcText(truck.selectedPlate, "All Plates") },
      { label: "Group", value: bbcText(truck.group, "All Groups") },
      { label: "Open trip budget total", value: bbcMoney(truck.openTripBudgetTotal) },
      { label: "Open diesel PO total", value: bbcMoney(truck.openDieselPoTotal) },
      { label: "Latest budget date", value: bbcDate(truck.latestBudgetDate) },
      { label: "Latest PO date", value: bbcDate(truck.latestPoDate) }
    ], true),
    bbcSummaryCard("Driver Balance", [
      { label: "Driver name", value: bbcText(driver.name, "All Drivers") },
      { label: "Current balance", value: bbcMoney(driver.currentBalance) },
      { label: "Latest bali date", value: bbcDate(driver.latestBaliDate) },
      { label: "Total bali / cash advance", value: bbcMoney(driver.totalBaliCashAdvance) },
      { label: "Total payroll deductions", value: bbcMoney(driver.totalPayrollDeductions) }
    ]),
    bbcSummaryCard("Helper Balance", [
      { label: "Helper name", value: bbcText(helper.name, "All Helpers") },
      { label: "Current balance", value: bbcMoney(helper.currentBalance) },
      { label: "Latest bali date", value: bbcDate(helper.latestBaliDate) },
      { label: "Total bali / cash advance", value: bbcMoney(helper.totalBaliCashAdvance) },
      { label: "Total payroll deductions", value: bbcMoney(helper.totalPayrollDeductions) }
    ]),
    bbcSummaryCard("Payroll Readiness", [
      { label: "Open budget count", value: String(readiness.openBudgetCount || 0) },
      { label: "Open PO count", value: String(readiness.openPoCount || 0) },
      { label: "Open bali count", value: String(readiness.openBaliCount || 0) },
      { label: "Records needing review", value: String(readiness.recordsNeedingReview || 0) }
    ], true)
  ].join("");
}

function bbcTypeChip(type) {
  const normalized = String(type || "").toLowerCase();
  let cls = "request-chip-other";
  if (normalized.includes("diesel")) cls = "request-chip-diesel";
  else if (normalized.includes("trip budget")) cls = "request-chip-trip-budget";
  else if (normalized.includes("bali") || normalized.includes("cash advance")) cls = "request-chip-bali";
  else if (normalized.includes("deduction")) cls = "request-chip-payroll";
  return `<span class="request-chip ${cls}">${bbcEscape(type || "Adjustment")}</span>`;
}

function bbcStatusChip(status) {
  const label = bbcText(status, "Open");
  const normalized = label.toLowerCase();
  let cls = "payment-status-draft";
  if (normalized === "approved") cls = "payment-status-approved";
  else if (normalized === "for approval" || normalized === "open") cls = "payment-status-unpaid";
  else if (normalized === "paid / released" || normalized === "deducted") cls = "payment-status-paid";
  else if (normalized === "cancelled") cls = "payment-status-issue";
  return `<span class="payment-status-chip ${cls}">${bbcEscape(label)}</span>`;
}

function bbcRenderTable() {
  const body = bbc$("bbc-body");
  if (!body) return;
  if (!bbcState.transactions.length) {
    body.innerHTML = `<tr><td colspan="11" class="empty">No budget or balance records found for the selected filters.</td></tr>`;
    return;
  }
  body.innerHTML = bbcState.transactions.map((item, index) => `
    <tr>
      <td>${bbcEscape(bbcDate(item.date))}</td>
      <td>${bbcEscape(bbcText(item.plate, "No Plate"))}</td>
      <td>${bbcEscape(bbcText(item.person))}</td>
      <td>${bbcEscape(bbcText(item.role))}</td>
      <td>${bbcTypeChip(item.type)}</td>
      <td><span class="details-clamp">${bbcEscape(bbcText(item.details, "No details"))}</span></td>
      <td class="ops-amount">${bbcEscape(bbcMoney(item.amount))}</td>
      <td>${bbcEscape(bbcText(item.source))}</td>
      <td>${bbcStatusChip(item.status)}</td>
      <td>${bbcEscape(bbcText([item.payrollId, item.cutoff].filter(Boolean).join(" / ")))}</td>
      <td><button class="ops-secondary-btn" type="button" data-bbc-detail="${index}">View</button></td>
    </tr>
  `).join("");
}

function bbcRenderMobile() {
  const list = bbc$("bbc-mobile-list");
  if (!list) return;
  if (!bbcState.transactions.length) {
    list.innerHTML = `<div class="ops-mobile-card">No budget or balance records found for the selected filters.</div>`;
    return;
  }
  list.innerHTML = bbcState.transactions.map((item, index) => `
    <article class="ops-mobile-card">
      <div class="ops-mobile-card-head">
        <div>
          ${bbcTypeChip(item.type)}
          <p>${bbcEscape(bbcDate(item.date))}</p>
        </div>
        <strong>${bbcEscape(bbcMoney(item.amount))}</strong>
      </div>
      <dl>
        <div><dt>Plate</dt><dd>${bbcEscape(bbcText(item.plate, "No Plate"))}</dd></div>
        <div><dt>Person</dt><dd>${bbcEscape(bbcText(item.person))}</dd></div>
        <div><dt>Role</dt><dd>${bbcEscape(bbcText(item.role))}</dd></div>
        <div><dt>Details</dt><dd>${bbcEscape(bbcText(item.details, "No details"))}</dd></div>
        <div><dt>Status</dt><dd>${bbcStatusChip(item.status)}</dd></div>
        <div><dt>Payroll</dt><dd>${bbcEscape(bbcText([item.payrollId, item.cutoff].filter(Boolean).join(" / ")))}</dd></div>
      </dl>
      <button class="ops-secondary-btn" type="button" data-bbc-detail="${index}">View Details</button>
    </article>
  `).join("");
}

function bbcUpdateOptions() {
  const plateOptions = bbc$("bbc-plate-options");
  const personOptions = bbc$("bbc-person-options");
  if (plateOptions) {
    const plates = [...new Set(bbcState.transactions.map(item => item.plate).filter(Boolean))].sort();
    plateOptions.innerHTML = plates.map(plate => `<option value="${bbcEscape(plate)}"></option>`).join("");
  }
  if (personOptions) {
    const people = [...new Set(bbcState.transactions.map(item => item.person).filter(Boolean))].sort();
    personOptions.innerHTML = people.map(person => `<option value="${bbcEscape(person)}"></option>`).join("");
  }
}

function bbcRenderDetail(item = {}) {
  const detail = bbc$("bbc-detail");
  if (!detail) return;
  detail.innerHTML = `
    <h2 id="bbc-modal-title">Budget Balance Details</h2>
    <div class="ops-detail-grid">
      <div><span>Date</span><strong>${bbcEscape(bbcDate(item.date))}</strong></div>
      <div><span>Plate</span><strong>${bbcEscape(bbcText(item.plate, "No Plate"))}</strong></div>
      <div><span>Person</span><strong>${bbcEscape(bbcText(item.person))}</strong></div>
      <div><span>Role</span><strong>${bbcEscape(bbcText(item.role))}</strong></div>
      <div><span>Type</span><strong>${bbcEscape(bbcText(item.type))}</strong></div>
      <div><span>Amount</span><strong>${bbcEscape(bbcMoney(item.amount))}</strong></div>
      <div><span>Source</span><strong>${bbcEscape(bbcText(item.source))}</strong></div>
      <div><span>Status</span><strong>${bbcEscape(bbcText(item.status))}</strong></div>
    </div>
    <p class="ops-modal-notes">${bbcEscape(bbcText(item.details, "No details"))}</p>
    <button class="ops-disabled-btn wide" type="button" disabled>View-only in first version</button>
  `;
}

function bbcOpenDetail(index) {
  const item = bbcState.transactions[Number(index)];
  if (!item) return;
  bbcState.activeTransaction = item;
  bbcRenderDetail(item);
  const modal = bbc$("bbc-modal");
  if (modal) modal.hidden = false;
}

function bbcCloseDetail() {
  const modal = bbc$("bbc-modal");
  if (modal) modal.hidden = true;
  bbcState.activeTransaction = null;
}

function bbcRender() {
  bbcRenderSummary();
  bbcRenderTable();
  bbcRenderMobile();
  bbcUpdateOptions();
}

function bbcBindEvents() {
  ["bbc-group", "bbc-plate", "bbc-person", "bbc-date-from", "bbc-date-to", "bbc-status"].forEach(id => {
    const el = bbc$(id);
    if (!el) return;
    el.addEventListener("input", () => bbcLoadData());
    el.addEventListener("change", () => bbcLoadData());
  });
  bbc$("bbc-refresh")?.addEventListener("click", bbcLoadData);
  bbc$("bbc-close")?.addEventListener("click", bbcCloseDetail);
  bbc$("bbc-modal")?.addEventListener("click", event => {
    if (event.target?.id === "bbc-modal") bbcCloseDetail();
  });
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("[data-bbc-detail]");
    if (button) bbcOpenDetail(button.dataset.bbcDetail);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bbcSetAccess();
  bbcBindEvents();
  bbcRender();
  bbcLoadData();
});
