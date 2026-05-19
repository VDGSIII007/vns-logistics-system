const SAFE_ERROR = "Payroll data service is unavailable";

const VALID_PAYROLL_STATUSES = new Set(["Draft", "For Approval", "Approved", "For Deposit", "Deposited", "Cancelled"]);
const VALID_PAYMENT_STATUSES = new Set(["Unpaid", "For Deposit", "Deposited", "Paid", "Cancelled"]);
const VALID_APPROVAL_STATUSES = new Set(["Draft", "For Approval", "Approved", "Returned", "Rejected", "Cancelled"]);
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
  if (payrollStatus === "For Approval") return "For Approval";
  if (payrollStatus === "Approved") return "Approved";
  if (payrollStatus === "For Deposit") return "Approved";
  if (payrollStatus === "Deposited") return "Approved";
  if (payrollStatus === "Returned") return "Returned";
  if (payrollStatus === "Rejected") return "Rejected";
  if (payrollStatus === "Cancelled") return "Cancelled";
  return existing || "Draft";
}

function generatePayrollId() {
  return `payroll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
