const BBC_WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
const BBC_TABS = ["trucks", "drivers", "helpers"];

const bbcState = {
  activeTab: "trucks",
  drawer: {
    open: false,
    tab: "",
    key: ""
  },
  cashRecords: [],
  balances: [],
  payrollRecords: [],
  payrollRates: [],
  routePreviewCache: {},
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
  rates: "/api/payroll/rates?active=true&limit=5000",
  tripLinesByPlate: "/api/payroll/trip-lines-by-plate",
  tripLines: "/api/payroll/trip-lines",
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

async function bbcPostJson(path, payload) {
  const url = `${BBC_WORKER_API_BASE}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
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
  const source = record.Source || record.source || record.origin || record.Origin || "";
  const destination = record.Destination || record.destination || record.dest || record.Dest || "";
  const route = record.Route || record.route || record.Route_Trip || record.routeText || (!source ? destination : "");
  const fuelStation = record.Fuel_Station || record.fuelStation || record.fuel_station || "";
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
    source: String(source || "").trim(),
    destination: String(destination || "").trim(),
    fuelStation: String(fuelStation || "").trim(),
    route: String(route || "").trim(),
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

function bbcNormalizePayrollRate(record = {}) {
  return {
    rateId: record.rate_id || record.rateId || "",
    group: bbcNormalizeGroup(record.group_category || record.groupCategory || ""),
    source: String(record.source || record.Source || "").trim(),
    destination: String(record.destination || record.Destination || "").trim(),
    driverSalary: bbcNumber(record.driver_salary ?? record.driverSalary ?? 0),
    helperSalary: bbcNumber(record.helper_salary ?? record.helperSalary ?? 0),
    active: record.active !== false && String(record.active || "true").toLowerCase() !== "false"
  };
}

function bbcNormalizeTripLine(record = {}) {
  const source = record.source || record.Source || "";
  const destination = record.destination || record.Destination || "";
  return {
    payrollId: record.payroll_id || record.payrollId || record.payrollNumber || "",
    plate: String(record.plate_number || record.plateNumber || record.Plate_Number || "").trim().toUpperCase(),
    driver: String(record.driver_name || record.driverName || record.Driver_Name || "").trim(),
    helper: String(record.helper_name || record.helperName || record.Helper_Name || "").trim(),
    tripDate: bbcIsoDate(record.trip_date || record.tripDate || record.date || record.Date || record.created_at || record.createdAt || ""),
    source: String(source || "").trim(),
    destination: String(destination || "").trim(),
    route: record.route || record.Route || "",
    driverSalary: bbcNumber(record.driver_salary ?? record.driverSalary ?? 0),
    helperSalary: bbcNumber(record.helper_salary ?? record.helperSalary ?? 0),
    rateId: record.rate_id || record.rateId || "",
    rateMatchStatus: record.rate_match_status || record.rateMatchStatus || record.rate_status || "No Match"
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
      record.source,
      record.destination,
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

function bbcIsNotCancelled(record) {
  return bbcNormalizeStatus(record) !== "Cancelled";
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

function bbcBalanceFor(person, role) {
  const normalizedPerson = String(person || "").trim().toLowerCase();
  const roleLower = String(role || "").trim().toLowerCase();
  return bbcState.balances.find(item => item.person.toLowerCase() === normalizedPerson && item.role.toLowerCase() === roleLower)?.currentBalance || 0;
}

function bbcIsClearedCashAdvance(record = {}) {
  const status = `${record.status || ""} ${record.paymentStatus || ""} ${record.remarks || ""}`.toLowerCase();
  return /(cleared|deducted|closed|settled|liquidated|cancelled|canceled|rejected)/.test(status);
}

function bbcCashAdvanceBalanceFallback(person, role) {
  return bbcCashAdvanceRecords(person, role)
    .filter(record => !bbcIsClearedCashAdvance(record))
    .reduce((sum, record) => sum + bbcNumber(record.amount), 0);
}

function bbcDisplayCashAdvanceBalance(person, role) {
  const balance = bbcBalanceFor(person, role);
  return balance > 0 ? balance : bbcCashAdvanceBalanceFallback(person, role);
}

function bbcPayrollRecordsForPlate(plate) {
  const normalizedPlate = String(plate || "").trim().toUpperCase();
  return bbcState.payrollRecords.filter(record => record.plate === normalizedPlate);
}

function bbcPayrollRecordsForPerson(person, role) {
  const normalizedPerson = String(person || "").trim().toLowerCase();
  const roleLower = String(role || "").trim().toLowerCase();
  return bbcState.payrollRecords.filter(record => {
    const recordPerson = roleLower === "driver" ? record.driver : record.helper;
    return recordPerson.toLowerCase() === normalizedPerson;
  });
}

function bbcSortLatestTripLines(lines) {
  const seen = new Set();
  return lines
    .filter(line => {
      if (!line) return false;
      const key = `${line.payrollId}|${line.tripDate}|${line.plate}|${line.source}|${line.destination}|${line.route}|${line.type}|${line.reference}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.tripDate || "").localeCompare(String(a.tripDate || "")))
    .slice(0, 4);
}

function bbcRoutePreviewKey(tab, key) {
  return `${tab}:${key}`;
}

function bbcIsPlaceholderRoute(route) {
  const text = String(route || "").trim().toLowerCase();
  return /^2go route\s+[a-z0-9-]+$/.test(text) || text === "2go route";
}

function bbcRouteLabel(line = {}) {
  const source = String(line.source || "").trim();
  const destination = String(line.destination || "").trim();
  if (source && destination) return `${bbcEscape(source)} &rarr; ${bbcEscape(destination)}`;
  const route = String(line.route || "").trim();
  if (route && !bbcIsPlaceholderRoute(route)) return bbcEscape(route);
  return "No route data yet";
}

function bbcPlainRouteLabel(line = {}) {
  const source = String(line.source || "").trim();
  const destination = String(line.destination || "").trim();
  if (source && destination) return `${source} -> ${destination}`;
  const route = String(line.route || "").trim();
  if (route && !bbcIsPlaceholderRoute(route)) return route;
  return "No route data yet";
}

