const SAFE_ERROR = "Payroll data service is unavailable";

const VALID_PAYROLL_STATUSES = new Set(["Draft", "For Approval", "Approved", "For Deposit", "Deposited", "Paid", "Returned", "Rejected", "Cancelled"]);
const VALID_PAYMENT_STATUSES = new Set(["Unpaid", "For Deposit", "Deposited", "Paid", "Cancelled"]);
const VALID_APPROVAL_STATUSES = new Set(["Draft", "Pending", "For Approval", "Approved", "Returned", "Rejected", "Cancelled"]);
const VALID_EVENT_TYPES = new Set(["Bali", "Salary Deduction", "Manual Adjustment", "Cash Advance"]);

function supabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase payroll API is not configured" };
  }
  return {
    url: String(env.SUPABASE_URL).replace(/\/+$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function supabaseHeaders(config, prefer = "") {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "content-type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseFetch(env, path, options = {}) {
  const config = supabaseConfig(env);
  if (config.error) return { error: config.error, status: 500 };

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(config, options.prefer),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  })() : null;

  if (!response.ok) {
    return {
      error: body?.message || SAFE_ERROR,
      details: body,
      status: response.status
    };
  }

  return { body, status: response.status };
}

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/PHP/gi, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return 0;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/PHP/gi, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function dateOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function timestampOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function timestampOrNow(value) {
  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function boolFromValue(value) {
  return ["true", "yes", "1", "deleted"].includes(String(value ?? "").trim().toLowerCase());
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizePayrollStatus(raw) {
  const text = textOrNull(raw);
  if (!text) return "Draft";
  for (const s of VALID_PAYROLL_STATUSES) {
    if (s.toLowerCase() === text.toLowerCase()) return s;
  }
  return "Draft";
}

function normalizePaymentStatus(raw) {
  const text = textOrNull(raw);
  if (!text) return "Unpaid";
  for (const s of VALID_PAYMENT_STATUSES) {
    if (s.toLowerCase() === text.toLowerCase()) return s;
  }
  return "Unpaid";
}

function normalizeApprovalStatus(raw) {
  const text = textOrNull(raw);
  if (!text) return "Draft";
  for (const s of VALID_APPROVAL_STATUSES) {
    if (s.toLowerCase() === text.toLowerCase()) return s;
  }
  return "Draft";
}

function derivedApprovalStatus(payrollStatus, existing) {
  if (payrollStatus === "For Approval") return "Pending";
  if (payrollStatus === "Approved") return "Approved";
  if (payrollStatus === "For Deposit") return "Approved";
  if (payrollStatus === "Deposited") return "Approved";
  if (payrollStatus === "Paid") return "Approved";
  if (payrollStatus === "Returned") return "Returned";
  if (payrollStatus === "Rejected") return "Rejected";
  if (payrollStatus === "Cancelled") return "Cancelled";
  return existing || "Draft";
}

function generatePayrollId() {
  return `payroll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generatePayrollLineId() {
  return `pline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generatePayrollRateId() {
  return `rate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapPayrollRecord(input) {
  const now = new Date().toISOString();
  const payrollId = textOrNull(
    firstValue(input, ["payroll_id", "payrollId", "payrollNumber", "payroll_number"])
  ) || generatePayrollId();

  const rawStatus = normalizePayrollStatus(firstValue(input, ["status", "Status"]));
  const rawApproval = textOrNull(firstValue(input, ["approval_status", "approvalStatus"]));
  const approvalStatus = rawApproval
    ? normalizeApprovalStatus(rawApproval)
    : derivedApprovalStatus(rawStatus, "Draft");
  const paymentStatus = normalizePaymentStatus(firstValue(input, ["payment_status", "paymentStatus"]));

  return {
    payroll_id: payrollId,
    payroll_date: dateOrNull(firstValue(input, ["payroll_date", "payrollDate"])),
    cutoff_from: dateOrNull(firstValue(input, ["cutoff_from", "cutoffFrom", "cutoffStart"])),
    cutoff_to: dateOrNull(firstValue(input, ["cutoff_to", "cutoffTo", "cutoffEnd"])),
    group_category: textOrNull(firstValue(input, ["group_category", "groupCategory"])),
    plate_number: textOrNull(firstValue(input, ["plate_number", "plateNumber"])),
    driver_name: textOrNull(firstValue(input, ["driver_name", "driverName"])),
    helper_name: textOrNull(firstValue(input, ["helper_name", "helperName"])),
    driver_salary: numberOrZero(firstValue(input, ["driver_salary", "driverSalary"])),
    helper_salary: numberOrZero(firstValue(input, ["helper_salary", "helperSalary"])),
    driver_allowance: numberOrZero(firstValue(input, ["driver_allowance", "driverAllowance"])),
    helper_allowance: numberOrZero(firstValue(input, ["helper_allowance", "helperAllowance"])),
    total_expenses: numberOrZero(firstValue(input, ["total_expenses", "totalExpenses"])),
    driver_cash_advance: numberOrZero(firstValue(input, ["driver_cash_advance", "driverCashAdvance"])),
    helper_cash_advance: numberOrZero(firstValue(input, ["helper_cash_advance", "helperCashAdvance"])),
    driver_previous_balance: numberOrZero(firstValue(input, ["driver_previous_balance", "driverPreviousBalance"])),
    helper_previous_balance: numberOrZero(firstValue(input, ["helper_previous_balance", "helperPreviousBalance"])),
    driver_balance_preview: numberOrZero(firstValue(input, ["driver_balance_preview", "driverBalancePreview"])),
    helper_balance_preview: numberOrZero(firstValue(input, ["helper_balance_preview", "helperBalancePreview"])),
    driver_net_pay: numberOrZero(firstValue(input, ["driver_net_pay", "driverNetPay"])),
    helper_net_pay: numberOrZero(firstValue(input, ["helper_net_pay", "helperNetPay"])),
    status: rawStatus,
    approval_status: approvalStatus,
    payment_status: paymentStatus,
    approved_by: textOrNull(firstValue(input, ["approved_by", "approvedBy"])),
    approved_at: timestampOrNull(firstValue(input, ["approved_at", "approvedAt"])),
    deposited_at: timestampOrNull(firstValue(input, ["deposited_at", "depositedAt"])),
    raw_data: (input && typeof input === "object") ? input : {},
    created_at: timestampOrNow(firstValue(input, ["created_at", "createdAt"])),
    updated_at: timestampOrNow(firstValue(input, ["updated_at", "updatedAt"]) || now),
    is_deleted: boolFromValue(firstValue(input, ["is_deleted", "isDeleted"]))
  };
}

function formatPayrollRecord(r = {}) {
  return {
    id: r.id || r.payroll_id || "",
    payroll_id: r.payroll_id || "",
    payrollId: r.payroll_id || "",
    payroll_date: r.payroll_date || "",
    payrollDate: r.payroll_date || "",
    cutoff_from: r.cutoff_from || "",
    cutoffFrom: r.cutoff_from || "",
    cutoff_to: r.cutoff_to || "",
    cutoffTo: r.cutoff_to || "",
    group_category: r.group_category || "",
    groupCategory: r.group_category || "",
    plate_number: r.plate_number || "",
    plateNumber: r.plate_number || "",
    driver_name: r.driver_name || "",
    driverName: r.driver_name || "",
    helper_name: r.helper_name || "",
    helperName: r.helper_name || "",
    driver_salary: r.driver_salary ?? 0,
    driverSalary: r.driver_salary ?? 0,
    helper_salary: r.helper_salary ?? 0,
    helperSalary: r.helper_salary ?? 0,
    driver_allowance: r.driver_allowance ?? 0,
    driverAllowance: r.driver_allowance ?? 0,
    helper_allowance: r.helper_allowance ?? 0,
    helperAllowance: r.helper_allowance ?? 0,
    total_expenses: r.total_expenses ?? 0,
    totalExpenses: r.total_expenses ?? 0,
    driver_cash_advance: r.driver_cash_advance ?? 0,
    driverCashAdvance: r.driver_cash_advance ?? 0,
    helper_cash_advance: r.helper_cash_advance ?? 0,
    helperCashAdvance: r.helper_cash_advance ?? 0,
    driver_previous_balance: r.driver_previous_balance ?? 0,
    driverPreviousBalance: r.driver_previous_balance ?? 0,
    helper_previous_balance: r.helper_previous_balance ?? 0,
    helperPreviousBalance: r.helper_previous_balance ?? 0,
    driver_balance_preview: r.driver_balance_preview ?? 0,
    driverBalancePreview: r.driver_balance_preview ?? 0,
    helper_balance_preview: r.helper_balance_preview ?? 0,
    helperBalancePreview: r.helper_balance_preview ?? 0,
    driver_net_pay: r.driver_net_pay ?? 0,
    driverNetPay: r.driver_net_pay ?? 0,
    helper_net_pay: r.helper_net_pay ?? 0,
    helperNetPay: r.helper_net_pay ?? 0,
    status: r.status || "Draft",
    approval_status: r.approval_status || "Draft",
    approvalStatus: r.approval_status || "Draft",
    payment_status: r.payment_status || "Unpaid",
    paymentStatus: r.payment_status || "Unpaid",
    approved_by: r.approved_by || "",
    approvedBy: r.approved_by || "",
    approved_at: r.approved_at || "",
    approvedAt: r.approved_at || "",
    deposited_at: r.deposited_at || "",
    depositedAt: r.deposited_at || "",
    raw_data: r.raw_data || {},
    created_at: r.created_at || "",
    createdAt: r.created_at || "",
    updated_at: r.updated_at || "",
    updatedAt: r.updated_at || "",
    is_deleted: r.is_deleted || false
  };
}

function mapPayrollRate(input = {}) {
  return {
    rate_id: textOrNull(firstValue(input, ["rate_id", "rateId"])) || generatePayrollRateId(),
    group_category: textOrNull(firstValue(input, ["group_category", "groupCategory"])),
    source: textOrNull(input.source),
    destination: textOrNull(input.destination),
    truck_type: textOrNull(firstValue(input, ["truck_type", "truckType"])),
    driver_salary: numberOrZero(firstValue(input, ["driver_salary", "driverSalary"])),
    helper_salary: numberOrZero(firstValue(input, ["helper_salary", "helperSalary"])),
    default_toll: numberOrZero(firstValue(input, ["default_toll", "defaultToll", "toll"])),
    default_passway: numberOrZero(firstValue(input, ["default_passway", "defaultPassway", "passway"])),
    default_parking: numberOrZero(firstValue(input, ["default_parking", "defaultParking", "parking"])),
    default_lagay_loaded: numberOrZero(firstValue(input, ["default_lagay_loaded", "defaultLagayLoaded", "lagayLoaded"])),
    default_lagay_empty: numberOrZero(firstValue(input, ["default_lagay_empty", "defaultLagayEmpty", "lagayEmpty"])),
    default_mano: numberOrZero(firstValue(input, ["default_mano", "defaultMano", "mano"])),
    default_allowance_driver: numberOrZero(firstValue(input, ["default_allowance_driver", "defaultAllowanceDriver", "driverAllowance"])),
    default_allowance_helper: numberOrZero(firstValue(input, ["default_allowance_helper", "defaultAllowanceHelper", "helperAllowance"])),
    default_other_expenses: numberOrZero(firstValue(input, ["default_other_expenses", "defaultOtherExpenses", "otherExpenses"])),
    active: input.active === undefined ? true : !["false", "0", "inactive"].includes(String(input.active).toLowerCase()),
    remarks: textOrNull(input.remarks),
    updated_at: new Date().toISOString()
  };
}

function formatPayrollRate(r = {}) {
  return {
    id: r.id || "",
    rate_id: r.rate_id || "",
    rateId: r.rate_id || "",
    group_category: r.group_category || "",
    groupCategory: r.group_category || "",
    source: r.source || "",
    destination: r.destination || "",
    truck_type: r.truck_type || "",
    truckType: r.truck_type || "",
    driver_salary: r.driver_salary ?? 0,
    driverSalary: r.driver_salary ?? 0,
    helper_salary: r.helper_salary ?? 0,
    helperSalary: r.helper_salary ?? 0,
    default_toll: r.default_toll ?? 0,
    defaultToll: r.default_toll ?? 0,
    default_passway: r.default_passway ?? 0,
    defaultPassway: r.default_passway ?? 0,
    default_parking: r.default_parking ?? 0,
    defaultParking: r.default_parking ?? 0,
    default_lagay_loaded: r.default_lagay_loaded ?? 0,
    defaultLagayLoaded: r.default_lagay_loaded ?? 0,
    default_lagay_empty: r.default_lagay_empty ?? 0,
    defaultLagayEmpty: r.default_lagay_empty ?? 0,
    default_mano: r.default_mano ?? 0,
    defaultMano: r.default_mano ?? 0,
    default_allowance_driver: r.default_allowance_driver ?? 0,
    defaultAllowanceDriver: r.default_allowance_driver ?? 0,
    default_allowance_helper: r.default_allowance_helper ?? 0,
    defaultAllowanceHelper: r.default_allowance_helper ?? 0,
    default_other_expenses: r.default_other_expenses ?? 0,
    defaultOtherExpenses: r.default_other_expenses ?? 0,
    active: r.active !== false,
    remarks: r.remarks || "",
    created_at: r.created_at || "",
    updated_at: r.updated_at || ""
  };
}

function mapPayrollTripLine(input = {}) {
  const line = {
    line_id: textOrNull(firstValue(input, ["line_id", "lineId", "id"])) || generatePayrollLineId(),
    payroll_id: textOrNull(firstValue(input, ["payroll_id", "payrollId", "payrollNumber"])),
    trip_date: dateOrNull(firstValue(input, ["trip_date", "tripDate"])),
    plate_number: textOrNull(firstValue(input, ["plate_number", "plateNumber"])),
    group_category: textOrNull(firstValue(input, ["group_category", "groupCategory"])),
    driver_name: textOrNull(firstValue(input, ["driver_name", "driverName"])),
    helper_name: textOrNull(firstValue(input, ["helper_name", "helperName"])),
    source: textOrNull(input.source),
    destination: textOrNull(input.destination),
    reference_no: textOrNull(firstValue(input, ["reference_no", "referenceNo", "shipmentNumber"])),
    po_number: textOrNull(firstValue(input, ["po_number", "poNumber"])),
    diesel: numberOrZero(input.diesel),
    cost_per_liter: numberOrZero(firstValue(input, ["cost_per_liter", "costPerLiter"])),
    driver_salary: numberOrZero(firstValue(input, ["driver_salary", "driverSalary"])),
    helper_salary: numberOrZero(firstValue(input, ["helper_salary", "helperSalary"])),
    toll: numberOrZero(firstValue(input, ["toll", "tollFee"])),
    passway: numberOrZero(input.passway),
    parking: numberOrZero(input.parking),
    lagay_loaded: numberOrZero(firstValue(input, ["lagay_loaded", "lagayLoaded"])),
    lagay_empty: numberOrZero(firstValue(input, ["lagay_empty", "lagayEmpty"])),
    mano: numberOrZero(input.mano),
    vulcanize: numberOrZero(input.vulcanize),
    allowance_driver: numberOrZero(firstValue(input, ["allowance_driver", "allowanceDriver", "driverAllowance"])),
    allowance_helper: numberOrZero(firstValue(input, ["allowance_helper", "allowanceHelper", "helperAllowance"])),
    truck_wash: numberOrZero(firstValue(input, ["truck_wash", "truckWash", "hugasTruck"])),
    checkpoint: numberOrZero(input.checkpoint),
    other_expenses: numberOrZero(firstValue(input, ["other_expenses", "otherExpenses"])),
    row_total: numberOrZero(firstValue(input, ["row_total", "rowTotal"])),
    rate_id: textOrNull(firstValue(input, ["rate_id", "rateId"])),
    rate_match_status: textOrNull(firstValue(input, ["rate_match_status", "rateMatchStatus"])) || "No Match",
    remarks: textOrNull(input.remarks),
    raw_data: input && typeof input === "object" ? input : {},
    is_deleted: boolFromValue(firstValue(input, ["is_deleted", "isDeleted"])),
    updated_at: new Date().toISOString()
  };
  return line;
}

function formatPayrollTripLine(r = {}) {
  return {
    id: r.id || r.line_id || "",
    line_id: r.line_id || "",
    lineId: r.line_id || "",
    payroll_id: r.payroll_id || "",
    payrollId: r.payroll_id || "",
    trip_date: r.trip_date || "",
    tripDate: r.trip_date || "",
    plate_number: r.plate_number || "",
    plateNumber: r.plate_number || "",
    group_category: r.group_category || "",
    groupCategory: r.group_category || "",
    driver_name: r.driver_name || "",
    driverName: r.driver_name || "",
    helper_name: r.helper_name || "",
    helperName: r.helper_name || "",
    source: r.source || "",
    destination: r.destination || "",
    reference_no: r.reference_no || "",
    referenceNo: r.reference_no || "",
    po_number: r.po_number || "",
    poNumber: r.po_number || "",
    diesel: r.diesel ?? 0,
    cost_per_liter: r.cost_per_liter ?? 0,
    costPerLiter: r.cost_per_liter ?? 0,
    driverSalary: r.driver_salary ?? 0,
    helperSalary: r.helper_salary ?? 0,
    tollFee: r.toll ?? 0,
    passway: r.passway ?? 0,
    parking: r.parking ?? 0,
    lagayLoaded: r.lagay_loaded ?? 0,
    lagayEmpty: r.lagay_empty ?? 0,
    mano: r.mano ?? 0,
    vulcanize: r.vulcanize ?? 0,
    driverAllowance: r.allowance_driver ?? 0,
    helperAllowance: r.allowance_helper ?? 0,
    hugasTruck: r.truck_wash ?? 0,
    checkpoint: r.checkpoint ?? 0,
    otherExpenses: r.other_expenses ?? 0,
    rowTotal: r.row_total ?? 0,
    rate_id: r.rate_id || "",
    rateId: r.rate_id || "",
    rate_match_status: r.rate_match_status || "No Match",
    rateMatchStatus: r.rate_match_status || "No Match",
    remarks: r.remarks || "",
    raw_data: r.raw_data || {},
    is_deleted: r.is_deleted || false,
    created_at: r.created_at || "",
    updated_at: r.updated_at || ""
  };
}

// ── 1. GET /api/payroll/list ──────────────────────────────────────────────────

export async function listPayrollRecordsFromSupabase(env, searchParams) {
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 1000);
  const includeDeleted = String(searchParams.get("includeDeleted") || "").toLowerCase() === "true";

  const filters = new URLSearchParams({
    select: "*",
    order: "payroll_date.desc,created_at.desc",
    limit: String(limit)
  });

  if (!includeDeleted) filters.set("or", "(is_deleted.is.false,is_deleted.is.null)");
  if (searchParams.get("status")) filters.set("status", `eq.${searchParams.get("status")}`);
  if (searchParams.get("approval_status")) filters.set("approval_status", `eq.${searchParams.get("approval_status")}`);
  if (searchParams.get("payment_status")) filters.set("payment_status", `eq.${searchParams.get("payment_status")}`);
  if (searchParams.get("group_category")) filters.set("group_category", `eq.${searchParams.get("group_category")}`);
  if (searchParams.get("plate_number")) filters.set("plate_number", `eq.${searchParams.get("plate_number")}`);
  if (searchParams.get("driver_name")) filters.set("driver_name", `ilike.${searchParams.get("driver_name")}`);
  if (searchParams.get("helper_name")) filters.set("helper_name", `ilike.${searchParams.get("helper_name")}`);
  if (searchParams.get("payroll_date")) filters.set("payroll_date", `eq.${searchParams.get("payroll_date")}`);
  if (searchParams.get("cutoff_from")) filters.set("cutoff_from", `gte.${searchParams.get("cutoff_from")}`);
  if (searchParams.get("cutoff_to")) filters.set("cutoff_to", `lte.${searchParams.get("cutoff_to")}`);

  const result = await supabaseFetch(env, `payroll_records?${filters.toString()}`, {
    method: "GET"
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const records = Array.isArray(result.body) ? result.body : [];
  return {
    ok: true,
    source: "supabase",
    records: records.map(formatPayrollRecord),
    count: records.length
  };
}

// ── 2. POST /api/payroll/create ───────────────────────────────────────────────

export async function upsertPayrollRecordToSupabase(env, input) {
  const raw = Array.isArray(input) ? input[0] : (input?.record ?? input);
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "No valid payroll record provided", status: 400 };
  }

  const record = mapPayrollRecord(raw);

  const result = await supabaseFetch(env, "payroll_records?on_conflict=payroll_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([record])
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const saved = Array.isArray(result.body) ? result.body[0] : null;
  return {
    ok: true,
    source: "supabase",
    payroll_id: record.payroll_id,
    record: formatPayrollRecord(saved || record)
  };
}

// ── 3. POST /api/payroll/update-status ───────────────────────────────────────

export async function updatePayrollStatusInSupabase(env, input = {}) {
  const payrollId = textOrNull(input.payroll_id || input.payrollId || input.id);
  if (!payrollId) {
    return { ok: false, error: "payroll_id is required", status: 400 };
  }

  const rawStatus = textOrNull(input.status || input.Status);
  const rawApprovalStatus = textOrNull(input.approval_status || input.approvalStatus);
  const rawPaymentStatus = textOrNull(input.payment_status || input.paymentStatus);

  if (rawStatus && !VALID_PAYROLL_STATUSES.has(rawStatus)) {
    return {
      ok: false,
      error: `Invalid status "${rawStatus}". Valid: ${[...VALID_PAYROLL_STATUSES].join(", ")}`,
      status: 400
    };
  }
  if (rawPaymentStatus && !VALID_PAYMENT_STATUSES.has(rawPaymentStatus)) {
    return {
      ok: false,
      error: `Invalid payment_status "${rawPaymentStatus}". Valid: ${[...VALID_PAYMENT_STATUSES].join(", ")}`,
      status: 400
    };
  }

  const now = new Date().toISOString();
  const payload = { updated_at: now };

  if (rawStatus) payload.status = rawStatus;

  if (rawApprovalStatus) {
    payload.approval_status = normalizeApprovalStatus(rawApprovalStatus);
  } else if (rawStatus) {
    payload.approval_status = derivedApprovalStatus(rawStatus, undefined);
  }

  if (rawPaymentStatus) payload.payment_status = rawPaymentStatus;

  const approvedBy = textOrNull(input.approved_by || input.approvedBy);
  const approvedAt = timestampOrNull(input.approved_at || input.approvedAt);
  const depositedAt = timestampOrNull(input.deposited_at || input.depositedAt);

  if (approvedBy) payload.approved_by = approvedBy;
  if (approvedAt) {
    payload.approved_at = approvedAt;
  } else if (rawStatus === "Approved") {
    payload.approved_at = now;
  }
  if (depositedAt) {
    payload.deposited_at = depositedAt;
  } else if (rawStatus === "Deposited") {
    payload.deposited_at = now;
  }

  const filters = new URLSearchParams({ payroll_id: `eq.${payrollId}` });
  const result = await supabaseFetch(env, `payroll_records?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const records = Array.isArray(result.body) ? result.body : [];
  if (!records.length) {
    return { ok: false, error: `No payroll record found for payroll_id ${payrollId}`, status: 404 };
  }

  return {
    ok: true,
    source: "supabase",
    payroll_id: payrollId,
    record: formatPayrollRecord(records[0])
  };
}

// ── 4. GET /api/payroll/balances ──────────────────────────────────────────────

export async function listPersonBalancesFromSupabase(env, searchParams) {
  const filters = new URLSearchParams({
    select: "*",
    order: "updated_at.desc"
  });

  filters.set("or", "(is_deleted.is.false,is_deleted.is.null)");

  const personName = searchParams.get("person_name");
  const personRole = searchParams.get("person_role") || searchParams.get("role");
  const plateNumber = searchParams.get("plate_number");
  const groupCategory = searchParams.get("group_category");

  if (personName) filters.set("person_name", `ilike.${personName}`);
  if (personRole) filters.set("person_role", `eq.${personRole}`);
  if (plateNumber) filters.set("plate_number", `eq.${plateNumber}`);
  if (groupCategory) filters.set("group_category", `eq.${groupCategory}`);

  const result = await supabaseFetch(env, `person_balances?${filters.toString()}`, {
    method: "GET"
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const balances = Array.isArray(result.body) ? result.body : [];
  return {
    ok: true,
    source: "supabase",
    balances,
    count: balances.length
  };
}

// ── 5. POST /api/payroll/balance-event ────────────────────────────────────────

export async function createPayrollBalanceEventInSupabase(env, input = {}) {
  const personName = textOrNull(input.person_name || input.personName);
  const personRole = textOrNull(input.person_role || input.personRole);
  const eventType = textOrNull(input.event_type || input.eventType);
  const amount = numberOrNull(input.amount);

  if (!personName || !personRole) {
    return { ok: false, error: "person_name and person_role are required", status: 400 };
  }
  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
    return {
      ok: false,
      error: `Invalid event_type. Valid: ${[...VALID_EVENT_TYPES].join(", ")}`,
      status: 400
    };
  }
  if (amount === null) {
    return { ok: false, error: "amount must be a valid number", status: 400 };
  }

  const eventId = textOrNull(input.event_id || input.eventId) ||
    `be_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    event_id: eventId,
    person_name: personName,
    person_role: personRole,
    plate_number: textOrNull(input.plate_number || input.plateNumber),
    group_category: textOrNull(input.group_category || input.groupCategory),
    event_type: eventType,
    amount,
    payroll_id: textOrNull(input.payroll_id || input.payrollId),
    cash_request_id: textOrNull(input.cash_request_id || input.cashRequestId),
    notes: textOrNull(input.notes || input.Notes),
    created_at: new Date().toISOString(),
    raw_data: (input && typeof input === "object") ? input : {}
  };

  const result = await supabaseFetch(env, "payroll_balance_events?on_conflict=event_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([record])
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const saved = Array.isArray(result.body) ? result.body[0] : null;
  return {
    ok: true,
    source: "supabase",
    event_id: eventId,
    record: saved || record
  };
}

export async function listPayrollRatesFromSupabase(env, searchParams) {
  const filters = new URLSearchParams({
    select: "*",
    order: "group_category.asc,source.asc,destination.asc",
    limit: String(Math.min(Math.max(Number(searchParams.get("limit") || 1000), 1), 5000))
  });

  if (String(searchParams.get("active") || "true").toLowerCase() !== "false") filters.set("active", "eq.true");
  if (searchParams.get("group_category")) filters.set("group_category", `eq.${searchParams.get("group_category")}`);
  if (searchParams.get("source")) filters.set("source", `ilike.${searchParams.get("source")}`);
  if (searchParams.get("destination")) filters.set("destination", `ilike.${searchParams.get("destination")}`);
  if (searchParams.get("truck_type")) filters.set("truck_type", `ilike.${searchParams.get("truck_type")}`);

  const result = await supabaseFetch(env, `payroll_rate_matrix?${filters.toString()}`, { method: "GET" });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  const rates = Array.isArray(result.body) ? result.body : [];
  return { ok: true, source: "supabase", rates: rates.map(formatPayrollRate), count: rates.length };
}

export async function upsertPayrollRateToSupabase(env, input = {}) {
  const raw = input?.rate ?? input;
  if (!raw || typeof raw !== "object") return { ok: false, error: "No valid payroll rate provided", status: 400 };
  const rate = mapPayrollRate(raw);
  const result = await supabaseFetch(env, "payroll_rate_matrix?on_conflict=rate_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([rate])
  });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  const saved = Array.isArray(result.body) ? result.body[0] : null;
  return { ok: true, source: "supabase", rate_id: rate.rate_id, rate: formatPayrollRate(saved || rate) };
}

export async function listPayrollTripLinesFromSupabase(env, searchParams) {
  const filters = new URLSearchParams({
    select: "*",
    order: "trip_date.asc,created_at.asc",
    limit: String(Math.min(Math.max(Number(searchParams.get("limit") || 1000), 1), 5000))
  });
  if (String(searchParams.get("includeDeleted") || "").toLowerCase() !== "true") filters.set("or", "(is_deleted.is.false,is_deleted.is.null)");
  if (searchParams.get("payroll_id")) filters.set("payroll_id", `eq.${searchParams.get("payroll_id")}`);
  if (searchParams.get("plate_number")) filters.set("plate_number", `eq.${searchParams.get("plate_number")}`);
  if (searchParams.get("group_category")) filters.set("group_category", `eq.${searchParams.get("group_category")}`);

  const result = await supabaseFetch(env, `payroll_trip_lines?${filters.toString()}`, { method: "GET" });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  const lines = Array.isArray(result.body) ? result.body : [];
  return { ok: true, source: "supabase", lines: lines.map(formatPayrollTripLine), count: lines.length };
}

export async function upsertPayrollTripLinesToSupabase(env, input = {}) {
  const rawLines = Array.isArray(input) ? input : Array.isArray(input.lines) ? input.lines : [input.line ?? input];
  const lines = rawLines
    .filter(line => line && typeof line === "object")
    .map(line => mapPayrollTripLine(line));
  if (!lines.length) return { ok: false, error: "No valid payroll trip lines provided", status: 400 };

  const result = await supabaseFetch(env, "payroll_trip_lines?on_conflict=line_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(lines)
  });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  const saved = Array.isArray(result.body) ? result.body : lines;
  return {
    ok: true,
    source: "supabase",
    count: saved.length,
    lines: saved.map(formatPayrollTripLine)
  };
}
