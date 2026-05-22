(function () {
  "use strict";

  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const SESSION_KEY = "vnsDriverPortalSession";

  const $ = (id) => document.getElementById(id);
  const form = $("driver-trip-form");
  const statusBox = $("driver-trip-status");
  const submitButton = $("driver-trip-submit");
  let truckLocked = false;
  let assignedGroup = "";
  let rateRows = [];

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function text(id) {
    return String($(id)?.value || "").trim();
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
    submitButton.textContent = isLoading ? "Submitting..." : "Submit Trip Details";
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
      truck: String(params.get("truck") || "").trim()
    };
  }

  function setBackLink() {
    const link = $("driver-trip-back");
    if (!link) return;
    const session = readDriverSession();
    const plate = normalizePlate(requestParam().plate || session?.plate_number || session?.plateNumber || text("plate-number"));
    link.href = plate ? `driver-portal.html?plate=${encodeURIComponent(plate)}` : "driver-portal.html";
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

  function setAssignmentSummary() {
    const plate = text("plate-number");
    const driver = text("driver-name");
    const helper = text("helper-name");
    const group = text("product-line");
    $("trip-pass-plate").textContent = plate || "-";
    $("trip-pass-driver").textContent = driver || "-";
    $("trip-pass-helper").textContent = helper || "-";
    $("trip-pass-group").textContent = group || "-";
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

  function setGroupValue(group) {
    const select = $("product-line");
    if (!group) return;
    const normalized = normalize(group);
    const option = Array.from(select.options).find(item => normalize(item.value) === normalized || normalize(item.textContent) === normalized);
    if (option) {
      select.value = option.value;
      return;
    }
    select.value = "Other";
  }

  function applyTruck(truck, fallbackPlate) {
    const plate = pickTruckValue(truck, ["plate_number", "plateNumber", "Plate_Number"]) || fallbackPlate;
    $("plate-number").value = normalizePlate(plate);
    $("driver-name").value = pickTruckValue(truck, ["driver_name", "driverName", "Current_Driver_Name", "Current_Driver"]);
    $("helper-name").value = pickTruckValue(truck, ["helper_name", "helperName", "Current_Helper_Name", "Current_Helper"]);
    const mobile = pickTruckValue(truck, ["mobile_number", "mobileNumber"]);
    if (mobile) $("mobile-number").value = mobile;
    assignedGroup = pickTruckValue(truck, ["group_category", "groupCategory", "Group_Category"]);
    setGroupValue(assignedGroup);
    truckLocked = Boolean(truck);
    ["plate-number", "driver-name", "helper-name"].forEach(id => setReadonly(id, truckLocked));
    setAssignmentSummary();
  }

  async function loadDriverContext() {
    const { plate, truck } = requestParam();
    const session = readDriverSession();
    const sessionPlate = normalizePlate(session?.plate_number || session?.plateNumber);
    if (!truck && session && (!plate || sessionPlate === plate)) {
      applyTruck(sessionAsTruck(session), sessionPlate);
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

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function renderDatalist(id, values) {
    $(id).innerHTML = uniqueSorted(values).map(value => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function matchingRates() {
    const group = normalize(text("product-line") || assignedGroup);
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
      console.warn("Driver trip rate options unavailable; keeping source/destination as text inputs.", error);
    }
  }

  function buildPayload() {
    return {
      plate_number: normalizePlate(text("plate-number")),
      driver_name: text("driver-name"),
      helper_name: text("helper-name"),
      mobile_number: text("mobile-number"),
      trip_date: text("trip-date"),
      shipment_number: text("shipment-number"),
      container_number: text("container-number"),
      product_line: text("product-line"),
      source: text("source"),
      destination: text("destination"),
      trip_status: text("trip-status"),
      remarks: text("remarks"),
      submission_status: "Submitted",
      source_module: "driver_mobile"
    };
  }

  function validatePayload(payload) {
    if (!payload.plate_number) return "Please enter plate number.";
    if (!payload.driver_name) return "Please enter driver name.";
    if (!payload.trip_date) return "Please enter trip date.";
    if (!payload.shipment_number) return "Please enter shipping number.";
    if (!payload.product_line) return "Please select group.";
    if (!payload.source) return "Please enter source.";
    if (!payload.destination) return "Please enter destination.";
    return "";
  }

  function readRef(data) {
    return data?.refId || data?.trip_ref_id || data?.record?.trip_ref_id || "";
  }

  function restoreTruckFieldsAfterReset(snapshot) {
    $("plate-number").value = snapshot.plateNumber;
    $("driver-name").value = snapshot.driverName;
    $("helper-name").value = snapshot.helperName;
    $("mobile-number").value = snapshot.mobileNumber;
    setGroupValue(snapshot.group);
    ["plate-number", "driver-name", "helper-name"].forEach(id => setReadonly(id, truckLocked));
    setAssignmentSummary();
  }

  async function submitTrip(event) {
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
      mobileNumber: text("mobile-number"),
      group: text("product-line")
    };

    setLoading(true);
    showStatus("Sending trip details...", "info");
    try {
      const response = await fetch(`${WORKER_API_BASE}/api/driver-trip/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Trip submit failed (${response.status})`);
      showStatus(`Trip details submitted for review. Ref ID: ${readRef(data) || "DTRIP submitted"}`, "success");
      form.reset();
      $("trip-date").value = today();
      restoreTruckFieldsAfterReset(snapshot);
    } catch (error) {
      showStatus(`Trip not submitted. Please check signal and try again. ${error.message || ""}`.trim(), "error");
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("trip-date").value = today();
    $("product-line").addEventListener("change", () => {
      refreshRateOptions();
      setAssignmentSummary();
    });
    form.addEventListener("submit", submitTrip);
    await Promise.all([loadDriverContext(), loadRateOptions()]);
    setBackLink();
    refreshRateOptions();
  });
})();
