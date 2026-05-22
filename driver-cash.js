(function () {
  "use strict";

  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const SESSION_KEY = "vnsDriverPortalSession";

  const $ = (id) => document.getElementById(id);
  const form = $("driver-cash-form");
  const statusBox = $("driver-cash-status");
  const submitButton = $("driver-cash-submit");
  let activeType = "PO";
  let truckLocked = false;
  let assignedGroup = "";
  let rateRows = [];

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function text(id) {
    return String($(id)?.value || "").trim();
  }

  function numberValue(id) {
    const value = Number($(id)?.value || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizePlate(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function showStatus(message, kind) {
    statusBox.hidden = false;
    statusBox.textContent = message;
    statusBox.className = `driver-mobile-status ${kind || "info"}`;
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Submitting..." : activeType === "Bali" ? "Send for Approval" : "Submit for Approval";
  }

  function setReadonly(id, locked) {
    const input = $(id);
    if (!input) return;
    input.readOnly = locked;
    input.classList.toggle("driver-mobile-readonly", locked);
  }

  function requestParam() {
    const params = new URLSearchParams(window.location.search);
    return {
      plate: normalizePlate(params.get("plate")),
      truck: String(params.get("truck") || "").trim(),
      type: String(params.get("type") || "").trim().toLowerCase()
    };
  }

  function readDriverSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) continue;
        const session = JSON.parse(raw);
        if (session?.plate_number || session?.plateNumber) return session;
      } catch (error) {
        console.warn("Unable to read driver portal session.", error);
      }
    }
    return null;
  }

  function sessionAsTruck(session = {}) {
    return {
      plate_number: session.plate_number || session.plateNumber || "",
      driver_name: session.driver_name || session.driverName || "",
      helper_name: session.helper_name || session.helperName || "",
      group_category: session.group_name || session.groupName || session.group_category || session.groupCategory || "",
      mobile_number: session.mobile_number || session.mobileNumber || ""
    };
  }

  function typeFromQuery(value) {
    if (value === "trip_budget" || value === "trip-budget" || value === "budget") return "Trip Budget";
    if (value === "bali") return "Bali";
    if (value === "po" || value === "cash_po" || value === "cash-po") return "PO";
    return "";
  }

  function setAssignmentSummary() {
    const plate = text("plate-number");
    const driver = text("driver-name");
    const helper = text("helper-name");
    const group = assignedGroup;
    $("cash-pass-plate").textContent = plate || "-";
    $("cash-pass-driver").textContent = driver || "-";
    $("cash-pass-helper").textContent = helper || "-";
    $("cash-pass-group").textContent = group || "-";
    const parts = [
      plate ? `Plate ${plate}` : "",
      driver ? driver : "",
      group ? group : ""
    ].filter(Boolean);
    $("truck-summary").textContent = parts.length ? parts.join(" | ") : "Login through the VNS Driver Portal to prefill assignment details.";
  }

  function pickTruckValue(truck, keys) {
    for (const key of keys) {
      const value = truck?.[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  function applyTruck(truck, fallbackPlate) {
    const plate = pickTruckValue(truck, ["plate_number", "plateNumber", "Plate_Number"]) || fallbackPlate;
    $("plate-number").value = normalizePlate(plate);
    $("driver-name").value = pickTruckValue(truck, ["driver_name", "driverName", "Current_Driver_Name", "Current_Driver"]);
    $("helper-name").value = pickTruckValue(truck, ["helper_name", "helperName", "Current_Helper_Name", "Current_Helper"]);
    const mobile = pickTruckValue(truck, ["mobile_number", "mobileNumber"]);
    if (mobile) $("mobile-number").value = mobile;
    assignedGroup = pickTruckValue(truck, ["group_category", "groupCategory", "Group_Category"]);
    truckLocked = Boolean(truck);
    ["plate-number", "driver-name", "helper-name"].forEach(id => setReadonly(id, truckLocked));
    setAssignmentSummary();
  }

  async function loadDriverContext() {
    const { plate, truck } = requestParam();
    const session = readDriverSession();
    if (!plate && !truck && session) {
      applyTruck(sessionAsTruck(session), session.plate_number || session.plateNumber);
      return;
    }
    if (!plate && !truck) {
      showStatus("Please login through the VNS Driver Portal.", "error");
      return;
    }
    if (plate) $("plate-number").value = plate;
    showStatus("Loading truck assignment...", "info");
    try {
      const params = new URLSearchParams({ active: "true", limit: "5000" });
      if (plate) params.set("plate_number", plate);
      if (truck) params.set("truck_id", truck);
      const response = await fetch(`${WORKER_API_BASE}/api/trucks/list?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Truck lookup failed");
      const trucks = Array.isArray(data.trucks) ? data.trucks : [];
      const found = trucks.find(item => {
        const itemPlate = normalizePlate(item.plate_number || item.plateNumber || item.Plate_Number);
        const itemTruck = String(item.truck_id || item.truckId || "").trim();
        return (plate && itemPlate === plate) || (truck && itemTruck === truck);
      });
      if (!found) {
        if (session && normalizePlate(session.plate_number || session.plateNumber) === plate) {
          applyTruck(sessionAsTruck(session), plate);
          statusBox.hidden = true;
          return;
        }
        applyTruck(null, plate);
        showStatus("Truck not found. Please contact dispatcher.", "error");
        return;
      }
      applyTruck(found, plate);
      statusBox.hidden = true;
    } catch (error) {
      if (session && (!plate || normalizePlate(session.plate_number || session.plateNumber) === plate)) {
        applyTruck(sessionAsTruck(session), plate || normalizePlate(session.plate_number || session.plateNumber));
        statusBox.hidden = true;
        return;
      }
      applyTruck(null, plate);
      showStatus(`Truck lookup unavailable. ${error.message || "Please contact dispatcher."}`, "error");
    }
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function renderDatalist(id, values) {
    $(id).innerHTML = uniqueSorted(values).map(value => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function matchingRates() {
    const group = normalize(assignedGroup);
    return rateRows.filter(rate => !group || !rate.groupCategory || normalize(rate.groupCategory) === group);
  }

  function refreshRateOptions() {
    const rates = matchingRates();
    renderDatalist("source-options", rates.map(rate => rate.source));
    renderDatalist("destination-options", rates.map(rate => rate.destination));
  }

  async function loadRateOptions() {
    try {
      const response = await fetch(`${WORKER_API_BASE}/api/payroll/rates?limit=1000`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Rate matrix unavailable");
      rateRows = Array.isArray(data.rates) ? data.rates : [];
      refreshRateOptions();
    } catch (error) {
      console.warn("Driver cash rate options unavailable; keeping source/destination as text inputs.", error);
    }
  }

  function setActiveType(nextType) {
    activeType = nextType;
    document.querySelectorAll(".driver-mobile-tab").forEach(button => {
      const active = button.dataset.requestType === activeType;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(panel => {
      panel.hidden = panel.dataset.panel !== activeType;
    });
    const title = activeType === "Trip Budget" ? "Trip Budget" : activeType === "Bali" ? "Bali Request" : "PO Request";
    $("cash-page-title").textContent = title;
    const label = activeType === "Bali" ? "Send for Approval" : "Submit for Approval";
    submitButton.textContent = label;
  }

  function commonPayload() {
    return {
      id: `driver_cash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      plateNumber: normalizePlate(text("plate-number")),
      driverName: text("driver-name"),
      helperName: text("helper-name"),
      mobileNumber: text("mobile-number"),
      groupCategory: assignedGroup,
      status: "For Approval",
      approval_status: "Pending",
      payment_status: "Unpaid",
      sourceModule: "driver_mobile",
      source_module: "driver_mobile",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function buildPoPayload() {
    return {
      ...commonPayload(),
      type: "Cash PO",
      request_type: "Cash PO",
      date: text("po-date-needed") || today(),
      request_date: text("po-date-needed") || today(),
      dateNeeded: text("po-date-needed"),
      source: text("po-source"),
      destination: text("po-destination"),
      route: [text("po-source"), text("po-destination")].filter(Boolean).join(" to "),
      amount: numberValue("po-amount"),
      budgetAmount: numberValue("po-amount"),
      budgetType: "PO",
      remarks: "Driver mobile PO request"
    };
  }

  function buildBudgetPayload() {
    return {
      ...commonPayload(),
      type: "Trip Budget",
      request_type: "Trip Budget",
      date: text("budget-date-needed") || today(),
      request_date: text("budget-date-needed") || today(),
      dateNeeded: text("budget-date-needed"),
      source: text("budget-source"),
      destination: text("budget-destination"),
      route: [text("budget-source"), text("budget-destination")].filter(Boolean).join(" to "),
      amount: numberValue("budget-amount"),
      budgetAmount: numberValue("budget-amount"),
      budgetType: "Trip Budget",
      depositNeeded: "Yes",
      depositTo: text("budget-person-to-deposit"),
      receiverName: text("budget-person-to-deposit"),
      personName: text("budget-person-to-deposit"),
      depositNumber: text("budget-account-number"),
      accountNumber: text("budget-account-number"),
      remarks: "Driver mobile trip budget request"
    };
  }

  function buildBaliPayload() {
    const personName = text("bali-person-name");
    const helperName = text("helper-name");
    const driverName = text("driver-name");
    return {
      ...commonPayload(),
      type: "Bali / Cash Advance",
      request_type: "Bali / Cash Advance",
      date: text("bali-date-needed") || today(),
      request_date: text("bali-date-needed") || today(),
      dateNeeded: text("bali-date-needed"),
      amount: numberValue("bali-amount"),
      reason: text("bali-purpose"),
      remarks: text("bali-purpose"),
      depositNeeded: "Yes",
      depositTo: "GCash / Account",
      receiverName: personName,
      personName,
      personType: normalize(personName) === normalize(helperName) ? "Helper" : normalize(personName) === normalize(driverName) ? "Driver" : "",
      depositNumber: text("bali-account-number"),
      accountNumber: text("bali-account-number")
    };
  }

  function buildPayload() {
    if (activeType === "Trip Budget") return buildBudgetPayload();
    if (activeType === "Bali") return buildBaliPayload();
    return buildPoPayload();
  }

  function validatePayload(payload) {
    if (!payload.plateNumber) return "Please enter plate number.";
    if (!payload.driverName) return "Please enter driver name.";
    if (activeType !== "Bali" && !payload.source) return "Please enter source.";
    if (activeType !== "Bali" && !payload.destination) return "Please enter destination.";
    if (!payload.amount) return "Please enter amount.";
    if (!payload.dateNeeded) return "Please enter date needed.";
    if (activeType === "Trip Budget" && !payload.receiverName) return "Please enter person to deposit to.";
    if (activeType === "Trip Budget" && !payload.depositNumber) return "Please enter account or GCash number.";
    if (activeType === "Bali" && !payload.receiverName) return "Please enter person to receive money.";
    if (activeType === "Bali" && !payload.reason) return "Please enter purpose / reason.";
    if (activeType === "Bali" && !payload.depositNumber) return "Please enter GCash or account number.";
    return "";
  }

  function readFriendlyRef(data) {
    const record = data?.record || data?.records?.[0] || {};
    return record.request_no || record.requestNo || record.Request_No || record.cash_ref_id || record.cashRefId || record.Cash_Ref_ID || "";
  }

  function restoreTruckFieldsAfterReset(snapshot) {
    $("plate-number").value = snapshot.plateNumber;
    $("driver-name").value = snapshot.driverName;
    $("helper-name").value = snapshot.helperName;
    $("mobile-number").value = snapshot.mobileNumber;
    ["plate-number", "driver-name", "helper-name"].forEach(id => setReadonly(id, truckLocked));
    setAssignmentSummary();
  }

  async function submitRequest(event) {
    event.preventDefault();
    const payload = buildPayload();
    const error = validatePayload(payload);
    if (error) {
      showStatus(error, "error");
      return;
    }

    const snapshot = {
      plateNumber: text("plate-number"),
      driverName: text("driver-name"),
      helperName: text("helper-name"),
      mobileNumber: text("mobile-number")
    };

    setLoading(true);
    showStatus("Sending request...", "info");
    try {
      const response = await fetch(`${WORKER_API_BASE}/api/cash/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Request failed (${response.status})`);
      const refId = readFriendlyRef(data);
      showStatus(`Submitted for approval. Ref ID: ${refId || "Pending"}`, "success");
      form.reset();
      setDefaultDates();
      restoreTruckFieldsAfterReset(snapshot);
    } catch (error) {
      showStatus(`Request not submitted. Please check signal and try again. ${error.message || ""}`.trim(), "error");
    } finally {
      setLoading(false);
    }
  }

  function setDefaultDates() {
    ["po-date-needed", "budget-date-needed", "bali-date-needed"].forEach(id => {
      if ($(id) && !$(id).value) $(id).value = today();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setDefaultDates();
    const requestedType = typeFromQuery(requestParam().type);
    if (requestedType) activeType = requestedType;
    document.querySelectorAll(".driver-mobile-tab").forEach(button => {
      button.addEventListener("click", () => setActiveType(button.dataset.requestType));
    });
    form.addEventListener("submit", submitRequest);
    await Promise.all([loadDriverContext(), loadRateOptions()]);
    refreshRateOptions();
    setActiveType(activeType);
  });
})();
