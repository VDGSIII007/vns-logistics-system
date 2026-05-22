(function () {
  "use strict";

  // TODO: Role-based access required before production.
  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const state = { filter: "cash", view: "for-payment", records: [], selected: null, paymentTarget: null, busy: false, overviewShown: false };

  const $ = (id) => document.getElementById(id);

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(number);
  }

  function amountNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  function shortText(value, limit = 92) {
    const clean = text(value).replace(/\s+/g, " ");
    return clean.length > limit ? `${clean.slice(0, limit - 1)}...` : clean;
  }

  function metaRow(label, value) {
    const clean = text(value);
    if (!clean) return "";
    return `<p><span class="mobile-card-label">${escapeHtml(label)}:</span> ${escapeHtml(clean)}</p>`;
  }

  function amountLine(value, label = "Amount") {
    const formatted = money(value);
    return formatted ? `<p class="mobile-card-amount"><span>${escapeHtml(label)}</span>${escapeHtml(formatted)}</p>` : "";
  }

  function isoFromDateInput(value) {
    const raw = text(value);
    if (!raw) return "";
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function showStatus(message, kind = "info") {
    const box = $("mobile-payment-status");
    box.hidden = false;
    box.textContent = message;
    box.className = `driver-mobile-status ${kind}`;
  }

  function hideStatus() {
    $("mobile-payment-status").hidden = true;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  function paymentRef(record = {}) {
    return text(record.payment_ref_id || record.paymentRefId || record.Payment_Ref_ID || record.payment_reference || record.paymentReference || record.Payment_Reference);
  }

  function isPaidStatus(value) {
    return /^(paid|deposited|released|used|completed|done)$/i.test(text(value));
  }

  function isCashReady(record = {}) {
    const approved = /approved/i.test(text(record.approval_status || record.approvalStatus || record.status || record.Status));
    const paid = isPaidStatus(record.payment_status || record.paymentStatus || record.status || record.Status);
    return approved || paid;
  }

  function isRepairReady(record = {}) {
    const approved = /approved|for payment|for release/i.test(text(record.approval_status || record.approvalStatus || record.status || record.Status));
    const paid = isPaidStatus(record.payment_status || record.paymentStatus || record.status || record.Status);
    return approved || paid;
  }

  function isPayrollReady(record = {}) {
    const approved = /approved/i.test(text(record.approval_status || record.approvalStatus || record.status || record.Status));
    const paid = isPaidStatus(record.payment_status || record.paymentStatus || record.status || record.Status);
    return approved || paid;
  }

  function cashType(record = {}) {
    const raw = text(record.request_type || record.requestType || record.type);
    if (/bali|cash advance/i.test(raw)) return "Bali";
    if (/trip.?budget|budget/i.test(raw)) return "Trip Budget";
    return "PO";
  }

  function route(record = {}) {
    return [record.source, record.destination || record.route].filter(Boolean).join(" -> ");
  }

  function normalizeCash(record = {}) {
    return {
      internal_id: text(record.request_id || record.requestId || record.id),
      module: "cash",
      ref_id: text(record.request_no || record.requestNo || record.cash_ref_id || record.cashRefId),
      payment_ref_id: paymentRef(record),
      request_type: cashType(record),
      plate_number: text(record.plate_number || record.plateNumber),
      driver_name: text(record.driver_name || record.driverName),
      helper_name: text(record.helper_name || record.helperName),
      payee: text(record.receiver_name || record.receiverName || record.personName || record.payee || record.depositTo),
      account_number: text(record.account_number || record.accountNumber || record.depositNumber),
      amount: record.amount || "",
      source: text(record.source),
      destination: text(record.destination || record.route),
      route: route(record),
      approval_status: text(record.approval_status || record.approvalStatus || record.status || "Approved"),
      payment_status: text(record.payment_status || record.paymentStatus || "Unpaid"),
      approved_by: text(record.approved_by || record.approvedBy),
      approved_at: text(record.approved_at || record.approvedAt),
      paid_at: text(record.paid_at || record.paidAt),
      payment_reference: text(record.payment_reference || record.paymentReference),
      payment_notes: text(record.payment_notes || record.paymentNotes || record.remarks),
      remarks: text(record.remarks || record.reason),
      raw: record
    };
  }

  function normalizeRepair(record = {}) {
    return {
      internal_id: text(record.request_id || record.requestId || record.Request_ID || record.id),
      module: "repair",
      ref_id: text(record.request_no || record.requestNo || record.repair_ref_id || record.repairRefId),
      payment_ref_id: paymentRef(record),
      request_type: text(record.request_type || record.requestType || record.Request_Type || "Repair / Labor"),
      plate_number: text(record.plate_number || record.plateNumber || record.Plate_Number),
      driver_name: text(record.driver_name || record.driverName || record.Driver),
      helper_name: text(record.helper_name || record.helperName || record.Helper),
      payee: text(record.payee_name || record.payee || record.Payee || record.mechanic_name || record.supplier_name || record.Supplier),
      account_number: text(record.account_number || record.accountNumber),
      amount: record.final_cost || record.Final_Cost || record.approved_cost || record.Approved_Cost || record.total_cost || record.Total_Cost || "",
      source: "",
      destination: "",
      route: "",
      approval_status: text(record.approval_status || record.approvalStatus || record.Approval_Status || record.status || "Approved"),
      payment_status: text(record.payment_status || record.paymentStatus || record.Payment_Status || "Unpaid"),
      approved_by: text(record.approved_by || record.approvedBy || record.Approved_By),
      approved_at: text(record.approved_at || record.approvedAt || record.Approved_At),
      paid_at: text(record.paid_at || record.paidAt || record.Paid_At),
      payment_reference: text(record.payment_reference || record.paymentReference || record.Payment_Reference),
      payment_notes: text(record.payment_notes || record.paymentNotes || record.remarks || record.Remarks),
      remarks: text(record.remarks || record.Remarks || record.description || record.Description || record.issue || record.repair_item),
      raw: record
    };
  }

  function normalizePayroll(record = {}) {
    const driverAmount = Number(record.driver_net_pay ?? record.driverNetPay ?? 0) || 0;
    const helperAmount = Number(record.helper_net_pay ?? record.helperNetPay ?? 0) || 0;
    const driverStatus = text(record.driver_payment_status || record.driverPaymentStatus || "Unpaid");
    const helperStatus = text(record.helper_payment_status || record.helperPaymentStatus || "Unpaid");
    const hasHelper = Boolean(text(record.helper_name || record.helperName));
    const fullyPaid = driverStatus === "Paid" && (!hasHelper || helperStatus === "Paid");
    return {
      internal_id: text(record.payroll_id || record.payrollId || record.id),
      module: "payroll",
      ref_id: text(record.payroll_ref_id || record.payrollRefId),
      payment_ref_id: paymentRef(record),
      request_type: "Payroll",
      plate_number: text(record.plate_number || record.plateNumber),
      driver_name: text(record.driver_name || record.driverName),
      helper_name: text(record.helper_name || record.helperName),
      payee: text([record.driver_name || record.driverName, record.helper_name || record.helperName].filter(Boolean).join(" / ")),
      account_number: "",
      amount: driverAmount + helperAmount,
      driver_amount: driverAmount,
      helper_amount: helperAmount,
      driver_payment_status: driverStatus,
      helper_payment_status: helperStatus,
      driver_paid_at: text(record.driver_paid_at || record.driverPaidAt),
      helper_paid_at: text(record.helper_paid_at || record.helperPaidAt),
      driver_payment_ref_id: text(record.driver_payment_ref_id || record.driverPaymentRefId),
      helper_payment_ref_id: text(record.helper_payment_ref_id || record.helperPaymentRefId),
      payroll_period: text(record.payroll_period || record.period || record.payroll_date || record.payrollDate),
      source: "",
      destination: "",
      route: "",
      approval_status: text(record.approval_status || record.approvalStatus || record.status || "Approved"),
      payment_status: fullyPaid ? "Paid" : text(record.payment_status || record.paymentStatus || "Unpaid"),
      approved_by: text(record.approved_by || record.approvedBy),
      approved_at: text(record.approved_at || record.approvedAt),
      paid_at: text(record.paid_at || record.paidAt),
      payment_reference: text(record.payment_reference || record.paymentReference),
      payment_notes: text(record.payment_notes || record.paymentNotes || record.remarks),
      remarks: text(record.remarks),
      raw: record
    };
  }

  async function loadRecords() {
    const [cash, repair, payroll] = await Promise.all([
      fetchJson(`${WORKER_API_BASE}/api/cash/list?limit=500`),
      fetchJson(`${WORKER_API_BASE}/api/repair/list?limit=500`),
      fetchJson(`${WORKER_API_BASE}/api/payroll/list?limit=500`)
    ]);
    return [
      ...(cash.records || []).filter(isCashReady).map(normalizeCash),
      ...(repair.records || []).filter(isRepairReady).map(normalizeRepair),
      ...(payroll.records || []).filter(isPayrollReady).map(normalizePayroll)
    ].filter(item => item.ref_id)
      .sort((a, b) => String(b.approved_at || b.paid_at || "").localeCompare(String(a.approved_at || a.paid_at || "")));
  }

  function visibleRecords() {
    let records = state.records;
    if (state.view === "for-payment") records = records.filter(record => statusLabel(record) !== "Paid");
    if (state.view === "paid") records = records.filter(record => statusLabel(record) === "Paid");
    if (state.view === "paid-today") records = records.filter(record => statusLabel(record) === "Paid" && text(record.paid_at).slice(0, 10) === today());
    if (state.view === "history") records = records.filter(record => statusLabel(record) === "Paid");
    if (state.filter !== "all") records = records.filter(record => record.module === state.filter);
    return records;
  }

  function statusLabel(record) {
    if (record.module === "payroll" && record.payment_status !== "Paid") {
      const driverPaid = record.driver_payment_status === "Paid";
      const helperPaid = !record.helper_name || record.helper_payment_status === "Paid";
      if (driverPaid || helperPaid) return "Partially Paid";
    }
    if (isPaidStatus(record.payment_status)) return "Paid";
    return "For Payment";
  }

  function badgeClass(record) {
    return `mobile-payment-status-badge status-${statusLabel(record).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  function findRecord(ref) {
    return state.records.find(record => record.ref_id === ref);
  }

  function unpaidRecords() {
    return state.records.filter(record => statusLabel(record) !== "Paid");
  }

  function countByModule(module) {
    const records = unpaidRecords();
    if (module === "all") return records.length;
    return records.filter(record => record.module === module).length;
  }

  function paidCount() {
    return state.records.filter(record => statusLabel(record) === "Paid").length;
  }

  function paidTodayCount() {
    const day = today();
    return state.records.filter(record => statusLabel(record) === "Paid" && text(record.paid_at).slice(0, 10) === day).length;
  }

  function updateCounts() {
    document.querySelectorAll("[data-payment-count-for]").forEach(badge => {
      const count = countByModule(badge.dataset.paymentCountFor);
      badge.textContent = String(count);
      badge.classList.toggle("is-zero", count === 0);
    });
    const paid = paidCount();
    const setCount = (selector, value) => {
      const item = document.querySelector(selector);
      if (item) item.textContent = String(value);
    };
    setCount('[data-payment-app-count="for-payment"]', countByModule("all"));
    setCount('[data-payment-app-count="paid-today"]', paidTodayCount());
    setCount('[data-payment-app-count="history"]', paid);
    const summary = $("mobile-payment-summary");
    summary.hidden = false;
    const forPaymentBadge = document.querySelector('[data-payment-state-count="for-payment"]');
    const historyBadge = document.querySelector('[data-payment-state-count="payment-history"]');
    if (forPaymentBadge) forPaymentBadge.textContent = String(countByModule("all"));
    if (historyBadge) historyBadge.textContent = String(paid);
  }

  function overviewMetric(label, value) {
    const clean = text(value);
    if (!clean) return "";
    return `<div class="mobile-reminder-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean)}</strong></div>`;
  }

  function showOverview() {
    if (state.overviewShown) return;
    state.overviewShown = true;
    const unpaid = unpaidRecords();
    const total = unpaid.reduce((sum, record) => sum + (amountNumber(record.amount) || 0), 0);
    const highest = unpaid
      .map(record => ({ record, amount: amountNumber(record.amount) }))
      .filter(item => item.amount !== null)
      .sort((a, b) => b.amount - a.amount)[0];
    const oldest = unpaid
      .filter(record => record.approved_at)
      .sort((a, b) => String(a.approved_at).localeCompare(String(b.approved_at)))[0];
    $("mobile-payment-overview-body").innerHTML = `
      ${overviewMetric("For Payment", unpaid.length)}
      ${overviewMetric("Cash / PO / Bali", countByModule("cash"))}
      ${overviewMetric("Repair / Labor", countByModule("repair"))}
      ${overviewMetric("Payroll", countByModule("payroll"))}
      ${total ? overviewMetric("Total Unpaid", money(total)) : ""}
      ${overviewMetric("Paid Today", paidTodayCount())}
      ${highest ? overviewMetric("Highest Unpaid", `${highest.record.ref_id} - ${money(highest.amount)}`) : ""}
      ${oldest ? overviewMetric("Oldest Approved", `${oldest.ref_id} - ${dateText(oldest.approved_at)}`) : ""}
    `;
    $("mobile-payment-overview-backdrop").hidden = false;
    document.body.classList.add("mobile-payment-modal-open");
  }

  function closeOverview() {
    $("mobile-payment-overview-backdrop").hidden = true;
    if ($("mobile-payment-details-backdrop").hidden && $("mobile-payment-form-backdrop").hidden) document.body.classList.remove("mobile-payment-modal-open");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      showStatus("Notifications are not supported on this browser.", "info");
      return;
    }
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") {
      showStatus("Notifications are enabled on this device.", "success");
      return;
    }
    showStatus("Notifications are blocked in this browser. You can enable them in browser settings.", "error");
  }

  function setPaymentView(view) {
    state.view = view;
    const tabView = view === "paid-today" ? "history" : view;
    document.querySelectorAll("[data-payment-view-tab]").forEach(item => item.classList.toggle("active", item.dataset.paymentViewTab === tabView));
    document.querySelectorAll("[data-payment-view]").forEach(item => item.classList.toggle("active", item.dataset.paymentView === view));
    render();
  }

  function renderPaymentCard(record) {
    if (record.module === "payroll") {
      const driverPay = amountNumber(record.driver_amount);
      const helperPay = amountNumber(record.helper_amount);
      const totalPay = amountNumber(record.amount);
      return `
        ${metaRow("Type", "Payroll")}
        ${metaRow("Plate", record.plate_number)}
        ${metaRow("Driver", record.driver_name)}
        ${metaRow("Helper", record.helper_name)}
        ${metaRow("Payroll Date", dateText(record.payroll_period || record.approved_at))}
        ${driverPay ? amountLine(record.driver_amount, `Driver ${record.driver_payment_status || ""}`.trim()) : metaRow("Driver Pay", "Amount not set")}
        ${record.helper_name ? helperPay ? amountLine(record.helper_amount, `Helper ${record.helper_payment_status || ""}`.trim()) : metaRow("Helper Pay", "Amount not set") : ""}
        ${totalPay ? amountLine(record.amount, "Total") : metaRow("Total", "Amount not set")}
        ${metaRow("Driver Ref", record.driver_payment_ref_id)}
        ${metaRow("Helper Ref", record.helper_payment_ref_id)}
        ${metaRow("Approval", dateText(record.approved_at))}
      `;
    }
    if (record.module === "repair") {
      return `
        ${metaRow("Type", record.request_type)}
        ${metaRow("Plate", record.plate_number)}
        ${metaRow("Payee", record.payee)}
        ${amountLine(record.amount)}
        ${metaRow("Approval", dateText(record.approved_at))}
        ${metaRow("Payment", record.payment_status)}
      `;
    }
    return `
      ${metaRow("Type", record.request_type)}
      ${metaRow("Plate", record.plate_number)}
      ${metaRow("Driver", record.driver_name)}
      ${metaRow("Helper", record.helper_name)}
      ${metaRow("Payee", record.payee)}
      ${amountLine(record.amount)}
      ${metaRow("Route", record.route)}
      ${metaRow("Approval", dateText(record.approved_at))}
      ${metaRow("Payment", record.payment_status)}
    `;
  }

  function render() {
    updateCounts();
    const list = $("mobile-payment-list");
    const records = visibleRecords();
    $("mobile-payment-list-title").textContent = state.view === "for-payment" ? "Needs Action" : "Recently Updated";
    if (!records.length) {
      const message = state.view === "for-payment" ? "No records for payment right now." : "No payment history loaded yet.";
      list.innerHTML = `<section class="driver-mobile-card mobile-payment-card mobile-empty-state"><strong>${escapeHtml(message)}</strong><p>Only records returned by the current backend list endpoints are shown here.</p></section>`;
      return;
    }
    list.innerHTML = records.map(record => {
      const paid = statusLabel(record) === "Paid";
      return `
        <article class="driver-mobile-card mobile-payment-card">
          <div class="mobile-payment-card-head">
            <strong>${escapeHtml(record.ref_id)}</strong>
            <span class="${badgeClass(record)}">${escapeHtml(statusLabel(record))}</span>
          </div>
          ${renderPaymentCard(record)}
          <div class="mobile-payment-action-row">
            <button class="mobile-payment-secondary-btn" type="button" data-action="view" data-ref="${escapeHtml(record.ref_id)}">View Details</button>
            ${paid ? `<button class="mobile-payment-secondary-btn" type="button" disabled>Paid</button>` : `<button class="mobile-payment-primary-btn" type="button" data-action="pay" data-ref="${escapeHtml(record.ref_id)}">${record.module === "payroll" ? "Split Pay" : "Mark as Paid"}</button>`}
          </div>
        </article>
      `;
    }).join("");
  }

  function detailRow(label, value) {
    const clean = text(value);
    if (!clean) return "";
    return `<div class="mobile-payment-detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(clean)}</dd></div>`;
  }

  function detailActions(record) {
    if (statusLabel(record) === "Paid") return `<button class="mobile-payment-secondary-btn" type="button" disabled>Paid</button>`;
    if (record.module === "payroll") {
      const driverBtn = record.driver_payment_status === "Paid"
        ? `<button class="mobile-payment-secondary-btn" type="button" disabled>Driver Paid</button>`
        : `<button class="mobile-payment-primary-btn" type="button" data-modal-pay="driver">Mark Driver as Paid</button>`;
      const helperBtn = !record.helper_name
        ? ""
        : record.helper_payment_status === "Paid"
          ? `<button class="mobile-payment-secondary-btn" type="button" disabled>Helper Paid</button>`
          : `<button class="mobile-payment-primary-btn" type="button" data-modal-pay="helper">Mark Helper as Paid</button>`;
      return `${driverBtn}${helperBtn}`;
    }
    return `<button class="mobile-payment-primary-btn" type="button" data-modal-pay="record">Mark as Paid</button>`;
  }

  function openDetails(record) {
    state.selected = record;
    $("mobile-payment-details-title").textContent = record.ref_id;
    $("mobile-payment-details-body").innerHTML = `
      <dl>
        ${detailRow("Ref ID", record.ref_id)}
        ${detailRow("Payment Ref ID", record.payment_ref_id)}
        ${detailRow("Type", record.request_type)}
        ${detailRow("Plate", record.plate_number)}
        ${detailRow("Driver", record.driver_name)}
        ${detailRow("Helper", record.helper_name)}
        ${detailRow("Payee", record.payee)}
        ${detailRow("Account / GCash", record.account_number)}
        ${detailRow("Amount", money(record.amount))}
        ${detailRow("Source", record.source)}
        ${detailRow("Destination", record.destination)}
        ${detailRow("Approval Status", record.approval_status)}
        ${detailRow("Payment Status", record.payment_status)}
        ${detailRow("Approved By", record.approved_by)}
        ${detailRow("Approved At", dateText(record.approved_at))}
        ${detailRow("Payment Date", dateText(record.paid_at))}
        ${detailRow("External Reference", record.payment_reference)}
        ${detailRow("Notes / Remarks", record.payment_notes || record.remarks)}
        ${record.module === "payroll" ? detailRow("Driver Payment", `${record.driver_payment_status}${record.driver_amount ? ` - ${money(record.driver_amount)}` : ""}`) : ""}
        ${record.module === "payroll" ? detailRow("Helper Payment", record.helper_name ? `${record.helper_payment_status}${record.helper_amount ? ` - ${money(record.helper_amount)}` : ""}` : "") : ""}
        ${record.module === "payroll" ? detailRow("Driver Paid At", dateText(record.driver_paid_at)) : ""}
        ${record.module === "payroll" ? detailRow("Helper Paid At", dateText(record.helper_paid_at)) : ""}
      </dl>
    `;
    $("mobile-payment-details-actions").innerHTML = detailActions(record);
    $("mobile-payment-details-backdrop").hidden = false;
    document.body.classList.add("mobile-payment-modal-open");
  }

  function closeDetails() {
    $("mobile-payment-details-backdrop").hidden = true;
    $("mobile-payment-details-body").innerHTML = "";
    $("mobile-payment-details-actions").innerHTML = "";
    state.selected = null;
    if ($("mobile-payment-form-backdrop").hidden) document.body.classList.remove("mobile-payment-modal-open");
  }

  function openPayModal(record, person = "") {
    if (statusLabel(record) === "Paid" && !person) return;
    state.paymentTarget = { ref: record.ref_id, person };
    $("mobile-payment-form-title").textContent = record.module === "payroll" && person
      ? `Mark ${person === "driver" ? "Driver" : "Helper"} as Paid`
      : "Mark as Paid";
    $("mobile-payment-form-summary").innerHTML = `
      <strong>${escapeHtml(record.ref_id)}</strong>
      <span>${escapeHtml(record.request_type)}</span>
      <span>${escapeHtml(person ? `${person === "driver" ? record.driver_name : record.helper_name} - ${money(person === "driver" ? record.driver_amount : record.helper_amount)}` : money(record.amount))}</span>
    `;
    $("mobile-payment-date").value = today();
    $("mobile-payment-reference").value = "";
    $("mobile-payment-notes").value = "";
    $("mobile-payment-confirm").textContent = record.module === "payroll" && person
      ? `Mark ${person === "driver" ? "Driver" : "Helper"} as Paid`
      : "Confirm Payment";
    $("mobile-payment-form-backdrop").hidden = false;
    document.body.classList.add("mobile-payment-modal-open");
  }

  function closePayModal() {
    $("mobile-payment-form-backdrop").hidden = true;
    state.paymentTarget = null;
    if ($("mobile-payment-details-backdrop").hidden) document.body.classList.remove("mobile-payment-modal-open");
  }

  async function notifyPaid(module) {
    fetch(`${WORKER_API_BASE}/api/push/notify-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module })
    }).catch(error => console.warn("Payment notify-paid push failed.", error));
  }

  function paymentRefFromResult(result = {}, person = "") {
    const record = result.record || result.records?.[0] || {};
    if (person === "driver") return text(record.driver_payment_ref_id || record.driverPaymentRefId || result.driver_payment_ref_id || result.driverPaymentRefId) || paymentRef(record) || paymentRef(result);
    if (person === "helper") return text(record.helper_payment_ref_id || record.helperPaymentRefId || result.helper_payment_ref_id || result.helperPaymentRefId) || paymentRef(record) || paymentRef(result);
    return paymentRef(record) || paymentRef(result);
  }

  async function markPaid(record, person, paymentDate, paymentReference, paymentNotes) {
    const paidAt = isoFromDateInput(paymentDate);
    if (!paidAt) throw new Error("Payment date is required.");
    const common = {
      payment_reference: paymentReference,
      payment_notes: paymentNotes,
      paid_at: paidAt,
      paid_by: "Mobile Payment"
    };
    if (record.module === "cash") {
      return fetchJson(`${WORKER_API_BASE}/api/cash/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: record.internal_id, status: "Paid", payment_status: "Paid", ...common })
      });
    }
    if (record.module === "repair") {
      return fetchJson(`${WORKER_API_BASE}/api/repair/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: record.internal_id, status: "Paid", payment_status: "Paid", ...common })
      });
    }
    const driverPaid = person === "driver" || record.driver_payment_status === "Paid";
    const helperPaid = !record.helper_name || person === "helper" || record.helper_payment_status === "Paid";
    const payload = {
      payroll_id: record.internal_id,
      approval_status: "Approved"
    };
    if (person === "driver") {
      payload.driver_payment_status = "Paid";
      payload.driver_payment_reference = paymentReference;
      payload.driver_payment_notes = paymentNotes;
      payload.driver_paid_at = paidAt;
    }
    if (person === "helper") {
      payload.helper_payment_status = "Paid";
      payload.helper_payment_reference = paymentReference;
      payload.helper_payment_notes = paymentNotes;
      payload.helper_paid_at = paidAt;
    }
    if (driverPaid && helperPaid) {
      payload.status = "Paid";
      payload.payment_status = "Paid";
      payload.paid_at = paidAt;
      payload.payment_reference = paymentReference;
      payload.payment_notes = paymentNotes;
    }
    return fetchJson(`${WORKER_API_BASE}/api/payroll/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  function updateLocalPaid(record, person, result) {
    const ref = paymentRefFromResult(result, person);
    if (record.module !== "payroll") {
      record.payment_status = "Paid";
      record.payment_ref_id = ref || record.payment_ref_id;
      record.paid_at = $("mobile-payment-date").value;
      return ref;
    }
    if (person === "driver") {
      record.driver_payment_status = "Paid";
      record.driver_payment_ref_id = ref || record.driver_payment_ref_id;
      record.driver_paid_at = $("mobile-payment-date").value;
    }
    if (person === "helper") {
      record.helper_payment_status = "Paid";
      record.helper_payment_ref_id = ref || record.helper_payment_ref_id;
      record.helper_paid_at = $("mobile-payment-date").value;
    }
    if (record.driver_payment_status === "Paid" && (!record.helper_name || record.helper_payment_status === "Paid")) {
      record.payment_status = "Paid";
      record.paid_at = $("mobile-payment-date").value;
    }
    return ref;
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();
    if (state.busy || !state.paymentTarget) return;
    const record = findRecord(state.paymentTarget.ref);
    if (!record) return;
    const person = state.paymentTarget.person;
    const date = $("mobile-payment-date").value;
    const reference = $("mobile-payment-reference").value.trim();
    const notes = $("mobile-payment-notes").value.trim();
    state.busy = true;
    $("mobile-payment-confirm").disabled = true;
    $("mobile-payment-confirm").textContent = "Submitting...";
    try {
      const result = await markPaid(record, person, date, reference, notes);
      const ref = updateLocalPaid(record, person, result);
      await notifyPaid(record.module);
      closePayModal();
      if (state.selected?.ref_id === record.ref_id) closeDetails();
      render();
      showStatus(`Payment completed${ref ? `. Ref ID: ${ref}` : "."}`, "success");
    } catch (error) {
      showStatus(`Payment failed. ${error.message || ""}`.trim(), "error");
    } finally {
      state.busy = false;
      $("mobile-payment-confirm").disabled = false;
      $("mobile-payment-confirm").textContent = "Confirm Payment";
    }
  }

  async function init() {
    showStatus("Loading approved requests...", "info");
    try {
      state.records = await loadRecords();
      hideStatus();
      render();
      showOverview();
    } catch (error) {
      showStatus(`Unable to load payment list. ${error.message || ""}`.trim(), "error");
      render();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-payment-filter]").forEach(button => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.paymentFilter;
        document.querySelectorAll("[data-payment-filter]").forEach(item => item.classList.toggle("active", item === button));
        render();
      });
    });
    document.querySelectorAll("[data-payment-view-tab]").forEach(button => {
      button.addEventListener("click", () => setPaymentView(button.dataset.paymentViewTab));
    });
    document.querySelectorAll("[data-payment-view]").forEach(button => {
      button.addEventListener("click", () => setPaymentView(button.dataset.paymentView));
    });
    $("mobile-payment-notifications").addEventListener("click", enableNotifications);
    $("mobile-payment-list").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const record = findRecord(button.dataset.ref);
      if (!record) return;
      if (button.dataset.action === "view") openDetails(record);
      if (button.dataset.action === "pay") {
        if (record.module === "payroll") openDetails(record);
        else openPayModal(record, "");
      }
    });
    $("mobile-payment-details-actions").addEventListener("click", event => {
      const button = event.target.closest("[data-modal-pay]");
      if (!button || !state.selected) return;
      openPayModal(state.selected, button.dataset.modalPay === "record" ? "" : button.dataset.modalPay);
    });
    $("mobile-payment-details-close").addEventListener("click", closeDetails);
    $("mobile-payment-details-backdrop").addEventListener("click", event => {
      if (event.target.id === "mobile-payment-details-backdrop") closeDetails();
    });
    $("mobile-payment-form-close").addEventListener("click", closePayModal);
    $("mobile-payment-cancel").addEventListener("click", closePayModal);
    $("mobile-payment-form-backdrop").addEventListener("click", event => {
      if (event.target.id === "mobile-payment-form-backdrop") closePayModal();
    });
    $("mobile-payment-form").addEventListener("submit", handlePaymentSubmit);
    $("mobile-payment-overview-close").addEventListener("click", closeOverview);
    $("mobile-payment-overview-start").addEventListener("click", closeOverview);
    $("mobile-payment-overview-secondary").addEventListener("click", closeOverview);
    $("mobile-payment-overview-backdrop").addEventListener("click", event => {
      if (event.target.id === "mobile-payment-overview-backdrop") closeOverview();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!$("mobile-payment-overview-backdrop").hidden) closeOverview();
      else if (!$("mobile-payment-form-backdrop").hidden) closePayModal();
      else if (!$("mobile-payment-details-backdrop").hidden) closeDetails();
    });
    init();
  });
})();
