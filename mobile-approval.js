(function () {
  "use strict";

  // TODO: Role-based access required before production.
  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const state = { filter: "cash", statusView: "pending", records: [], selectedRecord: null, actionBusy: false, overviewShown: false };

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

  function showStatus(message, kind = "info") {
    const box = $("mobile-approval-status");
    box.hidden = false;
    box.textContent = message;
    box.className = `driver-mobile-status ${kind}`;
  }

  function hideStatus() {
    $("mobile-approval-status").hidden = true;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  function statusPending(record = {}) {
    const blob = [record.status, record.approval_status, record.approvalStatus, record.submission_status].map(text).join(" ").toLowerCase();
    if (!blob || blob.includes("draft")) return false;
    if (/(approved|paid|rejected|returned|cancelled|canceled)/.test(blob)) return false;
    return /(pending|for approval|submitted|for review)/.test(blob);
  }

  function statusCategory(record = {}) {
    const value = text(record.status).toLowerCase();
    if (/approved/.test(value)) return "approved";
    if (/return/.test(value)) return "returned";
    if (/reject/.test(value)) return "rejected";
    return "pending";
  }

  function cashType(record = {}) {
    const raw = text(record.request_type || record.requestType || record.type);
    if (/bali|cash advance/i.test(raw)) return "Bali";
    if (/trip.?budget|budget/i.test(raw)) return "Trip Budget";
    return "PO";
  }

  function commonRoute(record = {}) {
    return [record.source, record.destination || record.route].filter(Boolean).join(" -> ");
  }

  function requestItems(record = {}) {
    const rawItems = record.request_items || record.requestItems || record.repair_items || record.repairItems || record.labor_items || record.laborItems || record.items || [];
    return Array.isArray(rawItems)
      ? rawItems.map(item => {
        if (!item || typeof item !== "object") return text(item);
        return [
          item.name || item.item || item.description || item.part_name || item.labor || item.type,
          item.quantity || item.qty ? `x${item.quantity || item.qty}` : "",
          item.amount || item.cost || item.total ? money(item.amount || item.cost || item.total) : ""
        ].filter(Boolean).join(" ");
      }).filter(Boolean)
      : [];
  }

  function normalizeCash(record = {}) {
    return {
      internal_id: record.request_id || record.requestId || record.id,
      module: "cash",
      ref_id: record.request_no || record.requestNo || record.cash_ref_id || record.cashRefId || "",
      request_type: cashType(record),
      plate_number: record.plate_number || record.plateNumber || "",
      driver_name: record.driver_name || record.driverName || "",
      helper_name: record.helper_name || record.helperName || "",
      payee: record.receiver_name || record.receiverName || record.personName || record.payee || record.depositTo || "",
      amount: record.amount || "",
      source: record.source || "",
      destination: record.destination || record.route || "",
      route: commonRoute(record),
      submitted_at: record.created_at || record.createdAt || record.date || "",
      payment_status: record.payment_status || record.paymentStatus || "Unpaid",
      remarks: record.remarks || record.reason || "",
      return_reason: record.return_reason || record.revisionReason || record.payment_notes || "",
      items: requestItems(record),
      status: record.approval_status || record.approvalStatus || record.status || "Pending"
    };
  }

  function normalizeRepair(record = {}) {
    return {
      internal_id: record.request_id || record.requestId || record.id,
      module: "repair",
      ref_id: record.request_no || record.repair_ref_id || record.repairRefId || "",
      request_type: record.request_type || record.repair_type || "Repair / Labor",
      plate_number: record.plate_number || record.plateNumber || "",
      driver_name: record.driver_name || record.driverName || record.Driver || "",
      helper_name: record.helper_name || record.helperName || "",
      payee: record.payee_name || record.payee || record.requested_by || record.requestedBy || record.supplier_name || record.mechanic_name || "",
      amount: record.amount || record.total_cost || record.final_cost || record.approved_cost || "",
      source: "",
      destination: "",
      route: "",
      submitted_at: record.created_at || record.date_requested || "",
      payment_status: record.payment_status || record.paymentStatus || "Unpaid",
      remarks: record.remarks || record.description || record.issue || record.repair_item || record.item_description || "",
      return_reason: record.return_reason || record.revision_reason || "",
      items: requestItems(record),
      status: record.approval_status || record.status || "Pending"
    };
  }

  function normalizePayroll(record = {}) {
    const driverAmount = amountNumber(record.driver_net_pay ?? record.driverNetPay);
    const helperAmount = amountNumber(record.helper_net_pay ?? record.helperNetPay);
    const totalAmount = amountNumber(record.total_payable ?? record.totalPayable) ?? (driverAmount || 0) + (helperAmount || 0);
    return {
      internal_id: record.payroll_id || record.payrollId || record.id,
      module: "payroll",
      ref_id: record.payroll_ref_id || record.payrollRefId || "",
      request_type: "Payroll",
      plate_number: record.plate_number || record.plateNumber || "",
      driver_name: record.driver_name || record.driverName || "",
      helper_name: record.helper_name || record.helperName || "",
      payee: "",
      amount: totalAmount || "",
      driver_amount: driverAmount ?? "",
      helper_amount: helperAmount ?? "",
      payroll_period: record.payroll_period || record.period || record.payroll_date || "",
      source: "",
      destination: "",
      route: "",
      submitted_at: record.created_at || record.payroll_date || "",
      payment_status: record.payment_status || record.paymentStatus || "Unpaid",
      remarks: record.remarks || "",
      return_reason: record.revisionReason || record.approval_notes || "",
      items: requestItems(record.raw_data || record),
      status: record.approval_status || record.approvalStatus || record.status || "Pending"
    };
  }

  function normalizeTrip(record = {}) {
    return {
      internal_id: record.trip_ref_id || record.tripRefId,
      module: "driver-trip",
      ref_id: record.trip_ref_id || record.tripRefId || "",
      request_type: "Driver Trip",
      plate_number: record.plate_number || "",
      driver_name: record.driver_name || "",
      helper_name: record.helper_name || "",
      payee: "",
      amount: "",
      group_name: record.product_line || record.group_name || record.groupName || "",
      shipment_number: record.shipment_number || record.shipmentNumber || "",
      container_number: record.container_number || record.containerNumber || "",
      trip_date: record.trip_date || record.tripDate || "",
      source: record.source || "",
      destination: record.destination || "",
      route: commonRoute(record),
      submitted_at: record.created_at || record.trip_date || "",
      payment_status: "",
      remarks: record.remarks || "",
      return_reason: record.return_reason || "",
      items: [],
      status: record.submission_status || "Submitted"
    };
  }

  async function loadRecords() {
    const [cash, repair, payroll, trips] = await Promise.all([
      fetchJson(`${WORKER_API_BASE}/api/cash/list?limit=500`),
      fetchJson(`${WORKER_API_BASE}/api/repair/list?limit=500`),
      fetchJson(`${WORKER_API_BASE}/api/payroll/list?limit=500`),
      fetchJson(`${WORKER_API_BASE}/api/driver-trip/list?limit=500`)
    ]);
    return [
      ...(cash.records || []).map(normalizeCash),
      ...(repair.records || []).map(normalizeRepair),
      ...(payroll.records || []).map(normalizePayroll),
      ...(trips.records || []).map(normalizeTrip)
    ].filter(item => item.ref_id)
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
  }

  function visibleRecords() {
    let records = state.records;
    if (state.statusView === "history") records = records.filter(record => statusCategory(record) !== "pending");
    else if (state.statusView !== "all-loaded") records = records.filter(record => statusCategory(record) === state.statusView);
    if (state.filter !== "all") records = records.filter(record => record.module === state.filter);
    return records;
  }

  function badgeClass(status) {
    return `mobile-approval-status-badge status-${text(status).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "pending"}`;
  }

  function countByModule(module) {
    const pending = state.records.filter(record => statusCategory(record) === "pending");
    if (module === "all") return pending.length;
    return pending.filter(record => record.module === module).length;
  }

  function returnedCount() {
    return state.records.filter(record => /return/i.test(text(record.status))).length;
  }

  function historyCount() {
    return state.records.filter(record => statusCategory(record) !== "pending").length;
  }

  function forPaymentCount() {
    return state.records.filter(record => statusCategory(record) === "approved" && !/paid/i.test(text(record.payment_status))).length;
  }

  function updateCounts() {
    document.querySelectorAll("[data-count-for]").forEach(badge => {
      const count = countByModule(badge.dataset.countFor);
      badge.textContent = String(count);
      badge.classList.toggle("is-zero", count === 0);
    });
    const returned = returnedCount();
    const history = historyCount();
    const forPayment = forPaymentCount();
    const setCount = (selector, value) => {
      const item = document.querySelector(selector);
      if (item) item.textContent = String(value);
    };
    setCount('[data-app-count="pending"]', countByModule("all"));
    setCount('[data-app-count="history"]', history);
    setCount('[data-app-count="for-payment"]', forPayment);
    const summary = $("mobile-approval-summary");
    summary.hidden = false;
    const pendingBadge = document.querySelector('[data-state-count="for-approval"]');
    const historyBadge = document.querySelector('[data-state-count="approval-history"]');
    if (pendingBadge) pendingBadge.textContent = String(countByModule("all"));
    if (historyBadge) historyBadge.textContent = String(history);
  }

  function overviewMetric(label, value) {
    const clean = text(value);
    if (!clean) return "";
    return `<div class="mobile-reminder-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean)}</strong></div>`;
  }

  function showOverview() {
    if (state.overviewShown) return;
    state.overviewShown = true;
    const pending = state.records.filter(record => statusCategory(record) === "pending");
    const highest = pending
      .map(record => ({ record, amount: amountNumber(record.amount) }))
      .filter(item => item.amount !== null)
      .sort((a, b) => b.amount - a.amount)[0];
    const oldest = [...pending]
      .filter(record => record.submitted_at)
      .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))[0];
    $("mobile-approval-overview-body").innerHTML = `
      ${overviewMetric("Pending Approval", countByModule("all"))}
      ${overviewMetric("Cash / PO / Bali", countByModule("cash"))}
      ${overviewMetric("Repair / Labor", countByModule("repair"))}
      ${overviewMetric("Payroll", countByModule("payroll"))}
      ${overviewMetric("Driver Trips", countByModule("driver-trip"))}
      ${returnedCount() ? overviewMetric("Returned", returnedCount()) : ""}
      ${highest ? overviewMetric("Highest Amount", `${highest.record.ref_id} - ${money(highest.amount)}`) : ""}
      ${oldest ? overviewMetric("Oldest Pending", `${oldest.ref_id} - ${dateText(oldest.submitted_at)}`) : ""}
    `;
    $("mobile-approval-overview-backdrop").hidden = false;
    document.body.classList.add("mobile-approval-modal-open");
  }

  function closeOverview() {
    $("mobile-approval-overview-backdrop").hidden = true;
    if ($("mobile-approval-modal-backdrop").hidden) document.body.classList.remove("mobile-approval-modal-open");
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

  function setStatusView(view) {
    state.statusView = view;
    document.querySelectorAll("[data-approval-status-view]").forEach(item => item.classList.toggle("active", item.dataset.approvalStatusView === view));
    document.querySelectorAll("[data-approval-view]").forEach(item => {
      const itemView = item.dataset.approvalView === "history" ? "history" : "pending";
      item.classList.toggle("active", itemView === view || (view !== "pending" && view !== "all-loaded" && itemView === "history"));
    });
    render();
  }

  function renderApprovalCard(record) {
    const route = record.route || [record.source, record.destination].filter(Boolean).join(" -> ");
    if (record.module === "driver-trip") {
      return `
        ${metaRow("Type", "Driver Trip")}
        ${metaRow("Plate", record.plate_number)}
        ${metaRow("Driver", record.driver_name)}
        ${metaRow("Helper", record.helper_name)}
        ${metaRow("Group", record.group_name)}
        ${metaRow("Route", route)}
        ${metaRow("Shipping", record.shipment_number)}
        ${metaRow("Container", record.container_number)}
        ${metaRow("Trip Date", dateText(record.trip_date))}
        ${record.remarks ? `<p class="mobile-card-preview">${escapeHtml(shortText(record.remarks))}</p>` : ""}
      `;
    }
    if (record.module === "payroll") {
      const driverPay = amountNumber(record.driver_amount);
      const helperPay = amountNumber(record.helper_amount);
      const totalPay = amountNumber(record.amount);
      return `
        ${metaRow("Type", "Payroll")}
        ${metaRow("Plate", record.plate_number)}
        ${metaRow("Driver", record.driver_name)}
        ${metaRow("Helper", record.helper_name)}
        ${metaRow("Payroll Date", dateText(record.payroll_period || record.submitted_at))}
        ${driverPay ? amountLine(record.driver_amount, "Driver") : metaRow("Driver Pay", "Amount not set")}
        ${record.helper_name ? helperPay ? amountLine(record.helper_amount, "Helper") : metaRow("Helper Pay", "Amount not set") : ""}
        ${totalPay ? amountLine(record.amount, "Total") : metaRow("Total", "Amount not set")}
        ${record.remarks ? `<p class="mobile-card-preview">${escapeHtml(shortText(record.remarks))}</p>` : ""}
      `;
    }
    if (record.module === "repair") {
      return `
        ${metaRow("Type", record.request_type)}
        ${metaRow("Plate", record.plate_number)}
        ${metaRow("Driver", record.driver_name)}
        ${metaRow("Requested By", record.payee)}
        ${amountLine(record.amount)}
        ${record.items?.length ? metaRow("Items", shortText(record.items.join(", "))) : ""}
        ${record.remarks ? `<p class="mobile-card-preview">${escapeHtml(shortText(record.remarks))}</p>` : ""}
        ${metaRow("Submitted", dateText(record.submitted_at))}
      `;
    }
    return `
      ${metaRow("Type", record.request_type)}
      ${metaRow("Plate", record.plate_number)}
      ${metaRow("Driver", record.driver_name)}
      ${metaRow("Helper", record.helper_name)}
      ${metaRow("Payee", record.payee)}
      ${amountLine(record.amount)}
      ${metaRow("Route", route)}
      ${metaRow("Submitted", dateText(record.submitted_at))}
      ${record.remarks ? `<p class="mobile-card-preview">${escapeHtml(shortText(record.remarks))}</p>` : ""}
    `;
  }

  function render() {
    updateCounts();
    const records = visibleRecords();
    const list = $("mobile-approval-list");
    $("mobile-approval-list-title").textContent = state.statusView === "pending" ? "Needs Action" : state.statusView === "history" ? "Recently Updated" : "Recently Updated";
    if (!records.length) {
      const message = state.statusView === "pending" ? "No pending requests found." : "No approval history loaded yet.";
      list.innerHTML = `<section class="driver-mobile-card mobile-approval-card mobile-empty-state"><strong>${escapeHtml(message)}</strong><p>Only records returned by the current backend list endpoints are shown here.</p></section>`;
      return;
    }
    list.innerHTML = records.map((record, index) => `
      <article class="driver-mobile-card mobile-approval-card" data-index="${index}">
        <div class="mobile-approval-card-head">
          <strong>${escapeHtml(record.ref_id)}</strong>
          <span class="${badgeClass(record.status)}">${escapeHtml(record.status || "Pending")}</span>
        </div>
        ${renderApprovalCard(record)}
        ${statusCategory(record) === "pending" ? `
          <div class="mobile-approval-action-row">
            <button class="mobile-approval-secondary-btn" type="button" data-action="view" data-ref="${escapeHtml(record.ref_id)}">View Details</button>
            <button class="mobile-approval-primary-btn" type="button" data-action="approve" data-ref="${escapeHtml(record.ref_id)}">Approve</button>
            <button class="mobile-approval-secondary-btn" type="button" data-action="return" data-ref="${escapeHtml(record.ref_id)}">Return</button>
            <button class="mobile-approval-danger-btn" type="button" data-action="reject" data-ref="${escapeHtml(record.ref_id)}">Reject</button>
          </div>
        ` : `
          <div class="mobile-approval-action-row single">
            <button class="mobile-approval-secondary-btn" type="button" data-action="view" data-ref="${escapeHtml(record.ref_id)}">View Details</button>
          </div>
        `}
      </article>
    `).join("");
  }

  function findRecord(ref) {
    return state.records.find(record => record.ref_id === ref);
  }

  function detailRow(label, value) {
    const clean = text(value);
    if (!clean) return "";
    return `
      <div class="mobile-approval-detail-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(clean)}</dd>
      </div>
    `;
  }

  function openMobileApprovalDetails(record) {
    state.selectedRecord = record;
    $("mobile-approval-modal-title").textContent = record.ref_id || "Details";
    const items = Array.isArray(record.items) && record.items.length
      ? `<div class="mobile-approval-detail-row mobile-approval-detail-row-list"><dt>Request Items</dt><dd>${record.items.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</dd></div>`
      : "";
    $("mobile-approval-modal-body").innerHTML = `
      <dl>
        ${detailRow("Ref ID", record.ref_id)}
        ${detailRow("Type", record.request_type)}
        ${detailRow("Plate", record.plate_number)}
        ${detailRow("Driver", record.driver_name)}
        ${detailRow("Helper", record.helper_name)}
        ${detailRow("Payee", record.payee)}
        ${detailRow("Amount", money(record.amount))}
        ${detailRow("Source", record.source)}
        ${detailRow("Destination", record.destination)}
        ${detailRow("Date Submitted", dateText(record.submitted_at))}
        ${detailRow("Approval Status", record.status)}
        ${detailRow("Payment Status", record.payment_status)}
        ${detailRow("Group", record.group_name)}
        ${detailRow("Shipping Number", record.shipment_number)}
        ${detailRow("Container Number", record.container_number)}
        ${detailRow("Trip Date", dateText(record.trip_date))}
        ${detailRow("Payroll Date", dateText(record.payroll_period))}
        ${detailRow("Driver Amount", money(record.driver_amount))}
        ${detailRow("Helper Amount", money(record.helper_amount))}
        ${detailRow("Remarks / Reason", record.remarks)}
        ${detailRow("Return Reason", record.return_reason)}
        ${items}
      </dl>
    `;
    const actionBar = document.querySelector(".mobile-approval-modal-actions");
    if (actionBar) actionBar.hidden = statusCategory(record) !== "pending";
    $("mobile-approval-modal-backdrop").hidden = false;
    document.body.classList.add("mobile-approval-modal-open");
  }

  function closeMobileApprovalDetails() {
    $("mobile-approval-modal-backdrop").hidden = true;
    $("mobile-approval-modal-body").innerHTML = "";
    const actionBar = document.querySelector(".mobile-approval-modal-actions");
    if (actionBar) actionBar.hidden = false;
    state.selectedRecord = null;
    document.body.classList.remove("mobile-approval-modal-open");
  }

  async function updateRecord(record, status, notes = "") {
    const now = new Date().toISOString();
    if (record.module === "cash") {
      return fetchJson(`${WORKER_API_BASE}/api/cash/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: record.internal_id,
          status,
          approval_status: status,
          payment_status: status === "Approved" ? "Unpaid" : "Unpaid",
          approved_by: status === "Approved" ? "Mobile Approval" : "",
          approved_at: status === "Approved" ? now : "",
          notes
        })
      });
    }
    if (record.module === "repair") {
      return fetchJson(`${WORKER_API_BASE}/api/repair/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: record.internal_id,
          status,
          approval_status: status,
          repair_status: status,
          payment_status: status === "Approved" ? "Unpaid" : "Unpaid",
          approved_by: status === "Approved" ? "Mobile Approval" : "",
          approved_at: status === "Approved" ? now : "",
          notes
        })
      });
    }
    if (record.module === "payroll") {
      return fetchJson(`${WORKER_API_BASE}/api/payroll/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payroll_id: record.internal_id,
          status: status === "Approved" ? "Approved" : status,
          approval_status: status,
          payment_status: "Unpaid",
          approved_by: status === "Approved" ? "Mobile Approval" : "",
          approved_at: status === "Approved" ? now : ""
        })
      });
    }
    return fetchJson(`${WORKER_API_BASE}/api/driver-trip/update-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_ref_id: record.internal_id,
        submission_status: status,
        remarks: notes || record.remarks
      })
    });
  }

  async function handleAction(action, ref) {
    const record = findRecord(ref);
    if (!record) return;
    if (action === "view") {
      openMobileApprovalDetails(record);
      return;
    }
    if (state.actionBusy) return;
    let status = "Approved";
    let notes = "";
    if (action === "return") {
      notes = prompt("Reason for return?") || "";
      status = "Returned";
      if (!notes && !confirm("Return without reason?")) return;
    }
    if (action === "reject") {
      if (!confirm(`Reject ${record.ref_id}?`)) return;
      notes = prompt("Reason for rejection?") || "";
      status = "Rejected";
    }
    if (action === "approve" && !confirm(`Approve ${record.ref_id}?`)) return;

    state.actionBusy = true;
    showStatus(`${status === "Approved" ? "Approving" : "Updating"} ${record.ref_id}...`, "info");
    try {
      await updateRecord(record, status, notes);
      showStatus(`${status}: ${record.ref_id}`, "success");
      if (state.selectedRecord?.ref_id === record.ref_id) closeMobileApprovalDetails();
      record.status = status;
      record.return_reason = notes || record.return_reason;
      if (status === "Approved") record.payment_status = record.payment_status || "Unpaid";
      render();
    } catch (error) {
      showStatus(`Update failed. ${error.message || ""}`.trim(), "error");
    } finally {
      state.actionBusy = false;
    }
  }

  async function init() {
    showStatus("Loading pending requests...", "info");
    try {
      state.records = await loadRecords();
      hideStatus();
      render();
      showOverview();
    } catch (error) {
      showStatus(`Unable to load approval list. ${error.message || ""}`.trim(), "error");
      render();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
        render();
      });
    });
    document.querySelectorAll("[data-approval-status-view]").forEach(button => {
      button.addEventListener("click", () => setStatusView(button.dataset.approvalStatusView));
    });
    document.querySelectorAll("[data-approval-view]").forEach(button => {
      button.addEventListener("click", () => setStatusView(button.dataset.approvalView));
    });
    document.querySelectorAll("[data-approval-shortcut]").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.approvalShortcut === "payment") window.location.href = "mobile-payment.html";
      });
    });
    $("mobile-approval-notifications").addEventListener("click", enableNotifications);
    $("mobile-approval-list").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      handleAction(button.dataset.action, button.dataset.ref);
    });
    $("mobile-approval-modal-close").addEventListener("click", closeMobileApprovalDetails);
    $("mobile-approval-modal-backdrop").addEventListener("click", event => {
      if (event.target.id === "mobile-approval-modal-backdrop") closeMobileApprovalDetails();
    });
    $("mobile-approval-modal").addEventListener("click", event => event.stopPropagation());
    $("mobile-approval-overview-close").addEventListener("click", closeOverview);
    $("mobile-approval-overview-start").addEventListener("click", closeOverview);
    $("mobile-approval-overview-secondary").addEventListener("click", closeOverview);
    $("mobile-approval-overview-backdrop").addEventListener("click", event => {
      if (event.target.id === "mobile-approval-overview-backdrop") closeOverview();
    });
    document.querySelectorAll("[data-modal-action]").forEach(button => {
      button.addEventListener("click", () => {
        if (!state.selectedRecord) return;
        handleAction(button.dataset.modalAction, state.selectedRecord.ref_id);
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!$("mobile-approval-overview-backdrop").hidden) closeOverview();
      else if (!$("mobile-approval-modal-backdrop").hidden) closeMobileApprovalDetails();
    });
    init();
  });
})();
