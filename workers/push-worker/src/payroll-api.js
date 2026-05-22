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

function friendlyDateStamp(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function generateFriendlyId(env, table, field, prefix, dateValue) {
  const stamp = friendlyDateStamp(dateValue);
  const start = `${prefix}-${stamp}-`;
  const filters = new URLSearchParams({ select: field, [field]: `like.${start}%`, order: `${field}.desc`, limit: "100" });
  const result = await supabaseFetch(env, `${table}?${filters.toString()}`, { method: "GET" });
  if (result.error) {
    console.warn("Friendly ID lookup failed; using fallback", { table, field, prefix, error: result.error });
    return `${start}${String(Date.now()).slice(-3)}`;
  }
  const highest = (Array.isArray(result.body) ? result.body : []).reduce((max, row) => {
    const match = String(row?.[field] || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${start}${String(highest + 1).padStart(3, "0")}`;
}

function payrollMissingPaymentColumn(result = {}) {
  return /payment_ref_id|payment_reference|payment_notes|paid_at|payroll_ref_id|driver_payment|helper_payment/i.test(String(result.details?.message || result.error || result.details || ""));
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
    payroll_ref_id: textOrNull(firstValue(input, ["payroll_ref_id", "payrollRefId", "Payroll_Ref_ID"])),
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
    payment_ref_id: textOrNull(firstValue(input, ["payment_ref_id", "paymentRefId", "Payment_Ref_ID"])),
    payment_reference: textOrNull(firstValue(input, ["payment_reference", "paymentReference", "Payment_Reference"])),
    payment_notes: textOrNull(firstValue(input, ["payment_notes", "paymentNotes", "Payment_Notes"])),
    paid_at: timestampOrNull(firstValue(input, ["paid_at", "paidAt", "Paid_At"])),
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
    payroll_ref_id: r.payroll_ref_id || "",
    payrollRefId: r.payroll_ref_id || "",
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
    payment_ref_id: r.payment_ref_id || "",
    paymentRefId: r.payment_ref_id || "",
    payment_reference: r.payment_reference || "",
    paymentReference: r.payment_reference || "",
    payment_notes: r.payment_notes || "",
    paymentNotes: r.payment_notes || "",
    paid_at: r.paid_at || "",
    paidAt: r.paid_at || "",
    driver_payment_status: r.driver_payment_status || "Unpaid",
    driverPaymentStatus: r.driver_payment_status || "Unpaid",
    helper_payment_status: r.helper_payment_status || "Unpaid",
    helperPaymentStatus: r.helper_payment_status || "Unpaid",
    driver_paid_at: r.driver_paid_at || "",
    driverPaidAt: r.driver_paid_at || "",
    helper_paid_at: r.helper_paid_at || "",
    helperPaidAt: r.helper_paid_at || "",
    driver_payment_ref_id: r.driver_payment_ref_id || "",
    driverPaymentRefId: r.driver_payment_ref_id || "",
    helper_payment_ref_id: r.helper_payment_ref_id || "",
    helperPaymentRefId: r.helper_payment_ref_id || "",
    driver_payment_reference: r.driver_payment_reference || "",
    driverPaymentReference: r.driver_payment_reference || "",
    helper_payment_reference: r.helper_payment_reference || "",
    helperPaymentReference: r.helper_payment_reference || "",
    driver_payment_notes: r.driver_payment_notes || "",
    driverPaymentNotes: r.driver_payment_notes || "",
    helper_payment_notes: r.helper_payment_notes || "",
    helperPaymentNotes: r.helper_payment_notes || "",
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
  const tripDate = dateOrNull(firstValue(input, ["date", "trip_date", "tripDate"]));
  const groupCommodity = textOrNull(firstValue(input, ["group_commodity", "groupCommodity", "group_category", "groupCategory"]));
  const driver = textOrNull(firstValue(input, ["driver", "driver_name", "driverName"]));
  const helper = textOrNull(firstValue(input, ["helper", "helper_name", "helperName"]));
  const perLiter = numberOrZero(firstValue(input, ["per_liter", "perLiter", "cost_per_liter", "costPerLiter"]));
  const bayadSaDriver = numberOrZero(firstValue(input, ["bayad_sa_driver", "bayadSaDriver", "driver_salary", "driverSalary"]));
  const bayadSaHelper = numberOrZero(firstValue(input, ["bayad_sa_helper", "bayadSaHelper", "helper_salary", "helperSalary"]));
  const tollFee = numberOrZero(firstValue(input, ["toll_fee", "tollFee", "toll"]));
  const passWay = numberOrZero(firstValue(input, ["pass_way", "passWay", "passway"]));
  const hugasTruck = numberOrZero(firstValue(input, ["hugas_truck", "hugasTruck", "truck_wash", "truckWash"]));
  const line = {
    line_id: textOrNull(firstValue(input, ["line_id", "lineId", "id"])) || generatePayrollLineId(),
    payroll_id: textOrNull(firstValue(input, ["payroll_id", "payrollId", "payrollNumber"])),
    trip_date: tripDate,
    date: tripDate,
    plate_number: textOrNull(firstValue(input, ["plate_number", "plateNumber"])),
    group_category: groupCommodity,
    group_commodity: groupCommodity,
    driver_name: driver,
    driver,
    helper_name: helper,
    helper,
    source: textOrNull(input.source),
    destination: textOrNull(input.destination),
    reference_no: textOrNull(firstValue(input, ["reference_no", "referenceNo", "shipmentNumber"])),
    po_number: textOrNull(firstValue(input, ["po_number", "poNumber"])),
    shipment_number: textOrNull(firstValue(input, ["shipment_number", "shipmentNumber"])),
    container_number: textOrNull(firstValue(input, ["container_number", "containerNumber", "vanNumber"])),
    trip_type: textOrNull(firstValue(input, ["trip_type", "tripType"])),
    diesel: numberOrZero(input.diesel),
    cost_per_liter: perLiter,
    per_liter: perLiter,
    driver_salary: bayadSaDriver,
    bayad_sa_driver: bayadSaDriver,
    helper_salary: bayadSaHelper,
    bayad_sa_helper: bayadSaHelper,
    toll: tollFee,
    toll_fee: tollFee,
    passway: passWay,
    pass_way: passWay,
    parking: numberOrZero(input.parking),
    lagay_loaded: numberOrZero(firstValue(input, ["lagay_loaded", "lagayLoaded"])),
    lagay_empty: numberOrZero(firstValue(input, ["lagay_empty", "lagayEmpty"])),
    mano: numberOrZero(input.mano),
    timbang: numberOrZero(input.timbang),
    luna: numberOrZero(input.luna),
    vulcanize: numberOrZero(input.vulcanize),
    allowance_driver: numberOrZero(firstValue(input, ["allowance_driver", "allowanceDriver", "driverAllowance"])),
    allowance_helper: numberOrZero(firstValue(input, ["allowance_helper", "allowanceHelper", "helperAllowance"])),
    truck_wash: hugasTruck,
    hugas_truck: hugasTruck,
    checkpoint: numberOrZero(input.checkpoint),
    other_expenses: numberOrZero(firstValue(input, ["other_expenses", "otherExpenses"])),
    row_total: numberOrZero(firstValue(input, ["row_total", "rowTotal"])),
    rate_id: textOrNull(firstValue(input, ["rate_id", "rateId"])),
    rate_match_status: textOrNull(firstValue(input, ["rate_match_status", "rateMatchStatus"])) || "No Match",
    remarks: textOrNull(input.remarks),
    encoded_by: textOrNull(firstValue(input, ["encoded_by", "encodedBy"])),
    source_module: textOrNull(firstValue(input, ["source_module", "sourceModule"])) || "Payroll",
    source_file: textOrNull(firstValue(input, ["source_file", "sourceFile"])),
    status: textOrNull(input.status),
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
    date: r.date || r.trip_date || "",
    trip_date: r.trip_date || r.date || "",
    tripDate: r.date || r.trip_date || "",
    plate_number: r.plate_number || "",
    plateNumber: r.plate_number || "",
    group_category: r.group_category || r.group_commodity || "",
    groupCategory: r.group_commodity || r.group_category || "",
    group_commodity: r.group_commodity || r.group_category || "",
    groupCommodity: r.group_commodity || r.group_category || "",
    driver_name: r.driver_name || r.driver || "",
    driverName: r.driver || r.driver_name || "",
    driver: r.driver || r.driver_name || "",
    helper_name: r.helper_name || r.helper || "",
    helperName: r.helper || r.helper_name || "",
    helper: r.helper || r.helper_name || "",
    source: r.source || "",
    destination: r.destination || "",
    reference_no: r.reference_no || "",
    referenceNo: r.reference_no || "",
    po_number: r.po_number || "",
    poNumber: r.po_number || "",
    shipment_number: r.shipment_number || "",
    shipmentNumber: r.shipment_number || "",
    container_number: r.container_number || "",
    containerNumber: r.container_number || "",
    trip_type: r.trip_type || "",
    tripType: r.trip_type || "",
    diesel: r.diesel ?? 0,
    cost_per_liter: r.cost_per_liter ?? r.per_liter ?? 0,
    costPerLiter: r.per_liter ?? r.cost_per_liter ?? 0,
    per_liter: r.per_liter ?? r.cost_per_liter ?? 0,
    perLiter: r.per_liter ?? r.cost_per_liter ?? 0,
    driver_salary: r.driver_salary ?? r.bayad_sa_driver ?? 0,
    driverSalary: r.bayad_sa_driver ?? r.driver_salary ?? 0,
    bayad_sa_driver: r.bayad_sa_driver ?? r.driver_salary ?? 0,
    bayadSaDriver: r.bayad_sa_driver ?? r.driver_salary ?? 0,
    helper_salary: r.helper_salary ?? r.bayad_sa_helper ?? 0,
    helperSalary: r.bayad_sa_helper ?? r.helper_salary ?? 0,
    bayad_sa_helper: r.bayad_sa_helper ?? r.helper_salary ?? 0,
    bayadSaHelper: r.bayad_sa_helper ?? r.helper_salary ?? 0,
    toll: r.toll ?? r.toll_fee ?? 0,
    tollFee: r.toll_fee ?? r.toll ?? 0,
    toll_fee: r.toll_fee ?? r.toll ?? 0,
    passway: r.pass_way ?? r.passway ?? 0,
    pass_way: r.pass_way ?? r.passway ?? 0,
    passWay: r.pass_way ?? r.passway ?? 0,
    parking: r.parking ?? 0,
    lagayLoaded: r.lagay_loaded ?? 0,
    lagayEmpty: r.lagay_empty ?? 0,
    mano: r.mano ?? 0,
    timbang: r.timbang ?? 0,
    luna: r.luna ?? 0,
    vulcanize: r.vulcanize ?? 0,
    driverAllowance: r.allowance_driver ?? 0,
    helperAllowance: r.allowance_helper ?? 0,
    hugasTruck: r.hugas_truck ?? r.truck_wash ?? 0,
    hugas_truck: r.hugas_truck ?? r.truck_wash ?? 0,
    checkpoint: r.checkpoint ?? 0,
    otherExpenses: r.other_expenses ?? 0,
    rowTotal: r.row_total ?? 0,
    rate_id: r.rate_id || "",
    rateId: r.rate_id || "",
    rate_match_status: r.rate_match_status || "No Match",
    rateMatchStatus: r.rate_match_status || "No Match",
    remarks: r.remarks || "",
    encoded_by: r.encoded_by || "",
    encodedBy: r.encoded_by || "",
    source_module: r.source_module || "",
    sourceModule: r.source_module || "",
    source_file: r.source_file || "",
    sourceFile: r.source_file || "",
    status: r.status || "",
    lineStatus: r.status || "",
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

  if (!record.payroll_ref_id) {
    if (/^PAY-\d{8}-\d+$/.test(record.payroll_id)) {
      record.payroll_ref_id = record.payroll_id;
    } else {
      record.payroll_ref_id = await generateFriendlyId(env, "payroll_records", "payroll_ref_id", "PAY", record.payroll_date || null);
    }
  }

  let result = await supabaseFetch(env, "payroll_records?on_conflict=payroll_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([record])
  });

  if (payrollMissingPaymentColumn(result)) {
    console.warn("Payroll payment/ref columns missing. Retrying payroll save without optional payment fields. Apply friendly-ref-ids-and-payment-fields.sql.");
    const fallbackRecord = { ...record };
    delete fallbackRecord.payroll_ref_id;
    delete fallbackRecord.payment_ref_id;
    delete fallbackRecord.payment_reference;
    delete fallbackRecord.payment_notes;
    delete fallbackRecord.paid_at;
    result = await supabaseFetch(env, "payroll_records?on_conflict=payroll_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify([fallbackRecord])
    });
  }

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const saved = Array.isArray(result.body) ? result.body[0] : null;
  return {
    ok: true,
    source: "supabase",
    payroll_id: record.payroll_id,
    payroll_ref_id: record.payroll_ref_id,
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
  const paymentReference = textOrNull(input.payment_reference || input.paymentReference || input.Payment_Reference);
  const paymentNotes = textOrNull(input.payment_notes || input.paymentNotes || input.Payment_Notes);
  const paidAt = timestampOrNull(input.paid_at || input.paidAt || input.Paid_At);

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
  if (paymentReference) payload.payment_reference = paymentReference;
  if (paymentNotes) payload.payment_notes = paymentNotes;
  if (paidAt) {
    payload.paid_at = paidAt;
  } else if (rawStatus === "Paid" || rawPaymentStatus === "Paid") {
    payload.paid_at = now;
  }
  if ((rawStatus === "Paid" || rawPaymentStatus === "Paid") && !textOrNull(input.payment_ref_id || input.paymentRefId || input.Payment_Ref_ID)) {
    payload.payment_ref_id = await generateFriendlyId(env, "payroll_records", "payment_ref_id", "PMT", now);
  } else {
    const paymentRefId = textOrNull(input.payment_ref_id || input.paymentRefId || input.Payment_Ref_ID);
    if (paymentRefId) payload.payment_ref_id = paymentRefId;
  }

  // Per-person payment: driver and helper can be paid independently.
  const personTarget = textOrNull(input.person_target || input.personTarget);
  if (personTarget === "driver" || personTarget === "helper") {
    const isDriver = personTarget === "driver";
    const personPaidAt = timestampOrNull(
      isDriver
        ? (input.driver_paid_at || input.driverPaidAt)
        : (input.helper_paid_at || input.helperPaidAt)
    ) || now;
    if (isDriver) {
      payload.driver_payment_status = "Paid";
      payload.driver_paid_at = personPaidAt;
      const driverRef = textOrNull(input.driver_payment_reference || input.driverPaymentReference);
      const driverNotes = textOrNull(input.driver_payment_notes || input.driverPaymentNotes);
      if (driverRef) payload.driver_payment_reference = driverRef;
      if (driverNotes) payload.driver_payment_notes = driverNotes;
      payload.driver_payment_ref_id = await generateFriendlyId(env, "payroll_records", "driver_payment_ref_id", "PMT", now);
    } else {
      payload.helper_payment_status = "Paid";
      payload.helper_paid_at = personPaidAt;
      const helperRef = textOrNull(input.helper_payment_reference || input.helperPaymentReference);
      const helperNotes = textOrNull(input.helper_payment_notes || input.helperPaymentNotes);
      if (helperRef) payload.helper_payment_reference = helperRef;
      if (helperNotes) payload.helper_payment_notes = helperNotes;
      payload.helper_payment_ref_id = await generateFriendlyId(env, "payroll_records", "helper_payment_ref_id", "PMT", now);
    }
  }

  const filters = new URLSearchParams({ payroll_id: `eq.${payrollId}` });
  let result = await supabaseFetch(env, `payroll_records?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });

  if (payrollMissingPaymentColumn(result)) {
    console.warn("Payroll payment/ref columns missing. Retrying status update without optional payment fields. Apply friendly-ref-ids-and-payment-fields.sql.");
    const fallbackPayload = { ...payload };
    delete fallbackPayload.payment_ref_id;
    delete fallbackPayload.payment_reference;
    delete fallbackPayload.payment_notes;
    delete fallbackPayload.paid_at;
    ["driver_payment_status","driver_paid_at","driver_payment_ref_id","driver_payment_reference","driver_payment_notes",
     "helper_payment_status","helper_paid_at","helper_payment_ref_id","helper_payment_reference","helper_payment_notes"
    ].forEach(f => delete fallbackPayload[f]);
    result = await supabaseFetch(env, `payroll_records?${filters.toString()}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify(fallbackPayload)
    });
  }

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

export async function listPayrollTripLinesByPlateFromSupabase(env, searchParams) {
  const plateNumber = textOrNull(searchParams.get("plate_number") || searchParams.get("plateNumber"));
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 4), 1), 50);
  if (!plateNumber) return { ok: false, error: "plate_number is required", status: 400 };

  const payrollFilters = new URLSearchParams({
    select: "payroll_id",
    plate_number: `eq.${plateNumber}`,
    order: "payroll_date.desc,created_at.desc",
    limit: "200"
  });
  payrollFilters.set("or", "(is_deleted.is.false,is_deleted.is.null)");

  const payrollResult = await supabaseFetch(env, `payroll_records?${payrollFilters.toString()}`, { method: "GET" });
  if (payrollResult.error) return { ok: false, error: SAFE_ERROR, details: payrollResult.error, status: payrollResult.status || 500 };

  const payrollIds = (Array.isArray(payrollResult.body) ? payrollResult.body : [])
    .map(record => textOrNull(record.payroll_id))
    .filter(Boolean);

  const fetchLimit = Math.max(limit * 10, 50);
  const lineFilters = new URLSearchParams({
    select: "payroll_id,source,destination,driver_salary,helper_salary,trip_date,rate_id,rate_match_status,plate_number,driver_name,helper_name",
    order: "trip_date.desc,created_at.desc",
    limit: String(fetchLimit)
  });
  lineFilters.set("or", "(is_deleted.is.false,is_deleted.is.null)");

  if (payrollIds.length) {
    lineFilters.set("payroll_id", `in.(${payrollIds.join(",")})`);
  } else {
    lineFilters.set("plate_number", `eq.${plateNumber}`);
  }

  const linesResult = await supabaseFetch(env, `payroll_trip_lines?${lineFilters.toString()}`, { method: "GET" });
  if (linesResult.error) return { ok: false, error: SAFE_ERROR, details: linesResult.error, status: linesResult.status || 500 };

  const lines = (Array.isArray(linesResult.body) ? linesResult.body : [])
    .filter(line => !line.plate_number || String(line.plate_number).trim().toUpperCase() === plateNumber.toUpperCase())
    .sort((a, b) => {
      const dateSort = String(b.trip_date || "").localeCompare(String(a.trip_date || ""));
      if (dateSort) return dateSort;
      const aMatched = String(a.rate_match_status || "").toLowerCase() === "matched" && textOrNull(a.rate_id) ? 1 : 0;
      const bMatched = String(b.rate_match_status || "").toLowerCase() === "matched" && textOrNull(b.rate_id) ? 1 : 0;
      return bMatched - aMatched;
    })
    .slice(0, limit);

  return {
    ok: true,
    source: "supabase",
    plate_number: plateNumber,
    lines: lines.map(formatPayrollTripLine),
    count: lines.length
  };
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

function budgetBalanceDate(record = {}) {
  return dateOrNull(firstValue(record, ["request_date", "payroll_date", "created_at", "updated_at"])) ||
    dateOrNull(record.created_at) ||
    "";
}

function budgetBalanceStatus(record = {}) {
  const payment = String(record.payment_status || "").trim().toLowerCase();
  const approval = String(record.approval_status || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  if (["cancelled", "canceled", "rejected", "returned"].includes(status) || ["cancelled", "canceled", "rejected", "returned"].includes(approval)) return "Cancelled";
  if (["paid", "released", "deposited", "used"].includes(payment) || ["paid", "released", "deposited", "used"].includes(status)) return "Paid / Released";
  if (approval === "approved" || status === "approved") return "Approved";
  if (["pending", "for approval", "submitted", "for review"].includes(approval) || ["pending", "for approval", "submitted", "for review"].includes(status)) return "For Approval";
  if (["deducted", "salary deduction"].includes(status)) return "Deducted";
  return "Open";
}

function normalizeBudgetBalanceGroup(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "";
  if (lower.includes("bottle")) return "Bottle";
  if (lower.includes("sugar")) return "Sugar";
  if (lower.includes("preform") || lower.includes("resin")) return "Preform and Resin";
  if (lower.includes("cap") || lower.includes("crown")) return "Caps and Crown";
  if (lower.includes("2go") || lower.includes("2 go")) return "2GO";
  return text;
}

function budgetBalanceCashType(record = {}) {
  const rawType = String(record.request_type || "").trim();
  const type = rawType.toLowerCase();
  if (type.includes("diesel")) return "Diesel PO";
  if (type.includes("budget")) return "Trip Budget";
  if (type.includes("bali") || type.includes("cash advance")) return "Bali / Cash Advance";
  return "";
}

function budgetBalancePersonRole(record = {}) {
  const raw = record.raw_data && typeof record.raw_data === "object" ? record.raw_data : {};
  const role = textOrNull(firstValue(raw, ["role", "Role", "person_role", "personRole"]));
  if (role) return role;
  const person = String(record.receiver_name || "").trim().toLowerCase();
  if (person && person === String(record.helper_name || "").trim().toLowerCase()) return "Helper";
  if (person && person === String(record.driver_name || "").trim().toLowerCase()) return "Driver";
  return "";
}

function cashToBudgetBalanceTransaction(record = {}) {
  const type = budgetBalanceCashType(record);
  if (!type) return null;
  const person = type === "Bali / Cash Advance"
    ? textOrNull(record.receiver_name || record.driver_name || record.helper_name)
    : textOrNull([record.driver_name, record.helper_name].filter(Boolean).join(" / "));
  return {
    id: record.request_id || record.id || "",
    date: budgetBalanceDate(record),
    plate: record.plate_number || "",
    group: normalizeBudgetBalanceGroup(record.group_name),
    person: person || "",
    role: type === "Bali / Cash Advance" ? budgetBalancePersonRole(record) : "",
    type,
    details: [record.budget_type, record.source, record.destination, record.remarks].filter(Boolean).join(" | "),
    amount: Number(record.amount) || 0,
    source: "cash_requests",
    status: budgetBalanceStatus(record),
    payrollId: "",
    cutoff: "",
    raw: record
  };
}

function balanceEventToBudgetBalanceTransaction(record = {}, payrollById = new Map()) {
  const eventType = String(record.event_type || "").trim();
  const normalized = eventType.toLowerCase();
  const payroll = payrollById.get(String(record.payroll_id || ""));
  let type = "Adjustment";
  let status = "Open";
  if (normalized.includes("deduction")) {
    type = "Payroll Deduction";
    status = "Deducted";
  } else if (normalized.includes("bali") || normalized.includes("cash advance")) {
    type = "Bali / Cash Advance";
  }
  return {
    id: record.event_id || record.id || "",
    date: dateOrNull(record.created_at) || "",
    plate: record.plate_number || payroll?.plate_number || "",
    group: normalizeBudgetBalanceGroup(record.group_category || payroll?.group_category),
    person: record.person_name || "",
    role: record.person_role || "",
    type,
    details: record.notes || eventType || "Balance event",
    amount: Number(record.amount) || 0,
    source: "payroll_balance_events",
    status,
    payrollId: record.payroll_id || "",
    cutoff: payroll ? [payroll.cutoff_from, payroll.cutoff_to].filter(Boolean).join(" to ") : "",
    raw: record
  };
}

function budgetBalanceMatches(transaction = {}, searchParams) {
  const group = String(searchParams.get("group") || "").trim();
  const plate = String(searchParams.get("plate") || "").trim().toLowerCase();
  const person = String(searchParams.get("person") || "").trim().toLowerCase();
  const status = String(searchParams.get("status") || "").trim();
  const dateFrom = dateOrNull(searchParams.get("date_from"));
  const dateTo = dateOrNull(searchParams.get("date_to"));
  const txDate = dateOrNull(transaction.date);

  if (group && group !== "All Groups" && transaction.group !== group) return false;
  if (plate && !String(transaction.plate || "").toLowerCase().includes(plate)) return false;
  if (person && !String(transaction.person || "").toLowerCase().includes(person)) return false;
  if (status && status !== "All" && transaction.status !== status) return false;
  if (dateFrom && txDate && txDate < dateFrom) return false;
  if (dateTo && txDate && txDate > dateTo) return false;
  return true;
}

function latestDate(records, predicate) {
  return records
    .filter(predicate)
    .map(record => dateOrNull(record.date))
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function sumAmounts(records, predicate) {
  return records.filter(predicate).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

function buildBudgetBalanceSummary(transactions, balances, selectedPlate, selectedPerson) {
  const selectedPlateNorm = String(selectedPlate || "").trim().toLowerCase();
  const selectedPersonNorm = String(selectedPerson || "").trim().toLowerCase();
  const plateRows = selectedPlateNorm
    ? transactions.filter(row => String(row.plate || "").toLowerCase().includes(selectedPlateNorm))
    : transactions;
  const personRows = selectedPersonNorm
    ? transactions.filter(row => String(row.person || "").toLowerCase().includes(selectedPersonNorm))
    : transactions;
  const selectedDriver = balances.find(row => String(row.person_role || "").toLowerCase() === "driver" &&
    (!selectedPersonNorm || String(row.person_name || "").toLowerCase().includes(selectedPersonNorm))) || {};
  const selectedHelper = balances.find(row => String(row.person_role || "").toLowerCase() === "helper" &&
    (!selectedPersonNorm || String(row.person_name || "").toLowerCase().includes(selectedPersonNorm))) || {};

  return {
    truckBudget: {
      selectedPlate: selectedPlate || plateRows.find(row => row.plate)?.plate || "All Plates",
      group: plateRows.find(row => row.group)?.group || "All Groups",
      openTripBudgetTotal: sumAmounts(plateRows, row => row.type === "Trip Budget" && !["Paid / Released", "Cancelled", "Deducted"].includes(row.status)),
      openDieselPoTotal: sumAmounts(plateRows, row => row.type === "Diesel PO" && !["Paid / Released", "Cancelled", "Deducted"].includes(row.status)),
      latestBudgetDate: latestDate(plateRows, row => row.type === "Trip Budget"),
      latestPoDate: latestDate(plateRows, row => row.type === "Diesel PO")
    },
    driverBalance: {
      name: selectedDriver.person_name || personRows.find(row => row.role === "Driver")?.person || "All Drivers",
      currentBalance: Number(selectedDriver.current_balance) || 0,
      latestBaliDate: latestDate(personRows, row => row.role === "Driver" && row.type === "Bali / Cash Advance"),
      totalBaliCashAdvance: sumAmounts(personRows, row => row.role === "Driver" && row.type === "Bali / Cash Advance"),
      totalPayrollDeductions: sumAmounts(personRows, row => row.role === "Driver" && row.type === "Payroll Deduction")
    },
    helperBalance: {
      name: selectedHelper.person_name || personRows.find(row => row.role === "Helper")?.person || "All Helpers",
      currentBalance: Number(selectedHelper.current_balance) || 0,
      latestBaliDate: latestDate(personRows, row => row.role === "Helper" && row.type === "Bali / Cash Advance"),
      totalBaliCashAdvance: sumAmounts(personRows, row => row.role === "Helper" && row.type === "Bali / Cash Advance"),
      totalPayrollDeductions: sumAmounts(personRows, row => row.role === "Helper" && row.type === "Payroll Deduction")
    },
    payrollReadiness: {
      openBudgetCount: plateRows.filter(row => row.type === "Trip Budget" && !["Paid / Released", "Cancelled", "Deducted"].includes(row.status)).length,
      openPoCount: plateRows.filter(row => row.type === "Diesel PO" && !["Paid / Released", "Cancelled", "Deducted"].includes(row.status)).length,
      openBaliCount: personRows.filter(row => row.type === "Bali / Cash Advance" && !["Deducted", "Cancelled"].includes(row.status)).length,
      recordsNeedingReview: transactions.filter(row => ["Open", "For Approval"].includes(row.status)).length
    }
  };
}

async function loadBudgetBalanceRaw(env) {
  const cashResult = await supabaseFetch(env, "cash_requests?select=*&or=(is_deleted.is.false,is_deleted.is.null)&order=request_date.desc,created_at.desc&limit=1000", { method: "GET" });
  if (cashResult.error) return { ok: false, error: SAFE_ERROR, details: cashResult.error, status: cashResult.status || 500 };
  const eventsResult = await supabaseFetch(env, "payroll_balance_events?select=*&order=created_at.desc&limit=1000", { method: "GET" });
  if (eventsResult.error) return { ok: false, error: SAFE_ERROR, details: eventsResult.error, status: eventsResult.status || 500 };
  const balancesResult = await supabaseFetch(env, "person_balances?select=*&or=(is_deleted.is.false,is_deleted.is.null)&order=updated_at.desc&limit=1000", { method: "GET" });
  if (balancesResult.error) return { ok: false, error: SAFE_ERROR, details: balancesResult.error, status: balancesResult.status || 500 };
  const payrollResult = await supabaseFetch(env, "payroll_records?select=*&or=(is_deleted.is.false,is_deleted.is.null)&order=payroll_date.desc,created_at.desc&limit=1000", { method: "GET" });
  if (payrollResult.error) return { ok: false, error: SAFE_ERROR, details: payrollResult.error, status: payrollResult.status || 500 };

  return {
    ok: true,
    cash: Array.isArray(cashResult.body) ? cashResult.body : [],
    events: Array.isArray(eventsResult.body) ? eventsResult.body : [],
    balances: Array.isArray(balancesResult.body) ? balancesResult.body : [],
    payroll: Array.isArray(payrollResult.body) ? payrollResult.body : []
  };
}

export async function listBudgetBalanceTransactionsFromSupabase(env, searchParams) {
  const raw = await loadBudgetBalanceRaw(env);
  if (!raw.ok) return raw;

  const payrollById = new Map(raw.payroll.map(record => [String(record.payroll_id || ""), record]));
  const transactions = [
    ...raw.cash.map(cashToBudgetBalanceTransaction).filter(Boolean),
    ...raw.events.map(record => balanceEventToBudgetBalanceTransaction(record, payrollById))
  ]
    .filter(row => budgetBalanceMatches(row, searchParams))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return {
    ok: true,
    source: "supabase",
    transactions,
    count: transactions.length
  };
}

export async function getBudgetBalanceSummaryFromSupabase(env, searchParams) {
  const raw = await loadBudgetBalanceRaw(env);
  if (!raw.ok) return raw;

  const payrollById = new Map(raw.payroll.map(record => [String(record.payroll_id || ""), record]));
  const transactions = [
    ...raw.cash.map(cashToBudgetBalanceTransaction).filter(Boolean),
    ...raw.events.map(record => balanceEventToBudgetBalanceTransaction(record, payrollById))
  ].filter(row => budgetBalanceMatches(row, searchParams));

  return {
    ok: true,
    source: "supabase",
    summary: buildBudgetBalanceSummary(
      transactions,
      raw.balances,
      searchParams.get("plate") || "",
      searchParams.get("person") || ""
    )
  };
}
