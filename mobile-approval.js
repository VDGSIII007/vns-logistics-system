(function () {
  "use strict";

  // TODO: Role-based access required before production.
  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const state = { filter: "all", records: [], selectedRecord: null, actionBusy: false };

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
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number === 0) return "";
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(number);
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
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
      payee: record.receiver_name || record.personName || "",
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
      driver_name: record.driver_name || "",
      helper_name: record.helper_name || "",
      payee: record.payee_name || record.supplier_name || "",
      amount: record.amount || record.total_cost || record.final_cost || "",
      source: "",
      destination: "",
      route: "",
      submitted_at: record.created_at || record.date_requested || "",
      payment_status: record.payment_status || record.paymentStatus || "Unpaid",
      remarks: record.remarks || record.description || "",
      return_reason: record.return_reason || record.revision_reason || "",
      items: requestItems(record),
      status: record.approval_status || record.status || "Pending"
    };
  }

  function normalizePayroll(record = {}) {
    return {
      internal_id: record.payroll_id || record.payrollId || record.id,
      module: "payroll",
      ref_id: record.payroll_ref_id || record.payrollRefId || "",
      request_type: "Payroll",
      plate_number: record.plate_number || record.plateNumber || "",
      driver_name: record.driver_name || record.driverName || "",
      helper_name: record.helper_name || record.helperName || "",
      payee: "",
      amount: record.total_payable || record.driver_net_pay || "",
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
      ...(cash.records || []).filter(statusPending).map(normalizeCash),
      ...(repair.records || []).filter(statusPending).map(normalizeRepair),
      ...(payroll.records || []).filter(statusPending).map(normalizePayroll),
      ...(trips.records || []).filter(statusPending).map(normalizeTrip)
    ].filter(item => item.ref_id)
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
  }

  function visibleRecords() {
    if (state.filter === "all") return state.records;
    return state.records.filter(record => record.module === state.filter);
  }

  function badgeClass(status) {
    return `mobile-approval-status-badge status-${text(status).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "pending"}`;
  }

  function render() {
    const records = visibleRecords();
    const list = $("mobile-approval-list");
    if (!records.length) {
      list.innerHTML = `<section class="driver-mobile-card mobile-approval-card"><p>No pending requests found.</p></section>`;
      return;
    }
    list.innerHTML = records.map((record, index) => `
      <article class="driver-mobile-card mobile-approval-card" data-index="${index}">
        <div class="mobile-approval-card-head">
          <strong>${escapeHtml(record.ref_id)}</strong>
          <span class="${badgeClass(record.status)}">${escapeHtml(record.status || "Pending")}</span>
        </div>
        <p>${escapeHtml(record.request_type)}</p>
        ${record.plate_number ? `<p>Plate: ${escapeHtml(record.plate_number)}</p>` : ""}
        ${record.driver_name || record.helper_name ? `<p>${escapeHtml([record.driver_name, record.helper_name].filter(Boolean).join(" / "))}</p>` : ""}
        ${record.payee ? `<p>Payee: ${escapeHtml(record.payee)}</p>` : ""}
        ${record.amount ? `<p>${escapeHtml(money(record.amount))}</p>` : ""}
        ${record.route ? `<p>${escapeHtml(record.route)}</p>` : ""}
        ${record.submitted_at ? `<p>Submitted ${escapeHtml(dateText(record.submitted_at))}</p>` : ""}
        ${record.remarks ? `<p>${escapeHtml(record.remarks)}</p>` : ""}
        <div class="mobile-approval-action-row">
          <button class="mobile-approval-secondary-btn" type="button" data-action="view" data-ref="${escapeHtml(record.ref_id)}">View Details</button>
          <button class="mobile-approval-primary-btn" type="button" data-action="approve" data-ref="${escapeHtml(record.ref_id)}">Approve</button>
          <button class="mobile-approval-secondary-btn" type="button" data-action="return" data-ref="${escapeHtml(record.ref_id)}">Return</button>
          <button class="mobile-approval-danger-btn" type="button" data-action="reject" data-ref="${escapeHtml(record.ref_id)}">Reject</button>
        </div>
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
        ${detailRow("Remarks / Reason", record.remarks)}
        ${detailRow("Return Reason", record.return_reason)}
        ${items}
      </dl>
    `;
    $("mobile-approval-modal-backdrop").hidden = false;
    document.body.classList.add("mobile-approval-modal-open");
  }

  function closeMobileApprovalDetails() {
    $("mobile-approval-modal-backdrop").hidden = true;
    $("mobile-approval-modal-body").innerHTML = "";
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
      state.records = state.records.filter(item => item.ref_id !== record.ref_id);
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
    document.querySelectorAll("[data-modal-action]").forEach(button => {
      button.addEventListener("click", () => {
        if (!state.selectedRecord) return;
        handleAction(button.dataset.modalAction, state.selectedRecord.ref_id);
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("mobile-approval-modal-backdrop").hidden) closeMobileApprovalDetails();
    });
    init();
  });
})();