function bbcMoneyRouteDetails(record = {}) {
  const route = String(record.route || "").trim();
  if (record.type === "Diesel PO" && record.fuelStation) return bbcEscape(record.fuelStation);
  if (!route || bbcIsPlaceholderRoute(route)) return bbcEscape(record.fuelStation || "-");
  return bbcEscape(route);
}

function bbcRouteKey(source, destination) {
  return `${String(source || "").trim().toLowerCase()}|${String(destination || "").trim().toLowerCase()}`;
}

function bbcFindRateForRoute(group, source, destination) {
  const sourceText = String(source || "").trim();
  const destinationText = String(destination || "").trim();
  if (!sourceText || !destinationText) return null;
  const groupText = bbcNormalizeGroup(group);
  return bbcState.payrollRates.find(rate => {
    if (!rate.active) return false;
    if (groupText && rate.group && rate.group !== groupText) return false;
    return bbcRouteKey(rate.source, rate.destination) === bbcRouteKey(sourceText, destinationText);
  }) || null;
}

function bbcIsFuelSource(record = {}) {
  const source = String(record.source || "").trim().toLowerCase();
  const fuelStation = String(record.fuelStation || "").trim().toLowerCase();
  if (!source) return false;
  return source === "fuel station" || (fuelStation && source === fuelStation);
}

function bbcPlannedPreviewRow(record, row, sourceLabel) {
  const rate = bbcFindRateForRoute(record.group || row.group, record.source, record.destination);
  const hasRoutePair = Boolean(record.source && record.destination);
  const needsRoute = record.type === "Trip Budget" && !hasRoutePair;
  return {
    previewSource: "planned",
    sourceLabel,
    payrollId: "",
    plate: record.plate,
    driver: record.driver,
    helper: record.helper,
    tripDate: record.date,
    source: hasRoutePair ? record.source : "",
    destination: hasRoutePair ? record.destination : "",
    route: needsRoute ? "Route needed" : record.route,
    type: record.type,
    reference: record.poNumber || record.id || "-",
    driverSalary: rate ? rate.driverSalary : 0,
    helperSalary: rate ? rate.helperSalary : 0,
    rateId: rate?.rateId || "",
    rateMatchStatus: rate ? "Matched" : (needsRoute ? "Needs route" : "No rate match")
  };
}

function bbcBuildPlannedRoutePreview(records, row, role = "") {
  const roleLower = String(role || "").trim().toLowerCase();
  const eligibleRecords = records
    .filter(record => ["Trip Budget", "Diesel PO"].includes(record.type))
    .filter(record => bbcIsNotCancelled(record))
    .filter(record => {
      if (!roleLower) return true;
      const person = roleLower === "driver" ? record.driver : record.helper;
      return String(person || "").trim().toLowerCase() === String(row.name || "").trim().toLowerCase();
    });

  const tripBudgets = eligibleRecords
    .filter(record => record.type === "Trip Budget")
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  if (tripBudgets.length) {
    return tripBudgets.slice(0, 4).map(record => bbcPlannedPreviewRow(record, row, "From Trip Budget"));
  }

  return eligibleRecords
    .filter(record => record.type === "Diesel PO")
    .filter(record => record.source && record.destination)
    .filter(record => !bbcIsFuelSource(record))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 4)
    .map(record => bbcPlannedPreviewRow(record, row, "From Diesel PO route"));
}

