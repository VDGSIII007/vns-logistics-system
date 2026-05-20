const BBC_WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
const BBC_TABS = ["trucks", "drivers", "helpers"];

const bbcState = {
  activeTab: "trucks",
  expandedKey: "",
  cashRecords: [],
  balances: [],
  payrollRecords: [],
  truckMaster: [],
  rows: {
    trucks: [],
    drivers: [],
    helpers: []
  },
  periodStart: "",
  periodLabel: "Using last 30 days because no payroll cutoff was found",
  filters: {
    group: "",
    search: "",
    dateFrom: "",
    dateTo: "",
    status: ""
  }
};

const BBC_ENDPOINTS = {
  cash: "/api/cash/list?limit=500",
  balances: "/api/payroll/balances",
  payroll: "/api/payroll/list?limit=100",
  trucks: "/api/trucks/list?active=true&limit=1000"
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

function bbcNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function bbcMoney(value) {
  return "PHP " + bbcNumber(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function bbcIsoDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function bbcDate(value) {
  const iso = bbcIsoDate(value);
  if (!iso) return "-";
  const parsed = new Date(`${iso}T00:00:00`);
  return parsed.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function bbcSetMessage(message, type = "") {
  const el = bbc$("bbc-status-message");
  if (!el) return;
  el.textContent = message || "";
  el.className = `ops-status-line${type ? ` ${type}` : ""}`;
}

function bbcArrayFromPayload(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

async function bbcFetchJson(path) {
  const url = `${BBC_WORKER_API_BASE}${path}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status} ${response.statusText}`);
  }
  return data;
}

async function bbcFetchEndpoint(label, path) {
  try {
    return { ok: true, label, path, data: await bbcFetchJson(path) };
  } catch (error) {
    console.warn("Budget Balance endpoint failed", path, error);
    return {
      ok: false,
      label,
      path,
      error: error?.message || String(error || "Unknown error")
    };
  }
}

function bbcIsDeleted(record = {}) {
  return record.isDeleted === true ||
    record.Is_Deleted === true ||
    String(record.isDeleted || "").toLowerCase() === "true" ||
    String(record.Is_Deleted || "").toLowerCase() === "true" ||
    Boolean(record.Deleted_At || record.deleted_at);
}

function bbcNormalizeGroup(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "";
  if (lower.includes("bottle")) return "Bottle";
  if (lower.includes("sugar")) return "Sugar";
  if (lower.includes("cap") || lower.includes("crown")) return "Caps and Crown";
  if (lower.includes("preform") || lower.includes("resin")) return "Preform and Resin";
  if (lower.includes("2go") || lower.includes("2 go")) return "2GO";
  return text;
}

function bbcNormalizeStatus(record = {}) {
  const status = String(record.status || "").trim();
  const paymentStatus = String(record.paymentStatus || "").trim();
  const lowerStatus = status.toLowerCase();
  const lowerPayment = paymentStatus.toLowerCase();
  if (["cancelled", "canceled", "rejected", "returned"].includes(lowerStatus)) return "Cancelled";
  if (["paid", "released", "deposited", "used"].includes(lowerPayment) || ["paid", "released", "deposited", "used"].includes(lowerStatus)) return "Paid / Released";
  if (lowerStatus === "approved") return "Approved";
  if (["pending", "for approval", "submitted", "for review"].includes(lowerStatus)) return "For Approval";
  return "Open";
}

function bbcNormalizeType(value) {
  const type = String(value || "").trim();
  const lower = type.toLowerCase();
  if (lower.includes("diesel")) return "Diesel PO";
  if (lower.includes("trip") && lower.includes("budget")) return "Trip Budget";
  if (lower.includes("budget")) return "Trip Budget";
  if (lower.includes("bali") || lower.includes("cash advance")) return "Bali / Cash Advance";
  return type;
}

function bbcNormalizeCashRecord(record = {}) {
  const type = record.Transaction_Type || record.type || record.request_type || "";
  const plate = record.Plate_Number || record.plateNumber || record.plate_number || "";
  const person = record.Person_Name || record.personName || record.person_name || record.receiverName || record.receiver_name || "";
  const driver = record.Driver_Name || record.driverName || record.driver_name || "";
  const helper = record.Helper_Name || record.helperName || record.helper_name || "";
  const rawRole = record.Role || record.role || record.personType || "";
  const personLower = String(person).trim().toLowerCase();
  const role = rawRole ||
    (personLower && personLower === String(driver).trim().toLowerCase() ? "Driver" : "") ||
    (personLower && personLower === String(helper).trim().toLowerCase() ? "Helper" : "");
  const normalized = {
    id: record.request_id || record.requestId || record.Cash_ID || record.id || "",
    type: bbcNormalizeType(type),
    rawType: type,
    plate: String(plate || "").trim().toUpperCase(),
    person: String(person || "").trim(),
    role: String(role || "").trim(),
    driver: String(driver || "").trim(),
    helper: String(helper || "").trim(),
    amount: Number(record.Amount || record.amount || record.budgetAmount || record.Budget_Amount || record.Diesel_Amount || record.dieselAmount || 0),
    status: record.Review_Status || record.status || record.approval_status || "",
    paymentStatus: record.paymentStatus || record.Payment_Status || record.payment_status || "",
    date: bbcIsoDate(record.Date || record.date || record.request_date || record.createdAt || record.Created_At || ""),
    group: bbcNormalizeGroup(record.Group_Category || record.groupCategory || record.group_name || ""),
    poNumber: record.PO_Number || record.poNumber || record.po_number || "",
    route: record.Route || record.route || record.Route_Trip || record.destination || "",
    loggedBy: record.Logged_By || record.loggedBy || record.Encoded_By || "",
    remarks: record.Remarks || record.remarks || record.Notes || "",
    raw: record
  };
  normalized.friendlyStatus = bbcNormalizeStatus(normalized);
  return normalized;
}

function bbcNormalizeBalance(record = {}) {
  return {
    person: String(record.person_name || record.personName || record.Person_Name || "").trim(),
    role: String(record.person_role || record.personRole || record.Role || "").trim(),
    plate: String(record.plate_number || record.plateNumber || record.Plate_Number || "").trim().toUpperCase(),
    group: bbcNormalizeGroup(record.group_category || record.groupCategory || record.Group_Category || ""),
    currentBalance: bbcNumber(record.current_balance ?? record.currentBalance ?? record.balance ?? 0),
    updatedAt: bbcIsoDate(record.updated_at || record.updatedAt || "")
  };
}

function bbcIsActiveTruck(record = {}) {
  const active = record.active ?? record.Active;
  const status = String(record.status || record.Status || "").trim().toLowerCase();
  if (active === false || String(active).toLowerCase() === "false") return false;
  return !["inactive", "deleted", "retired"].includes(status);
}

function bbcNormalizeTruckMaster(record = {}) {
  return {
    plate: String(record.Plate_Number || record.plateNumber || record.plate_number || record.plate || "").trim().toUpperCase(),
    group: bbcNormalizeGroup(record.Group_Category || record.groupCategory || record.group_category || ""),
    driver: String(record.Current_Driver_Name || record.Current_Driver || record.driverName || record.driver_name || record.Driver || "").trim(),
    helper: String(record.Current_Helper_Name || record.Current_Helper || record.helperName || record.helper_name || record.Helper || "").trim(),
    active: bbcIsActiveTruck(record),
    remarks: record.Remarks || record.remarks || "",
    updatedAt: bbcIsoDate(record.updated_at || record.updatedAt || record.Updated_At || "")
  };
}

function bbcReadLocalTruckMaster() {
  try {
    const trucks = JSON.parse(localStorage.getItem("vnsTruckMaster") || "[]");
    return Array.isArray(trucks) ? trucks.map(bbcNormalizeTruckMaster).filter(truck => truck.plate && truck.active) : [];
  } catch {
    return [];
  }
}

function bbcNormalizePayroll(record = {}) {
  const cutoffTo = bbcIsoDate(record.cutoff_to || record.cutoffTo || record.cutoffEnd || "");
  const payrollDate = bbcIsoDate(record.payroll_date || record.payrollDate || record.date || record.createdAt || "");
  return {
    payrollId: record.payroll_id || record.payrollId || record.payrollNumber || record.id || "",
    payrollDate,
    cutoffFrom: bbcIsoDate(record.cutoff_from || record.cutoffFrom || record.cutoffStart || ""),
    cutoffTo,
    group: bbcNormalizeGroup(record.group_category || record.groupCategory || ""),
    plate: String(record.plate_number || record.plateNumber || "").trim().toUpperCase(),
    driver: String(record.driver_name || record.driverName || "").trim(),
    helper: String(record.helper_name || record.helperName || "").trim(),
    driverDeduction: bbcNumber(record.driver_cash_advance ?? record.driverCashAdvance ?? record.deductions?.driver?.cashAdvance ?? 0),
    helperDeduction: bbcNumber(record.helper_cash_advance ?? record.helperCashAdvance ?? record.deductions?.helper?.cashAdvance ?? 0),
    dateKey: cutoffTo || payrollDate || bbcIsoDate(record.created_at || record.createdAt || "")
  };
}

function bbcReadFilters() {
  bbcState.filters = {
    group: bbc$("bbc-group")?.value || "",
    search: bbc$("bbc-search")?.value.trim().toLowerCase() || "",
    dateFrom: bbc$("bbc-date-from")?.value || "",
    dateTo: bbc$("bbc-date-to")?.value || "",
    status: bbc$("bbc-status")?.value || ""
  };
  return bbcState.filters;
}

function bbcDeterminePeriod() {
  const latest = bbcState.payrollRecords
    .map(record => record.cutoffTo || record.payrollDate || record.dateKey)
    .filter(Boolean)
    .sort()
    .pop();
  if (latest) {
    bbcState.periodStart = latest;
    bbcState.periodLabel = "Showing records since last payroll";
    return;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 30);
  bbcState.periodStart = fallback.toISOString().slice(0, 10);
  bbcState.periodLabel = "Using last 30 days because no payroll cutoff was found";
}

function bbcInPeriod(record) {
  if (!record.date) return true;
  return record.date >= bbcState.periodStart;
}

function bbcMatchesFilters(record) {
  const filters = bbcState.filters;
  if (filters.group && record.group !== filters.group) return false;
  if (filters.status && bbcNormalizeStatus(record) !== filters.status) return false;
  if (filters.dateFrom && record.date && record.date < filters.dateFrom) return false;
  if (filters.dateTo && record.date && record.date > filters.dateTo) return false;
  if (filters.search) {
    const blob = [
      record.plate,
      record.person,
      record.driver,
      record.helper,
      record.poNumber,
      record.route,
      record.remarks,
      record.loggedBy
    ].join(" ").toLowerCase();
    if (!blob.includes(filters.search)) return false;
  }
  return true;
}

function bbcIsOpen(record) {
  return !["Paid / Released", "Cancelled"].includes(bbcNormalizeStatus(record));
}

function bbcLatest(records, field = "date") {
  return records.map(record => record[field]).filter(Boolean).sort().pop() || "";
}

function bbcSum(records, predicate = () => true) {
  return records.filter(predicate).reduce((sum, record) => sum + bbcNumber(record.amount), 0);
}

function bbcStatusForRecords(records) {
  if (!records.length) return "No Activity";
  if (records.some(bbcIsOpen)) return "Open";
  return "Clear";
}

function bbcLatestValue(records, field) {
  const sorted = [...records].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return sorted.find(record => record[field])?.[field] || "";
}

function bbcPayrollDeductionsFor(person, role) {
  const normalizedPerson = String(person || "").trim().toLowerCase();
  const roleLower = String(role || "").trim().toLowerCase();
  return bbcState.payrollRecords
    .filter(record => (roleLower === "driver" ? record.driver : record.helper).toLowerCase() === normalizedPerson)
    .filter(record => !record.dateKey || record.dateKey >= bbcState.periodStart)
    .reduce((sum, record) => sum + (roleLower === "driver" ? record.driverDeduction : record.helperDeduction), 0);
}

function bbcLatestPayrollFor(person, role) {
  const normalizedPerson = String(person || "").trim().toLowerCase();
  const roleLower = String(role || "").trim().toLowerCase();
  return bbcState.payrollRecords
    .filter(record => (roleLower === "driver" ? record.driver : record.helper).toLowerCase() === normalizedPerson)
    .map(record => record.dateKey)
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function bbcBuildTruckRows(records) {
  const map = new Map();
  bbcState.truckMaster.forEach(truck => {
    if (!truck.plate) return;
    map.set(truck.plate, {
      key: truck.plate,
      plate: truck.plate,
      group: truck.group,
      driver: truck.driver,
      helper: truck.helper,
      fromTruckMaster: true,
      records: []
    });
  });

  records.filter(record => ["Trip Budget", "Diesel PO"].includes(record.type)).forEach(record => {
    if (!record.plate) return;
    if (!map.has(record.plate)) {
      map.set(record.plate, {
        key: record.plate,
        plate: record.plate,
        group: record.group,
        driver: record.driver,
        helper: record.helper,
        records: []
      });
    }
    const row = map.get(record.plate);
    row.records.push(record);
    row.group = row.group || record.group;
    row.driver = row.driver || record.driver;
    row.helper = row.helper || record.helper;
  });

  return [...map.values()].map(row => ({
    ...row,
    openTripBudget: bbcSum(row.records, record => record.type === "Trip Budget" && bbcIsOpen(record)),
    openDieselPo: bbcSum(row.records, record => record.type === "Diesel PO" && bbcIsOpen(record)),
    totalSinceLastPayroll: bbcSum(row.records),
    latestActivity: bbcLatest(row.records),
    status: row.records.length ? bbcStatusForRecords(row.records) : "No open records"
  })).sort((a, b) => a.plate.localeCompare(b.plate));
}

function bbcBuildPersonRows(records, role) {
  const roleLower = role.toLowerCase();
  const map = new Map();
  records
    .filter(record => record.type === "Bali / Cash Advance")
    .filter(record => String(record.role || "").trim().toLowerCase() === roleLower)
    .forEach(record => {
      const person = record.person;
      if (!person) return;
      const key = person.toLowerCase();
      if (!map.has(key)) {
        const balance = bbcState.balances.find(item => item.person.toLowerCase() === key && item.role.toLowerCase() === roleLower);
        map.set(key, {
          key,
          name: person,
          assignedTruck: balance?.plate || record.plate,
          group: balance?.group || record.group,
          currentBalance: balance?.currentBalance || 0,
          records: []
        });
      }
      const row = map.get(key);
      row.records.push(record);
      row.assignedTruck = row.assignedTruck || record.plate;
      row.group = row.group || record.group;
    });

  bbcState.balances
    .filter(item => item.role.toLowerCase() === roleLower && item.person)
    .forEach(balance => {
      const key = balance.person.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: balance.person,
          assignedTruck: balance.plate,
          group: balance.group,
          currentBalance: balance.currentBalance,
          records: []
        });
      }
    });

  bbcState.truckMaster.forEach(truck => {
    const person = roleLower === "driver" ? truck.driver : truck.helper;
    if (!person) return;
    const key = person.toLowerCase();
    if (!map.has(key)) {
      const balance = bbcState.balances.find(item => item.person.toLowerCase() === key && item.role.toLowerCase() === roleLower);
      map.set(key, {
        key,
        name: person,
        assignedTruck: truck.plate || balance?.plate || "",
        group: truck.group || balance?.group || "",
        currentBalance: balance?.currentBalance || 0,
        records: []
      });
    } else {
      const row = map.get(key);
      row.assignedTruck = row.assignedTruck || truck.plate;
      row.group = row.group || truck.group;
    }
  });

  return [...map.values()].map(row => ({
    ...row,
    baliSinceLastPayroll: bbcSum(row.records),
    payrollDeducted: bbcPayrollDeductionsFor(row.name, role),
    latestBaliDate: bbcLatest(row.records),
    latestPayrollDate: bbcLatestPayrollFor(row.name, role),
    status: row.records.some(bbcIsOpen) || row.currentBalance > 0 ? "Open" : "No open records"
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function bbcApplyRowFilters(rows, fields) {
  const filters = bbcState.filters;
  return rows.filter(row => {
    if (filters.group && row.group !== filters.group) return false;
    if (filters.status === "Open" && row.status !== "Open") return false;
    if (filters.status && filters.status !== "Open" && row.records?.length === 0) return false;
    if (filters.search) {
      const blob = fields.map(field => row[field] || "").join(" ").toLowerCase();
      if (!blob.includes(filters.search)) return false;
    }
    return true;
  });
}

function bbcBuildRows() {
  const filteredRecords = bbcState.cashRecords.filter(bbcInPeriod).filter(bbcMatchesFilters);
  bbcState.rows.trucks = bbcApplyRowFilters(bbcBuildTruckRows(filteredRecords), ["plate", "group", "driver", "helper"]);
  bbcState.rows.drivers = bbcApplyRowFilters(bbcBuildPersonRows(filteredRecords, "Driver"), ["name", "assignedTruck", "group"]);
  bbcState.rows.helpers = bbcApplyRowFilters(bbcBuildPersonRows(filteredRecords, "Helper"), ["name", "assignedTruck", "group"]);
}

async function bbcLoadData() {
  bbcReadFilters();
  bbcSetMessage("Loading Budget Balance Center data...");

  const results = await Promise.all([
    bbcFetchEndpoint("cash", BBC_ENDPOINTS.cash),
    bbcFetchEndpoint("balances", BBC_ENDPOINTS.balances),
    bbcFetchEndpoint("payroll", BBC_ENDPOINTS.payroll),
    bbcFetchEndpoint("trucks", BBC_ENDPOINTS.trucks)
  ]);
  const resultByLabel = Object.fromEntries(results.map(result => [result.label, result]));
  const failures = results.filter(result => !result.ok);
  const successCount = results.length - failures.length;

  if (resultByLabel.cash?.ok) {
    bbcState.cashRecords = bbcArrayFromPayload(resultByLabel.cash.data, ["records", "entries", "data", "items"])
      .filter(record => !bbcIsDeleted(record))
      .map(bbcNormalizeCashRecord)
      .filter(record => ["Trip Budget", "Diesel PO", "Bali / Cash Advance"].includes(record.type));
  } else {
    bbcState.cashRecords = [];
  }

  if (resultByLabel.balances?.ok) {
    bbcState.balances = bbcArrayFromPayload(resultByLabel.balances.data, ["balances", "records", "data", "items"]).map(bbcNormalizeBalance);
  } else {
    bbcState.balances = [];
  }

  if (resultByLabel.payroll?.ok) {
    bbcState.payrollRecords = bbcArrayFromPayload(resultByLabel.payroll.data, ["records", "payroll", "data", "items"]).map(bbcNormalizePayroll);
  } else {
    bbcState.payrollRecords = [];
  }

  if (resultByLabel.trucks?.ok) {
    bbcState.truckMaster = bbcArrayFromPayload(resultByLabel.trucks.data, ["trucks", "Truck_Master", "records", "data", "items"])
      .map(bbcNormalizeTruckMaster)
      .filter(truck => truck.plate && truck.active);
  } else {
    bbcState.truckMaster = bbcReadLocalTruckMaster();
  }

  console.log("Budget Balance cash records loaded", bbcState.cashRecords.length);
  console.log("Budget Balance balances loaded", bbcState.balances.length);
  failures.forEach(result => console.warn(`Budget Balance failed endpoint: ${result.path}`, result.error));

  bbcDeterminePeriod();
  bbcBuildRows();
  if (successCount === 0) {
    bbcSetMessage("All Budget Balance endpoints failed. Showing empty tabs.", "warning");
  } else if (failures.length) {
    bbcSetMessage(`Loaded available Budget Balance data. Warning: ${failures.map(result => result.path).join(", ")} failed.`, "warning");
  } else {
    bbcSetMessage("Budget Balance data loaded.", "success");
  }
  bbcRender();
}

function bbcTypeChip(type) {
  const normalized = String(type || "").toLowerCase();
  let cls = "request-chip-other";
  if (normalized.includes("diesel")) cls = "request-chip-diesel";
  else if (normalized.includes("trip budget")) cls = "request-chip-trip-budget";
  else if (normalized.includes("bali") || normalized.includes("cash advance")) cls = "request-chip-bali";
  return `<span class="request-chip ${cls}">${bbcEscape(type || "Other")}</span>`;
}

function bbcStatusChip(status) {
  const label = bbcText(status, "Open");
  const normalized = label.toLowerCase();
  let cls = "budget-status-chip neutral";
  if (normalized === "open" || normalized === "for approval") cls = "budget-status-chip open";
  else if (normalized === "approved") cls = "budget-status-chip approved";
  else if (normalized === "paid / released" || normalized === "clear" || normalized === "no open records") cls = "budget-status-chip clear";
  else if (normalized === "cancelled") cls = "budget-status-chip issue";
  return `<span class="${cls}">${bbcEscape(label)}</span>`;
}

function bbcMiniCard(label, value) {
  return `<article class="budget-mini-card"><span>${bbcEscape(label)}</span><strong>${bbcEscape(value)}</strong></article>`;
}

function bbcLedgerRow(record, mode) {
  if (mode === "truck") {
    return `
      <tr>
        <td>${bbcEscape(bbcDate(record.date))}</td>
        <td>${bbcTypeChip(record.type)}</td>
        <td>${bbcEscape(bbcText(record.poNumber))}</td>
        <td>${bbcEscape(bbcText(record.route))}</td>
        <td class="ops-amount">${bbcEscape(bbcMoney(record.amount))}</td>
        <td>${bbcStatusChip(bbcNormalizeStatus(record))}</td>
        <td>${bbcEscape(bbcText(record.paymentStatus))}</td>
        <td>${bbcEscape(bbcText(record.loggedBy))}</td>
        <td>${bbcEscape(bbcText(record.remarks))}</td>
      </tr>
    `;
  }
  return `
    <tr>
      <td>${bbcEscape(bbcDate(record.date))}</td>
      <td>${bbcTypeChip(record.type)}</td>
      <td>${bbcEscape(bbcText(record.plate, "No Plate"))}</td>
      <td class="ops-amount">${bbcEscape(bbcMoney(record.amount))}</td>
      <td>${bbcStatusChip(bbcNormalizeStatus(record))}</td>
      <td>${bbcEscape(bbcText(record.paymentStatus))}</td>
      <td>-</td>
      <td>${bbcEscape(bbcText(record.remarks))}</td>
    </tr>
  `;
}

function bbcRenderTruckDetail(row) {
  const records = [...row.records].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `
    <div class="budget-detail-panel">
      <div class="budget-summary-grid">
        ${bbcMiniCard("Trip Budget Since Last Payroll", bbcMoney(bbcSum(records, record => record.type === "Trip Budget")))}
        ${bbcMiniCard("Diesel PO Since Last Payroll", bbcMoney(bbcSum(records, record => record.type === "Diesel PO")))}
        ${bbcMiniCard("Paid / Released Total", bbcMoney(bbcSum(records, record => bbcNormalizeStatus(record) === "Paid / Released")))}
        ${bbcMiniCard("Pending / Open Total", bbcMoney(bbcSum(records, bbcIsOpen)))}
        ${bbcMiniCard("Latest PO Number", bbcText(bbcLatestValue(records, "poNumber")))}
        ${bbcMiniCard("Latest Route", bbcText(bbcLatestValue(records, "route")))}
        ${bbcMiniCard("Latest Request Date", bbcDate(bbcLatest(records)))}
      </div>
      <div class="budget-ledger-scroll">
        <table class="budget-ledger-table">
          <thead><tr><th>Date</th><th>Type</th><th>PO No.</th><th>Route</th><th>Amount</th><th>Status</th><th>Payment Status</th><th>Logged By</th><th>Remarks</th></tr></thead>
          <tbody>${records.length ? records.map(record => bbcLedgerRow(record, "truck")).join("") : `<tr><td colspan="9">No truck records found.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bbcRenderPersonDetail(row, role) {
  const records = [...row.records].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `
    <div class="budget-detail-panel">
      <div class="budget-summary-grid">
        ${bbcMiniCard("Current Balance", bbcMoney(row.currentBalance))}
        ${bbcMiniCard("Bali / Cash Advance Since Last Payroll", bbcMoney(row.baliSinceLastPayroll))}
        ${bbcMiniCard("Payroll Deduction Total", bbcMoney(row.payrollDeducted))}
        ${bbcMiniCard("Latest Bali Date", bbcDate(row.latestBaliDate))}
        ${bbcMiniCard("Latest Payroll Date", bbcDate(row.latestPayrollDate))}
        ${bbcMiniCard("Assigned Truck", bbcText(row.assignedTruck, "No Plate"))}
      </div>
      <div class="budget-ledger-scroll">
        <table class="budget-ledger-table">
          <thead><tr><th>Date</th><th>Type</th><th>Plate</th><th>Amount</th><th>Status</th><th>Payment Status</th><th>Payroll ID / Cutoff</th><th>Remarks</th></tr></thead>
          <tbody>${records.length ? records.map(record => bbcLedgerRow(record, role)).join("") : `<tr><td colspan="8">No ${bbcEscape(role.toLowerCase())} bali records found.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function bbcRenderTruckRows(rows) {
  if (!rows.length) return `<div class="budget-empty">No truck budget or diesel PO records found.</div>`;
  return `
    <div class="budget-desktop-table">
      <table class="budget-main-table">
        <thead><tr><th>Plate Number</th><th>Group</th><th>Current Driver</th><th>Current Helper</th><th>Open Trip Budget</th><th>Open Diesel PO</th><th>Total Since Last Payroll</th><th>Latest Activity</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="budget-row" data-bbc-expand="${bbcEscape(row.key)}">
              <td><strong>${bbcEscape(row.plate)}</strong></td>
              <td>${bbcEscape(bbcText(row.group))}</td>
              <td>${bbcEscape(bbcText(row.driver))}</td>
              <td>${bbcEscape(bbcText(row.helper))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.openTripBudget))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.openDieselPo))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.totalSinceLastPayroll))}</td>
              <td>${bbcEscape(bbcDate(row.latestActivity))}</td>
              <td>${bbcStatusChip(row.status)}</td>
            </tr>
            ${bbcState.expandedKey === row.key ? `<tr class="budget-row-expanded"><td colspan="9">${bbcRenderTruckDetail(row)}</td></tr>` : ""}
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="budget-mobile-list">
      ${rows.map(row => `
        <article class="budget-mobile-card">
          <button class="budget-row-main" type="button" data-bbc-expand="${bbcEscape(row.key)}">
            <span><strong>${bbcEscape(row.plate)}</strong><small>${bbcEscape(bbcText(row.group))}</small></span>
            ${bbcStatusChip(row.status)}
          </button>
          <dl>
            <div><dt>Current Driver</dt><dd>${bbcEscape(bbcText(row.driver))}</dd></div>
            <div><dt>Current Helper</dt><dd>${bbcEscape(bbcText(row.helper))}</dd></div>
            <div><dt>Open Trip Budget</dt><dd>${bbcEscape(bbcMoney(row.openTripBudget))}</dd></div>
            <div><dt>Open Diesel PO</dt><dd>${bbcEscape(bbcMoney(row.openDieselPo))}</dd></div>
            <div><dt>Total Since Last Payroll</dt><dd>${bbcEscape(bbcMoney(row.totalSinceLastPayroll))}</dd></div>
            <div><dt>Latest Activity</dt><dd>${bbcEscape(bbcDate(row.latestActivity))}</dd></div>
          </dl>
          ${bbcState.expandedKey === row.key ? bbcRenderTruckDetail(row) : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function bbcRenderPersonRows(rows, role) {
  const nameLabel = role === "Driver" ? "Driver Name" : "Helper Name";
  if (!rows.length) return `<div class="budget-empty">No ${bbcEscape(role.toLowerCase())} bali records found.</div>`;
  return `
    <div class="budget-desktop-table">
      <table class="budget-main-table">
        <thead><tr><th>${nameLabel}</th><th>Assigned Truck</th><th>Group</th><th>Current Bali Balance</th><th>Bali Since Last Payroll</th><th>Payroll Deducted</th><th>Latest Bali Date</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="budget-row" data-bbc-expand="${bbcEscape(row.key)}">
              <td><strong>${bbcEscape(row.name)}</strong></td>
              <td>${bbcEscape(bbcText(row.assignedTruck, "No Plate"))}</td>
              <td>${bbcEscape(bbcText(row.group))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.currentBalance))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.baliSinceLastPayroll))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.payrollDeducted))}</td>
              <td>${bbcEscape(bbcDate(row.latestBaliDate))}</td>
              <td>${bbcStatusChip(row.status)}</td>
            </tr>
            ${bbcState.expandedKey === row.key ? `<tr class="budget-row-expanded"><td colspan="8">${bbcRenderPersonDetail(row, role)}</td></tr>` : ""}
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="budget-mobile-list">
      ${rows.map(row => `
        <article class="budget-mobile-card">
          <button class="budget-row-main" type="button" data-bbc-expand="${bbcEscape(row.key)}">
            <span><strong>${bbcEscape(row.name)}</strong><small>${bbcEscape(bbcText(row.assignedTruck, "No Plate"))}</small></span>
            ${bbcStatusChip(row.status)}
          </button>
          <dl>
            <div><dt>Group</dt><dd>${bbcEscape(bbcText(row.group))}</dd></div>
            <div><dt>Current Bali Balance</dt><dd>${bbcEscape(bbcMoney(row.currentBalance))}</dd></div>
            <div><dt>Bali Since Last Payroll</dt><dd>${bbcEscape(bbcMoney(row.baliSinceLastPayroll))}</dd></div>
            <div><dt>Payroll Deducted</dt><dd>${bbcEscape(bbcMoney(row.payrollDeducted))}</dd></div>
            <div><dt>Latest Bali Date</dt><dd>${bbcEscape(bbcDate(row.latestBaliDate))}</dd></div>
          </dl>
          ${bbcState.expandedKey === row.key ? bbcRenderPersonDetail(row, role) : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function bbcRenderTabSummary() {
  const el = bbc$("bbc-tab-summary");
  if (!el) return;
  const rows = bbcState.rows[bbcState.activeTab] || [];
  const openCount = rows.filter(row => row.status === "Open").length;
  let total = 0;
  if (bbcState.activeTab === "trucks") total = rows.reduce((sum, row) => sum + row.totalSinceLastPayroll, 0);
  else total = rows.reduce((sum, row) => sum + row.currentBalance, 0);
  el.innerHTML = `
    <span>${rows.length} ${bbcEscape(bbcState.activeTab)}</span>
    <span>${openCount} open</span>
    <span>${bbcEscape(bbcMoney(total))}</span>
    <span>Since ${bbcEscape(bbcDate(bbcState.periodStart))}</span>
  `;
}

function bbcRender() {
  const note = bbc$("bbc-period-note");
  if (note) note.textContent = bbcState.periodLabel;
  bbcRenderTabSummary();
  const content = bbc$("bbc-tab-content");
  if (!content) return;
  if (bbcState.activeTab === "trucks") content.innerHTML = bbcRenderTruckRows(bbcState.rows.trucks);
  if (bbcState.activeTab === "drivers") content.innerHTML = bbcRenderPersonRows(bbcState.rows.drivers, "Driver");
  if (bbcState.activeTab === "helpers") content.innerHTML = bbcRenderPersonRows(bbcState.rows.helpers, "Helper");
}

function bbcSetActiveTab(tab) {
  if (!BBC_TABS.includes(tab)) return;
  bbcState.activeTab = tab;
  bbcState.expandedKey = "";
  console.log("Budget Balance active tab", bbcState.activeTab);
  document.querySelectorAll("[data-bbc-tab]").forEach(button => {
    const active = button.dataset.bbcTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  bbcRender();
}

function bbcToggleExpanded(key) {
  bbcState.expandedKey = bbcState.expandedKey === key ? "" : key;
  console.log("Budget Balance expanded row", bbcState.expandedKey);
  bbcRender();
}

function bbcBindEvents() {
  ["bbc-group", "bbc-search", "bbc-date-from", "bbc-date-to", "bbc-status"].forEach(id => {
    const el = bbc$(id);
    if (!el) return;
    el.addEventListener("input", () => {
      bbcReadFilters();
      bbcBuildRows();
      bbcState.expandedKey = "";
      bbcRender();
    });
    el.addEventListener("change", () => {
      bbcReadFilters();
      bbcBuildRows();
      bbcState.expandedKey = "";
      bbcRender();
    });
  });
  bbc$("bbc-refresh")?.addEventListener("click", bbcLoadData);
  document.querySelectorAll("[data-bbc-tab]").forEach(button => {
    button.addEventListener("click", () => bbcSetActiveTab(button.dataset.bbcTab));
  });
  document.addEventListener("click", event => {
    const target = event.target?.closest?.("[data-bbc-expand]");
    if (!target) return;
    bbcToggleExpanded(target.dataset.bbcExpand || "");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bbcSetAccess();
  bbcBindEvents();
  console.log("Budget Balance active tab", bbcState.activeTab);
  bbcLoadData();
});
