(function () {
  "use strict";

  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const SESSION_KEY = "vnsDriverPortalSession";

  const $ = (id) => document.getElementById(id);

  function normalizePlate(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function text(value) {
    return String(value ?? "").trim();
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function showStatus(message, kind = "info") {
    const box = $("driver-requests-status");
    box.hidden = false;
    box.textContent = message;
    box.className = `driver-mobile-status ${kind}`;
  }

  function readSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.plate_number || parsed?.plateNumber) return parsed;
      } catch (error) {
        console.warn("Unable to read driver portal session.", error);
      }
    }
    return null;
  }

  function contextFromUrlOrSession() {
    const params = new URLSearchParams(window.location.search);
    const session = readSession() || {};
    return {
      plate_number: normalizePlate(params.get("plate") || session.plate_number || session.plateNumber),
      driver_name: text(session.driver_name || session.driverName),
      helper_name: text(session.helper_name || session.helperName),
      group_name: text(session.group_name || session.groupName)
    };
  }

  function renderContext(context) {
    $("requests-pass-plate").textContent = context.plate_number || "-";
    $("requests-pass-driver").textContent = context.driver_name || "-";
    $("requests-pass-helper").textContent = context.helper_name || "-";
    $("requests-pass-group").textContent = context.group_name || "-";
  }

  function normalizeApprovalStatus(status, paymentStatus) {
    const value = text(status).toLowerCase();
    const payment = text(paymentStatus).toLowerCase();
    if (payment === "paid") return "Paid";
    if (payment === "for deposit" || payment === "for payment") return "For Payment";
    if (value === "approved" && payment && payment !== "paid") return "For Payment";
    if (value.includes("approved")) return "Approved";
    if (value.includes("return")) return "Returned";
    if (value.includes("reject")) return "Rejected";
    if (value.includes("submitted")) return "Submitted";
    return "Pending Approval";
  }

  function cashType(record = {}) {
    const raw = text(record.request_type || record.requestType || record.type || record.Transaction_Type);
    if (/bali|cash advance/i.test(raw)) return "Bali";
    if (/trip.?budget|budget/i.test(raw)) return "Trip Budget";
    return "PO";
  }

  function refId(record = {}) {
    return text(record.request_no || record.requestNo || record.Request_No || record.cash_ref_id || record.cashRefId || record.trip_ref_id || record.tripRefId);
  }

  function normalizeCash(record = {}) {
    return {
      ref_id: refId(record),
      request_type: cashType(record),
      amount: record.amount ?? record.Amount ?? "",
      source: record.source || "",
      destination: record.destination || record.route || "",
      submitted_at: record.created_at || record.createdAt || record.date || record.Date || "",
      approval_status: record.approval_status || record.approvalStatus || record.status || record.Status || "",
      payment_status: record.payment_status || record.paymentStatus || "Unpaid",
      remarks: record.remarks || record.reason || ""
    };
  }

  function normalizeTrip(record = {}) {
    return {
      ref_id: text(record.trip_ref_id || record.tripRefId),
      request_type: "Trip Submission",
      amount: "",
      source: record.source || "",
      destination: record.destination || "",
      submitted_at: record.created_at || record.trip_date || "",
      approval_status: record.submission_status || "Submitted",
      payment_status: "",
      remarks: record.remarks || ""
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  async function loadRequests(context) {
    const plate = encodeURIComponent(context.plate_number);
    const [cash, trips] = await Promise.all([
      fetchJson(`${WORKER_API_BASE}/api/cash/list?limit=500&plate_number=${plate}`),
      fetchJson(`${WORKER_API_BASE}/api/driver-trip/list?limit=500&plate_number=${plate}`)
    ]);
    return [
      ...(Array.isArray(cash.records) ? cash.records.map(normalizeCash) : []),
      ...(Array.isArray(trips.records) ? trips.records.map(normalizeTrip) : [])
    ].filter(item => item.ref_id)
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
  }

  function badgeClass(status) {
    return `driver-request-status-badge status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  function renderRequests(records) {
    const list = $("driver-requests-list");
    if (!records.length) {
      list.innerHTML = `<p class="driver-request-empty">No requests found yet.</p>`;
      return;
    }
    list.innerHTML = records.map(record => {
      const status = normalizeApprovalStatus(record.approval_status, record.payment_status);
      const route = [record.source, record.destination].filter(Boolean).join(" -> ");
      return `
        <article class="driver-request-card">
          <div class="driver-request-card-head">
            <strong>${escapeHtml(record.ref_id)}</strong>
            <span class="${badgeClass(status)}">${escapeHtml(status)}</span>
          </div>
          <p>${escapeHtml(record.request_type)}</p>
          ${record.amount ? `<p>${escapeHtml(money(record.amount))}</p>` : ""}
          ${route ? `<p>${escapeHtml(route)}</p>` : ""}
          ${record.submitted_at ? `<p>Submitted ${escapeHtml(dateText(record.submitted_at))}</p>` : ""}
          ${record.payment_status ? `<p>Payment: ${escapeHtml(record.payment_status)}</p>` : ""}
          ${record.remarks ? `<p>${escapeHtml(record.remarks)}</p>` : ""}
        </article>
      `;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const context = contextFromUrlOrSession();
    renderContext(context);
    if (!context.plate_number) {
      showStatus("Please login through the VNS Driver Portal.", "error");
      renderRequests([]);
      return;
    }
    showStatus("Loading requests...", "info");
    try {
      const records = await loadRequests(context);
      $("driver-requests-status").hidden = true;
      renderRequests(records);
    } catch (error) {
      showStatus(`Unable to load requests. ${error.message || ""}`.trim(), "error");
      renderRequests([]);
    }
  });
})();