function bbcCashAdvanceRecords(person, role) {
  const normalizedPerson = String(person || "").trim().toLowerCase();
  const normalizedRole = String(role || "").trim().toLowerCase();
  return bbcState.cashRecords
    .filter(bbcInPeriod)
    .filter(record => record.type === "Bali / Cash Advance")
    .filter(record => String(record.person || "").trim().toLowerCase() === normalizedPerson)
    .filter(record => String(record.role || "").trim().toLowerCase() === normalizedRole)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function bbcRouteBreakdown(lines, mode) {
  const salaryField = mode === "driver" ? "driverSalary" : "helperSalary";
  const map = new Map();
  lines.forEach(line => {
    const route = bbcPlainRouteLabel(line);
    if (!map.has(route)) map.set(route, { route, count: 0, total: 0, dates: [] });
    const item = map.get(route);
    item.count += 1;
    item.total += bbcNumber(line[salaryField]);
    const date = bbcDate(line.tripDate);
    if (date !== "-" && !item.dates.includes(date)) item.dates.push(date);
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.route.localeCompare(b.route));
}

function bbcCombinedRouteBreakdown(lines = []) {
  const map = new Map();
  lines.forEach(line => {
    const route = bbcPlainRouteLabel(line);
    if (!map.has(route)) {
      map.set(route, { route, count: 0, dates: [], driverTotal: 0, helperTotal: 0 });
    }
    const item = map.get(route);
    item.count += 1;
    item.driverTotal += bbcNumber(line.driverSalary);
    item.helperTotal += bbcNumber(line.helperSalary);
    const date = bbcDate(line.tripDate);
    if (date !== "-" && !item.dates.includes(date)) item.dates.push(date);
  });
  return [...map.values()].sort((a, b) => (b.driverTotal + b.helperTotal) - (a.driverTotal + a.helperTotal) || a.route.localeCompare(b.route));
}

async function bbcFetchTripLinesForPayrollIds(payrollIds) {
  const uniqueIds = [...new Set(payrollIds.filter(Boolean))];
  const chunks = await Promise.all(uniqueIds.map(async payrollId => {
    try {
      const data = await bbcFetchJson(`${BBC_ENDPOINTS.tripLines}?payroll_id=${encodeURIComponent(payrollId)}&limit=100`);
      return bbcArrayFromPayload(data, ["lines", "records", "data", "items"]).map(bbcNormalizeTripLine);
    } catch (error) {
      console.warn("Budget Balance trip lines endpoint failed", payrollId, error);
      return [];
    }
  }));
  return chunks.flat();
}

async function bbcFetchTripLinesByPlate(plate, limit = 4) {
  const normalizedPlate = String(plate || "").trim().toUpperCase();
  if (!normalizedPlate) return [];
  try {
    const data = await bbcFetchJson(`${BBC_ENDPOINTS.tripLinesByPlate}?plate_number=${encodeURIComponent(normalizedPlate)}&limit=${encodeURIComponent(limit)}`);
    return bbcArrayFromPayload(data, ["lines", "records", "data", "items"]).map(bbcNormalizeTripLine);
  } catch (error) {
    console.warn("Budget Balance trip lines by plate endpoint failed", normalizedPlate, error);
  }

  let payrollRecords = bbcPayrollRecordsForPlate(normalizedPlate);
  if (!payrollRecords.length) {
    try {
      const data = await bbcFetchJson(`${BBC_ENDPOINTS.payroll}&plate_number=${encodeURIComponent(normalizedPlate)}`);
      payrollRecords = bbcArrayFromPayload(data, ["records", "payroll", "data", "items"]).map(bbcNormalizePayroll);
    } catch (error) {
      console.warn("Budget Balance payroll plate lookup failed", normalizedPlate, error);
    }
  }
  return bbcFetchTripLinesForPayrollIds(payrollRecords.map(record => record.payrollId));
}

async function bbcFetchRoutePreview(row, tab) {
  if (!row?.key) return;
  const cacheKey = bbcRoutePreviewKey(tab, row.key);
  const cached = bbcState.routePreviewCache[cacheKey];
  if (cached?.loading || cached?.loaded) return;

  bbcState.routePreviewCache[cacheKey] = { loading: true, loaded: false, lines: [], error: "" };
  bbcRenderDrawer();

  try {
    let lines = [];
    let previewSource = "payroll";
    if (tab === "trucks") {
      lines = bbcBuildPlannedRoutePreview(row.records, row);
      if (lines.length) {
        previewSource = "planned";
      } else {
        lines = await bbcFetchTripLinesByPlate(row.plate, 4);
        lines = lines.filter(line => !line.plate || line.plate === row.plate);
      }
    } else {
      const role = tab === "drivers" ? "Driver" : "Helper";
      const roleLower = role.toLowerCase();
      const personName = String(row.name || "").trim().toLowerCase();
      const assignedTruck = String(row.assignedTruck || "").trim().toUpperCase();
      const plannedRecords = bbcState.cashRecords
        .filter(bbcInPeriod)
        .filter(record => record.plate === assignedTruck || String(roleLower === "driver" ? record.driver : record.helper).trim().toLowerCase() === personName);
      lines = bbcBuildPlannedRoutePreview(plannedRecords, row, role);
      if (lines.length) {
        previewSource = "planned";
      } else {
        const payrollRecords = bbcPayrollRecordsForPerson(row.name, role);
        const payrollLines = await bbcFetchTripLinesForPayrollIds(payrollRecords.map(record => record.payrollId));
        const plateLines = await bbcFetchTripLinesByPlate(row.assignedTruck, 20);
        lines = [...payrollLines, ...plateLines].filter(line => {
          const linePerson = roleLower === "driver" ? line.driver : line.helper;
          if (linePerson && linePerson.toLowerCase() === personName) return true;
          return payrollRecords.some(record => record.payrollId === line.payrollId);
        });
      }
    }

    bbcState.routePreviewCache[cacheKey] = {
      loading: false,
      loaded: true,
      previewSource,
      lines: bbcSortLatestTripLines(lines),
      error: ""
    };
  } catch (error) {
    bbcState.routePreviewCache[cacheKey] = {
      loading: false,
      loaded: true,
      lines: [],
      error: error?.message || "Route preview could not be loaded."
    };
  }

  if (bbcState.drawer.open && bbcState.drawer.tab === tab && bbcState.drawer.key === row.key) {
    bbcRenderDrawer();
  }
}

async function bbcEnsureRoutePreview(row, tab) {
  const cacheKey = bbcRoutePreviewKey(tab, row.key);
  const cached = bbcState.routePreviewCache[cacheKey];
  if (!cached?.loaded && !cached?.loading) await bbcFetchRoutePreview(row, tab);
  let attempts = 0;
  while (bbcState.routePreviewCache[cacheKey]?.loading && attempts < 80) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts += 1;
  }
  return bbcState.routePreviewCache[cacheKey] || {};
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
    openTripBudget: bbcSum(row.records, record => record.type === "Trip Budget" && bbcIsNotCancelled(record)),
    openDieselPo: bbcSum(row.records, record => record.type === "Diesel PO" && bbcIsNotCancelled(record)),
    totalSinceLastPayroll: bbcSum(row.records, bbcIsNotCancelled),
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
  bbcState.routePreviewCache = {};
  bbcSetMessage("Loading Budget Balance Center data...");

  const results = await Promise.all([
    bbcFetchEndpoint("cash", BBC_ENDPOINTS.cash),
    bbcFetchEndpoint("balances", BBC_ENDPOINTS.balances),
    bbcFetchEndpoint("payroll", BBC_ENDPOINTS.payroll),
    bbcFetchEndpoint("rates", BBC_ENDPOINTS.rates),
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

  if (resultByLabel.rates?.ok) {
    bbcState.payrollRates = bbcArrayFromPayload(resultByLabel.rates.data, ["rates", "records", "data", "items"]).map(bbcNormalizePayrollRate);
  } else {
    bbcState.payrollRates = [];
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
  return `<article class="budget-mini-card budget-detail-card"><span>${bbcEscape(label)}</span><strong>${bbcEscape(value)}</strong></article>`;
}

function bbcPreviewTotals(gross, currentBalance) {
  const deduction = currentBalance > 0 ? Math.round(Math.min(currentBalance, gross * 0.5)) : 0;
  return {
    gross,
    currentBalance,
    deduction,
    takeHome: gross - deduction
  };
}

function bbcCashAdvanceHistoryTable(records) {
  return `
    <div class="budget-cash-history-list">
      ${records.length ? records.map(record => `
        <div>
          <span>${bbcEscape(bbcDate(record.date))}</span>
          <strong>${bbcEscape(bbcMoney(record.amount))}</strong>
          <em>${bbcEscape(bbcText(record.paymentStatus || bbcNormalizeStatus(record)))}</em>
        </div>
      `).join("") : `<p>No cash advance records since last payroll.</p>`}
    </div>
  `;
}

function bbcCashAdvanceHistorySection(driverName, helperName) {
  const driverRecords = bbcCashAdvanceRecords(driverName, "Driver");
  const helperRecords = bbcCashAdvanceRecords(helperName, "Helper");
  return `
    <section class="budget-cash-history-section">
      <h3 class="budget-section-title">Cash Advance History</h3>
      <div class="budget-cash-history-grid">
        <article class="budget-cash-history-card">
          <h4>Driver Cash Advance</h4>
          ${bbcCashAdvanceHistoryTable(driverRecords)}
        </article>
        <article class="budget-cash-history-card">
          <h4>Helper Cash Advance</h4>
          ${bbcCashAdvanceHistoryTable(helperRecords)}
        </article>
      </div>
    </section>
  `;
}

function bbcRouteBreakdownTable(lines, mode) {
  const rows = bbcRouteBreakdown(lines, mode);
  return `
    <div class="budget-subsection">
      <h5>Route Breakdown</h5>
      <div class="budget-route-breakdown">
        ${rows.length ? rows.map(row => `
          <div>
            <span>${bbcEscape(row.route)}</span>
            <em>${bbcEscape(row.dates.join(", ") || "-")} | ${row.count} ${row.count === 1 ? "trip" : "trips"} | ${bbcEscape(bbcMoney(row.total))}</em>
          </div>
        `).join("") : `<p>No route earnings yet.</p>`}
      </div>
    </div>
  `;
}

function bbcPreviewCard(title, name, totals, options = {}) {
  const role = title.includes("Driver") ? "Driver" : "Helper";
  return `
    <article class="budget-preview-card">
      <div class="budget-preview-title"><h4>${bbcEscape(title)}</h4><span>Preview</span></div>
      <dl>
        <div><dt>${role} Name</dt><dd>${bbcEscape(bbcText(name))}</dd></div>
        <div><dt>Gross</dt><dd>${bbcEscape(bbcMoney(totals.gross))}</dd></div>
        <div><dt>Cash Advance</dt><dd>${bbcEscape(bbcMoney(totals.currentBalance))}</dd></div>
        <div><dt>Deduct</dt><dd>${bbcEscape(bbcMoney(totals.deduction))}</dd></div>
        <div><dt>Take-home</dt><dd>${bbcEscape(bbcMoney(totals.takeHome))}</dd></div>
      </dl>
      ${bbcRouteBreakdownTable(options.routeLines || [], role.toLowerCase())}
    </article>
  `;
}

function bbcTruckPreviewData(row) {
  const cacheKey = bbcRoutePreviewKey("trucks", row.key);
  const preview = bbcState.routePreviewCache[cacheKey] || {};
  const lines = preview.lines || [];
  const driverGross = lines.reduce((sum, line) => sum + bbcNumber(line.driverSalary), 0);
  const helperGross = lines.reduce((sum, line) => sum + bbcNumber(line.helperSalary), 0);
  const driverTotals = bbcPreviewTotals(driverGross, bbcDisplayCashAdvanceBalance(row.driver, "Driver"));
  const helperTotals = bbcPreviewTotals(helperGross, bbcDisplayCashAdvanceBalance(row.helper, "Helper"));
  const sortedRecords = [...(row.records || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return {
    row,
    lines,
    previewSource: preview.previewSource || "planned",
    driverGross,
    helperGross,
    driverTotals,
    helperTotals,
    driverCashAdvances: bbcCashAdvanceRecords(row.driver, "Driver"),
    helperCashAdvances: bbcCashAdvanceRecords(row.helper, "Helper"),
    driverRouteBreakdown: bbcRouteBreakdown(lines, "driver"),
    helperRouteBreakdown: bbcRouteBreakdown(lines, "helper"),
    moneyLedger: sortedRecords.map(record => ({
      id: record.id,
      date: record.date,
      type: record.type,
      poNumber: record.poNumber,
      amount: record.amount,
      status: bbcNormalizeStatus(record),
      paymentStatus: record.paymentStatus,
      source: record.source,
      destination: record.destination,
      route: record.route,
      details: record.fuelStation || record.route || record.remarks || ""
    }))
  };
}

function bbcGeneratePayrollDraftId(row) {
  const plate = String(row?.plate || "TRUCK").replace(/[^A-Z0-9]+/gi, "").toUpperCase() || "TRUCK";
  return `PAY-DRAFT-BBC-${plate}-${Date.now()}`;
}

function bbcBuildPayrollDraftPayload(row) {
  const preview = bbcTruckPreviewData(row);
  const payrollId = bbcGeneratePayrollDraftId(row);
  const today = new Date().toISOString().slice(0, 10);
  const routeBreakdown = bbcCombinedRouteBreakdown(preview.lines);
  const moneyLedgerRefs = preview.moneyLedger.map(record => ({
    id: record.id,
    date: record.date,
    type: record.type,
    po_number: record.poNumber,
    amount: record.amount,
    status: record.status,
    payment_status: record.paymentStatus
  }));
  const rawData = {
    source: "Budget Balance",
    preview_only: true,
    plate_number: row.plate,
    group_category: row.group,
    driver_name: row.driver,
    helper_name: row.helper,
    period_start: bbcState.periodStart,
    period_label: bbcState.periodLabel,
    route_lines: preview.lines,
    route_breakdown: routeBreakdown,
    driver_route_breakdown: preview.driverRouteBreakdown,
    helper_route_breakdown: preview.helperRouteBreakdown,
    money_ledger_refs: moneyLedgerRefs,
    driver_cash_advance_history: preview.driverCashAdvances,
    helper_cash_advance_history: preview.helperCashAdvances,
    money_ledger: preview.moneyLedger,
    driver_gross: preview.driverGross,
    helper_gross: preview.helperGross,
    driver_cash_advance_balance: preview.driverTotals.currentBalance,
    helper_cash_advance_balance: preview.helperTotals.currentBalance,
    suggested_driver_deduction: preview.driverTotals.deduction,
    suggested_helper_deduction: preview.helperTotals.deduction,
    driver_take_home: preview.driverTotals.takeHome,
    helper_take_home: preview.helperTotals.takeHome,
    preview_warning: "Draft only. Deductions are not applied until payroll is finalized.",
    warning: "Draft only. Deductions are not applied and balances are not updated."
  };
  return {
    payroll_id: payrollId,
    payroll_date: today,
    cutoff_from: bbcState.periodStart || "",
    cutoff_to: today,
    plate_number: row.plate,
    group_category: row.group,
    driver_name: row.driver,
    helper_name: row.helper,
    driver_salary: preview.driverGross,
    helper_salary: preview.helperGross,
    total_expenses: row.totalSinceLastPayroll || 0,
    driver_cash_advance: 0,
    helper_cash_advance: 0,
    driver_previous_balance: preview.driverTotals.currentBalance,
    helper_previous_balance: preview.helperTotals.currentBalance,
    driver_balance_preview: Math.max(0, preview.driverTotals.currentBalance - preview.driverTotals.deduction),
    helper_balance_preview: Math.max(0, preview.helperTotals.currentBalance - preview.helperTotals.deduction),
    driver_net_pay: preview.driverTotals.takeHome,
    helper_net_pay: preview.helperTotals.takeHome,
    status: "Draft",
    approval_status: "Draft",
    payment_status: "Unpaid",
    source: "Budget Balance",
    route_breakdown: routeBreakdown,
    money_ledger_refs: moneyLedgerRefs,
    driver_cash_advance_history: preview.driverCashAdvances,
    helper_cash_advance_history: preview.helperCashAdvances,
    driver_gross: preview.driverGross,
    helper_gross: preview.helperGross,
    driver_cash_advance_balance: preview.driverTotals.currentBalance,
    helper_cash_advance_balance: preview.helperTotals.currentBalance,
    suggested_driver_deduction: preview.driverTotals.deduction,
    suggested_helper_deduction: preview.helperTotals.deduction,
    driver_take_home: preview.driverTotals.takeHome,
    helper_take_home: preview.helperTotals.takeHome,
    preview_warning: "Draft only. Deductions are not applied until payroll is finalized.",
    raw_data: rawData
  };
}

function bbcBuildPayrollDraftLines(row, payrollId) {
  const preview = bbcTruckPreviewData(row);
  const validLines = preview.lines.filter(line => {
    if (!line.source || !line.destination) return false;
    const hasSalary = bbcNumber(line.driverSalary) > 0 || bbcNumber(line.helperSalary) > 0;
    return hasSalary || line.rateMatchStatus === "Matched";
  });
  return validLines.map((line, index) => ({
    line_id: `${payrollId}-LINE-${String(index + 1).padStart(2, "0")}`,
    payroll_id: payrollId,
    trip_date: line.tripDate,
    plate_number: row.plate,
    group_category: row.group,
    driver_name: row.driver,
    helper_name: row.helper,
    source: line.source,
    destination: line.destination,
    reference_no: "",
    po_number: line.type === "Diesel PO" && line.reference && line.reference !== "-" ? line.reference : "",
    driver_salary: line.driverSalary,
    helper_salary: line.helperSalary,
    rate_id: line.rateId,
    rate_match_status: line.rateMatchStatus,
    remarks: line.sourceLabel || "Budget Balance draft preview",
    raw_data: { ...line, source_type: line.type }
  }));
}

function bbcRenderRoutePreview(row, tab, role = "") {
  const cacheKey = bbcRoutePreviewKey(tab, row.key);
  const preview = bbcState.routePreviewCache[cacheKey];

  if (!preview || preview.loading) {
    return `
      <section class="budget-route-preview">
        <div class="budget-empty compact">Loading route preview...</div>
      </section>
    `;
  }

  if (preview.error) {
    return `
      <section class="budget-route-preview">
        <div class="budget-empty compact">${bbcEscape(preview.error)}</div>
      </section>
    `;
  }

  const lines = preview.lines || [];
  if (tab === "trucks") {
    const driverGross = lines.reduce((sum, line) => sum + bbcNumber(line.driverSalary), 0);
    const helperGross = lines.reduce((sum, line) => sum + bbcNumber(line.helperSalary), 0);
    const driverTotals = bbcPreviewTotals(driverGross, bbcDisplayCashAdvanceBalance(row.driver, "Driver"));
    const helperTotals = bbcPreviewTotals(helperGross, bbcDisplayCashAdvanceBalance(row.helper, "Helper"));
    return `
      <section class="budget-route-preview">
        <div class="budget-preview-grid">
          ${bbcPreviewCard("Driver Preview", row.driver, driverTotals, { routeLines: lines, previewSource: preview.previewSource })}
          ${bbcPreviewCard("Helper Preview", row.helper, helperTotals, { routeLines: lines, previewSource: preview.previewSource })}
        </div>
      </section>
    `;
  }

  const mode = role.toLowerCase();
  const gross = lines.reduce((sum, line) => sum + bbcNumber(mode === "driver" ? line.driverSalary : line.helperSalary), 0);
  const totals = bbcPreviewTotals(gross, bbcDisplayCashAdvanceBalance(row.name, role));
  return `
    <section class="budget-route-preview">
      <div class="budget-preview-grid single">
        ${bbcPreviewCard(`${role} Preview`, row.name, totals, {
          cashAdvanceRecords: bbcCashAdvanceRecords(row.name, role),
          routeLines: lines,
          previewSource: preview.previewSource
        })}
      </div>
    </section>
  `;
}

function bbcLedgerRow(record, mode) {
  if (mode === "truck") {
    return `
      <tr>
        <td>${bbcEscape(bbcDate(record.date))}</td>
        <td>${bbcTypeChip(record.type)}</td>
        <td>${bbcEscape(bbcText(record.poNumber))}</td>
        <td>${bbcMoneyRouteDetails(record)}</td>
        <td class="ops-amount">${bbcEscape(bbcMoney(record.amount))}</td>
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
      <div class="budget-detail-summary-grid">
        ${bbcMiniCard("Total Released", bbcMoney(bbcSum(records, record => bbcNormalizeStatus(record) === "Paid / Released")))}
        ${bbcMiniCard("Still For Clearing", bbcMoney(bbcSum(records, bbcIsOpen)))}
      </div>
      <div class="budget-draft-actions">
        <button class="btn btn-primary" type="button" data-bbc-payroll-draft="${bbcEscape(row.key)}">Create Payroll Draft</button>
        <span id="bbc-draft-status-${bbcEscape(row.key)}"></span>
      </div>
      <h3 class="budget-section-title">Money Ledger</h3>
      <div class="budget-ledger-scroll">
        <table class="budget-ledger-table budget-detail-ledger">
          <thead><tr><th>Date</th><th>Type</th><th>PO</th><th>Details</th><th>Amount</th></tr></thead>
          <tbody>${records.length ? records.map(record => bbcLedgerRow(record, "truck")).join("") : `<tr><td colspan="5">No truck records found.</td></tr>`}</tbody>
        </table>
      </div>
      ${bbcCashAdvanceHistorySection(row.driver, row.helper)}
      ${bbcRenderRoutePreview(row, "trucks")}
    </div>
  `;
}

function bbcRenderPersonDetail(row, role) {
  const records = [...row.records].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `
    <div class="budget-detail-panel">
      <div class="budget-detail-summary-grid">
        ${bbcMiniCard("Current Cash Advance Balance", bbcMoney(row.currentBalance))}
        ${bbcMiniCard("Bali / Cash Advance Since Last Payroll", bbcMoney(row.baliSinceLastPayroll))}
        ${bbcMiniCard("Payroll Deducted", bbcMoney(row.payrollDeducted))}
        ${bbcMiniCard("Latest Bali Date", bbcDate(row.latestBaliDate))}
        ${bbcMiniCard("Latest Payroll Date", bbcDate(row.latestPayrollDate))}
      </div>
      <div class="budget-ledger-scroll">
        <table class="budget-ledger-table budget-detail-ledger">
          <thead><tr><th>Date</th><th>Type</th><th>Plate</th><th>Amount</th><th>Status</th><th>Payment Status</th><th>Payroll ID / Cutoff</th><th>Remarks</th></tr></thead>
          <tbody>${records.length ? records.map(record => bbcLedgerRow(record, role)).join("") : `<tr><td colspan="8">No ${bbcEscape(role.toLowerCase())} bali records found.</td></tr>`}</tbody>
        </table>
      </div>
      ${bbcRenderRoutePreview(row, role === "Driver" ? "drivers" : "helpers", role)}
    </div>
  `;
}

function bbcRenderTruckRows(rows) {
  if (!rows.length) return `<div class="budget-empty">No truck budget or diesel PO records found.</div>`;
  return `
    <div class="budget-desktop-table">
      <table class="budget-main-table">
        <thead><tr><th>Plate Number</th><th>Group</th><th>Current Driver</th><th>Current Helper</th><th>Trip Budget Released</th><th>Diesel PO Total</th><th>Total Expenses Since Last Payroll</th><th>Latest Activity</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="budget-row" data-bbc-detail-key="${bbcEscape(row.key)}" tabindex="0">
              <td><strong>${bbcEscape(row.plate)}</strong></td>
              <td>${bbcEscape(bbcText(row.group))}</td>
              <td>${bbcEscape(bbcText(row.driver))}</td>
              <td>${bbcEscape(bbcText(row.helper))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.openTripBudget))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.openDieselPo))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.totalSinceLastPayroll))}</td>
              <td>${bbcEscape(bbcDate(row.latestActivity))}</td>
              <td>${bbcStatusChip(row.status)} <button class="budget-row-action" type="button" data-bbc-detail-key="${bbcEscape(row.key)}">View details</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="budget-mobile-list">
      ${rows.map(row => `
        <article class="budget-mobile-card">
          <button class="budget-row-main" type="button" data-bbc-detail-key="${bbcEscape(row.key)}">
            <span><strong>${bbcEscape(row.plate)}</strong><small>${bbcEscape(bbcText(row.group))}</small></span>
            ${bbcStatusChip(row.status)}
          </button>
          <dl>
            <div><dt>Current Driver</dt><dd>${bbcEscape(bbcText(row.driver))}</dd></div>
            <div><dt>Current Helper</dt><dd>${bbcEscape(bbcText(row.helper))}</dd></div>
            <div><dt>Trip Budget Released</dt><dd>${bbcEscape(bbcMoney(row.openTripBudget))}</dd></div>
            <div><dt>Diesel PO Total</dt><dd>${bbcEscape(bbcMoney(row.openDieselPo))}</dd></div>
            <div><dt>Total Expenses Since Last Payroll</dt><dd>${bbcEscape(bbcMoney(row.totalSinceLastPayroll))}</dd></div>
            <div><dt>Latest Activity</dt><dd>${bbcEscape(bbcDate(row.latestActivity))}</dd></div>
          </dl>
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
        <thead><tr><th>${nameLabel}</th><th>Assigned Truck</th><th>Group</th><th>Current Cash Advance Balance</th><th>Bali Since Last Payroll</th><th>Payroll Deducted</th><th>Latest Bali Date</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr class="budget-row" data-bbc-detail-key="${bbcEscape(row.key)}" tabindex="0">
              <td><strong>${bbcEscape(row.name)}</strong></td>
              <td>${bbcEscape(bbcText(row.assignedTruck, "No Plate"))}</td>
              <td>${bbcEscape(bbcText(row.group))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.currentBalance))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.baliSinceLastPayroll))}</td>
              <td class="ops-amount">${bbcEscape(bbcMoney(row.payrollDeducted))}</td>
              <td>${bbcEscape(bbcDate(row.latestBaliDate))}</td>
              <td>${bbcStatusChip(row.status)} <button class="budget-row-action" type="button" data-bbc-detail-key="${bbcEscape(row.key)}">View details</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="budget-mobile-list">
      ${rows.map(row => `
        <article class="budget-mobile-card">
          <button class="budget-row-main" type="button" data-bbc-detail-key="${bbcEscape(row.key)}">
            <span><strong>${bbcEscape(row.name)}</strong><small>${bbcEscape(bbcText(row.assignedTruck, "No Plate"))}</small></span>
            ${bbcStatusChip(row.status)}
          </button>
          <dl>
            <div><dt>Group</dt><dd>${bbcEscape(bbcText(row.group))}</dd></div>
            <div><dt>Current Cash Advance Balance</dt><dd>${bbcEscape(bbcMoney(row.currentBalance))}</dd></div>
            <div><dt>Bali Since Last Payroll</dt><dd>${bbcEscape(bbcMoney(row.baliSinceLastPayroll))}</dd></div>
            <div><dt>Payroll Deducted</dt><dd>${bbcEscape(bbcMoney(row.payrollDeducted))}</dd></div>
            <div><dt>Latest Bali Date</dt><dd>${bbcEscape(bbcDate(row.latestBaliDate))}</dd></div>
          </dl>
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

function bbcFindRow(tab = bbcState.drawer.tab, key = bbcState.drawer.key) {
  return (bbcState.rows[tab] || []).find(row => row.key === key) || null;
}

function bbcEnsurePayrollDraftModal() {
  let modal = bbc$("bbc-payroll-draft-modal");
  if (modal) return modal;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="bbc-payroll-draft-modal" class="budget-draft-modal" hidden>
      <div class="budget-draft-modal-card" role="dialog" aria-modal="true" aria-labelledby="bbc-draft-title">
        <div class="budget-draft-modal-head">
          <div>
            <span>Preview</span>
            <h3 id="bbc-draft-title">Create payroll draft?</h3>
          </div>
          <button id="bbc-draft-cancel-x" class="budget-detail-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div id="bbc-draft-body" class="budget-draft-modal-body"></div>
        <div id="bbc-draft-status" class="budget-draft-status"></div>
        <div class="budget-draft-modal-actions">
          <button id="bbc-draft-cancel" class="btn btn-outline" type="button">Cancel</button>
          <button id="bbc-draft-confirm" class="btn btn-primary" type="button">Create Payroll Draft</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);
  modal = bbc$("bbc-payroll-draft-modal");
  bbc$("bbc-draft-cancel")?.addEventListener("click", bbcClosePayrollDraftModal);
  bbc$("bbc-draft-cancel-x")?.addEventListener("click", bbcClosePayrollDraftModal);
  modal?.addEventListener("click", event => {
    if (event.target === modal) bbcClosePayrollDraftModal();
  });
  bbc$("bbc-draft-confirm")?.addEventListener("click", bbcConfirmPayrollDraft);
  return modal;
}

function bbcClosePayrollDraftModal() {
  const modal = bbc$("bbc-payroll-draft-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.dataset.rowKey = "";
}

function bbcDraftRouteBreakdownList(rows = []) {
  return `
    <section class="budget-draft-route-section">
      <h4>Route Breakdown</h4>
      <div class="budget-draft-route-list">
        ${rows.length ? rows.map(row => `
          <div>
            <strong>${bbcEscape(row.route)}</strong>
            <span>${bbcEscape(row.dates.join(", ") || "-")} | ${row.count} ${row.count === 1 ? "trip" : "trips"} | Driver ${bbcEscape(bbcMoney(row.driverTotal))} | Helper ${bbcEscape(bbcMoney(row.helperTotal))}</span>
          </div>
        `).join("") : `<p>No route preview yet.</p>`}
      </div>
    </section>
  `;
}

async function bbcOpenPayrollDraftModal(rowKey) {
  const row = bbcFindRow("trucks", rowKey);
  if (!row) return;
  await bbcEnsureRoutePreview(row, "trucks");
  const modal = bbcEnsurePayrollDraftModal();
  const body = bbc$("bbc-draft-body");
  const status = bbc$("bbc-draft-status");
  const confirm = bbc$("bbc-draft-confirm");
  const title = bbc$("bbc-draft-title");
  const preview = bbcTruckPreviewData(row);
  modal.dataset.rowKey = row.key;
  modal.hidden = false;
  if (status) {
    status.textContent = "";
    status.className = "budget-draft-status";
  }
  if (confirm) {
    confirm.disabled = false;
    confirm.textContent = "Create Payroll Draft";
  }
  if (title) title.textContent = `Create payroll draft for ${row.plate}?`;
  if (body) {
    const routeBreakdown = bbcCombinedRouteBreakdown(preview.lines);
    const totalReleased = bbcSum(row.records, r => bbcNormalizeStatus(r) === "Paid / Released");
    const stillClearing = bbcSum(row.records, bbcIsOpen);
    const totalBaliCA = preview.driverTotals.currentBalance + preview.helperTotals.currentBalance;
    body.innerHTML = `
      <div class="budget-draft-confirm-grid">
        ${bbcMiniCard("Total Trip Budget", bbcMoney(row.openTripBudget))}
        ${bbcMiniCard("Total Diesel PO", bbcMoney(row.openDieselPo))}
        ${bbcMiniCard("Total Bali / Cash Advance", bbcMoney(totalBaliCA))}
        ${bbcMiniCard("Total Released", bbcMoney(totalReleased))}
        ${bbcMiniCard("Still For Clearing", bbcMoney(stillClearing))}
      </div>
      ${bbcDraftRouteBreakdownList(routeBreakdown)}
      <table class="budget-draft-crew-table">
        <thead>
          <tr><th></th><th>Gross</th><th>Cash Advance</th><th>Suggested Deduction</th><th>Take-home</th></tr>
        </thead>
        <tbody>
          <tr>
            <td class="budget-draft-crew-label">Driver</td>
            <td>${bbcMoney(preview.driverTotals.gross)}</td>
            <td>${bbcMoney(preview.driverTotals.currentBalance)}</td>
            <td>${bbcMoney(preview.driverTotals.deduction)}</td>
            <td>${bbcMoney(preview.driverTotals.takeHome)}</td>
          </tr>
          <tr>
            <td class="budget-draft-crew-label">Helper</td>
            <td>${bbcMoney(preview.helperTotals.gross)}</td>
            <td>${bbcMoney(preview.helperTotals.currentBalance)}</td>
            <td>${bbcMoney(preview.helperTotals.deduction)}</td>
            <td>${bbcMoney(preview.helperTotals.takeHome)}</td>
          </tr>
        </tbody>
      </table>
      <p class="budget-draft-note">Preview only - deductions are not applied until payroll is finalized.</p>
    `;
  }
}

async function bbcConfirmPayrollDraft() {
  const modal = bbc$("bbc-payroll-draft-modal");
  const row = bbcFindRow("trucks", modal?.dataset.rowKey || "");
  const status = bbc$("bbc-draft-status");
  const confirm = bbc$("bbc-draft-confirm");
  if (!row) return;
  if (confirm) {
    confirm.disabled = true;
    confirm.textContent = "Creating...";
  }
  if (status) {
    status.textContent = "Creating payroll draft...";
    status.className = "budget-draft-status info";
  }
  try {
    await bbcEnsureRoutePreview(row, "trucks");
    const payload = bbcBuildPayrollDraftPayload(row);
    const result = await bbcPostJson("/api/payroll/create", payload);
    const payrollId = result.payroll_id || result.record?.payroll_id || payload.payroll_id;
    const lines = bbcBuildPayrollDraftLines(row, payrollId);
    let lineMessage = "";
    if (lines.length) {
      try {
        const lineResult = await bbcPostJson("/api/payroll/trip-lines-bulk-upsert", { lines });
        lineMessage = ` ${lineResult.count || lines.length} route line${(lineResult.count || lines.length) === 1 ? "" : "s"} saved.`;
      } catch (lineError) {
        console.warn("Budget Balance draft trip lines save failed", lineError);
        lineMessage = " Route lines were kept in draft raw data.";
      }
    }
    if (status) {
      status.className = "budget-draft-status success";
      status.innerHTML = `Payroll draft created.${bbcEscape(lineMessage)} <a href="payroll.html?payroll_id=${encodeURIComponent(payrollId)}">Open Payroll</a> <span>${bbcEscape(payrollId)}</span>`;
    }
    if (confirm) confirm.textContent = "Created";
    const drawerStatus = bbc$(`bbc-draft-status-${row.key}`);
    if (drawerStatus) drawerStatus.textContent = "Payroll draft created.";
  } catch (error) {
    if (status) {
      status.className = "budget-draft-status warning";
      status.textContent = error?.message || "Payroll draft could not be created.";
    }
    if (confirm) {
      confirm.disabled = false;
      confirm.textContent = "Create Payroll Draft";
    }
  }
}

function bbcRenderDrawer() {
  const drawer = bbc$("bbc-detail-drawer");
  const backdrop = bbc$("bbc-drawer-backdrop");
  const title = bbc$("bbc-drawer-title");
  const subtitle = bbc$("bbc-drawer-subtitle");
  const kicker = bbc$("bbc-drawer-kicker");
  const body = bbc$("bbc-drawer-body");
  if (!drawer || !backdrop || !title || !subtitle || !kicker || !body) return;

  const row = bbcFindRow();
  const open = bbcState.drawer.open && row;
  drawer.classList.toggle("open", Boolean(open));
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
  backdrop.hidden = !open;
  backdrop.classList.toggle("open", Boolean(open));

  if (!open) {
    title.textContent = "Select a row";
    subtitle.textContent = "";
    body.innerHTML = "";
    return;
  }

  if (bbcState.drawer.tab === "trucks") {
    kicker.textContent = "Truck Details";
    title.textContent = row.plate;
    subtitle.textContent = [row.group, row.driver ? `Driver: ${row.driver}` : "", row.helper ? `Helper: ${row.helper}` : ""].filter(Boolean).join(" | ");
    body.innerHTML = bbcRenderTruckDetail(row);
    return;
  }

  const role = bbcState.drawer.tab === "drivers" ? "Driver" : "Helper";
  kicker.textContent = `${role} Details`;
  title.textContent = row.name;
  subtitle.textContent = [row.assignedTruck ? `Truck: ${row.assignedTruck}` : "No Plate", row.group].filter(Boolean).join(" | ");
  body.innerHTML = bbcRenderPersonDetail(row, role);
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
  bbcRenderDrawer();
}

function bbcSetActiveTab(tab) {
  if (!BBC_TABS.includes(tab)) return;
  bbcState.activeTab = tab;
  bbcCloseDrawer();
  console.log("Budget Balance active tab", bbcState.activeTab);
  document.querySelectorAll("[data-bbc-tab]").forEach(button => {
    const active = button.dataset.bbcTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  bbcRender();
}

function bbcOpenDrawer(key) {
  if (!key) return;
  const tab = bbcState.activeTab;
  const row = bbcFindRow(tab, key);
  bbcState.drawer = {
    open: true,
    tab,
    key
  };
  console.log("Budget Balance expanded row", key);
  bbcRender();
  if (row) bbcFetchRoutePreview(row, tab);
}

function bbcCloseDrawer() {
  bbcState.drawer.open = false;
  bbcState.drawer.key = "";
  bbcRenderDrawer();
}

function bbcBindEvents() {
  ["bbc-group", "bbc-search", "bbc-date-from", "bbc-date-to", "bbc-status"].forEach(id => {
    const el = bbc$(id);
    if (!el) return;
    el.addEventListener("input", () => {
      bbcReadFilters();
      bbcBuildRows();
      bbcCloseDrawer();
      bbcRender();
    });
    el.addEventListener("change", () => {
      bbcReadFilters();
      bbcBuildRows();
      bbcCloseDrawer();
      bbcRender();
    });
  });
  bbc$("bbc-refresh")?.addEventListener("click", bbcLoadData);
  document.querySelectorAll("[data-bbc-tab]").forEach(button => {
    button.addEventListener("click", () => bbcSetActiveTab(button.dataset.bbcTab));
  });
  document.addEventListener("click", event => {
    const draftButton = event.target?.closest?.("[data-bbc-payroll-draft]");
    if (draftButton) {
      event.preventDefault();
      event.stopPropagation();
      bbcOpenPayrollDraftModal(draftButton.dataset.bbcPayrollDraft || "");
      return;
    }
    const target = event.target?.closest?.("[data-bbc-detail-key]");
    if (!target) return;
    bbcOpenDrawer(target.dataset.bbcDetailKey || "");
  });
  document.addEventListener("keydown", event => {
    const row = event.target?.closest?.("[data-bbc-detail-key]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      bbcOpenDrawer(row.dataset.bbcDetailKey || "");
      return;
    }
    if (event.key === "Escape") {
      bbcClosePayrollDraftModal();
      bbcCloseDrawer();
    }
  });
  bbc$("bbc-drawer-close")?.addEventListener("click", bbcCloseDrawer);
  bbc$("bbc-drawer-backdrop")?.addEventListener("click", bbcCloseDrawer);
}

document.addEventListener("DOMContentLoaded", () => {
  bbcSetAccess();
  bbcBindEvents();
  console.log("Budget Balance active tab", bbcState.activeTab);
  bbcLoadData();
});
