const CASH_ARRAY_KEYS = ["records", "entries", "data", "items", "rows", "result"];
const SAFE_ERROR = "Cash data service is unavailable";

function supabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase cash API is not configured" };
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

function timestampOrNow(value) {
  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function boolOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return null;
}

function boolFromValue(value) {
  return ["true", "yes", "1", "deleted"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeCashCreateStatuses(record = {}) {
  const rawStatus = textOrNull(firstValue(record, ["status", "Status", "Review_Status", "reviewStatus"]));
  const rawApprovalStatus = textOrNull(firstValue(record, ["approval_status", "approvalStatus", "Approval_Status"]));
  const rawPaymentStatus = textOrNull(firstValue(record, ["payment_status", "paymentStatus", "Payment_Status", "Posted_Status"]));
  const status = !rawStatus || rawStatus.toLowerCase() === "draft" ? "For Approval" : rawStatus;
  const approval_status = !rawApprovalStatus || rawApprovalStatus.toLowerCase() === "draft" ? "Pending" : rawApprovalStatus;
  const payment_status = rawPaymentStatus || "Unpaid";
  console.log("Cash normalized save status", { status, approval_status, payment_status });
  return { status, approval_status, payment_status };
}

function isDeletedCashRecord(record = {}) {
  const raw = record.raw_data && typeof record.raw_data === "object" ? record.raw_data : {};
  return boolFromValue(record.is_deleted) ||
    boolFromValue(record.isDeleted) ||
    boolFromValue(record.Is_Deleted) ||
    boolFromValue(raw.is_deleted) ||
    boolFromValue(raw.isDeleted) ||
    boolFromValue(raw.Is_Deleted);
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeCashInput(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.records)) return input.records;
  if (input?.record && typeof input.record === "object") return [input.record];
  if (input && typeof input === "object") return [input];
  return [];
}

function createCashRequestId(record) {
  const existing = textOrNull(firstValue(record, ["request_id", "requestId", "Request_ID", "Cash_ID", "cashId", "id"]));
  if (existing) return existing;
  return `cash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function friendlyDateStamp(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function cashFriendlyPrefix(record = {}) {
  const type = String(firstValue(record, ["request_type", "requestType", "Request_Type", "Transaction_Type", "transactionType", "type", "Type"]) || "").toLowerCase();
  return /(bali|cash.?advance|\bca\b)/i.test(type) ? "BALI" : "CPO";
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

function stripFriendlyCashColumns(record = {}) {
  const copy = { ...record };
  ["request_no", "cash_ref_id", "payment_ref_id", "payment_reference", "payment_notes"].forEach(key => delete copy[key]);
  return copy;
}

function cashMissingFriendlyColumn(result = {}) {
  return /request_no|cash_ref_id|payment_ref_id|payment_reference|payment_notes/i.test(String(result.details?.message || result.error || result.details || ""));
}

function cashAmount(record) {
  return numberOrNull(firstValue(record, [
    "amount",
    "Amount",
    "budgetAmount",
    "Budget_Amount",
    "dieselAmount",
    "Diesel_Amount"
  ]));
}

function cashRoute(record) {
  const route = textOrNull(firstValue(record, ["route", "Route", "Route_Trip", "destination", "Destination"]));
  if (route) return route;
  const source = textOrNull(firstValue(record, ["source", "Source"]));
  const destination = textOrNull(firstValue(record, ["destination", "Destination"]));
  return source && destination ? `${source} -> ${destination}` : destination;
}

function mapCashRecord(record) {
  const now = new Date().toISOString();
  const requestId = createCashRequestId(record);
  const type = textOrNull(firstValue(record, ["request_type", "requestType", "Request_Type", "Transaction_Type", "transactionType", "type", "Type"])) || "Cash Request";
  const normalizedStatuses = normalizeCashCreateStatuses(record);

  return {
    request_id: requestId,
    request_no: textOrNull(firstValue(record, ["request_no", "requestNo", "Request_No", "cash_ref_id", "cashRefId", "Cash_Ref_ID"])),
    cash_ref_id: textOrNull(firstValue(record, ["cash_ref_id", "cashRefId", "Cash_Ref_ID", "request_no", "requestNo", "Request_No"])),
    request_date: dateOrNull(firstValue(record, ["request_date", "requestDate", "Request_Date", "Date", "date"])),
    group_name: textOrNull(firstValue(record, ["group_name", "groupName", "Group_Name", "Group_Category", "groupCategory", "Truck_Group"])),
    plate_number: textOrNull(firstValue(record, ["plate_number", "plateNumber", "Plate_Number", "Sender"])),
    truck_type: textOrNull(firstValue(record, ["truck_type", "truckType", "Truck_Type"])),
    driver_name: textOrNull(firstValue(record, ["driver_name", "driverName", "Driver_Name"])),
    helper_name: textOrNull(firstValue(record, ["helper_name", "helperName", "Helper_Name"])),
    logged_by: textOrNull(firstValue(record, ["logged_by", "loggedBy", "Logged_By", "Encoded_By", "encodedBy"])),
    request_type: type,
    budget_type: textOrNull(firstValue(record, ["budget_type", "budgetType", "Budget_Type", "PO_Number", "poNumber", "shipmentNumber", "Shipment_Number"])),
    amount: cashAmount(record),
    source: textOrNull(firstValue(record, ["source", "Source", "fuelStation", "Fuel_Station"])),
    destination: cashRoute(record),
    remarks: textOrNull(firstValue(record, ["remarks", "Remarks", "reason", "Reason", "Source_Message", "sourceMessage"])),
    deposit_needed: boolOrNull(firstValue(record, ["deposit_needed", "depositNeeded", "Deposit_Needed"])),
    receiver_name: textOrNull(firstValue(record, ["receiver_name", "receiverName", "Receiver_Name", "Person_Name", "personName"])),
    deposit_to: textOrNull(firstValue(record, ["deposit_to", "depositTo", "Deposit_To"])),
    account_number: textOrNull(firstValue(record, ["account_number", "accountNumber", "Account_Number", "GCash_Number", "depositNumber"])),
    status: normalizedStatuses.status,
    approval_status: normalizedStatuses.approval_status,
    payment_status: normalizedStatuses.payment_status,
    approved_by: textOrNull(firstValue(record, ["approved_by", "approvedBy", "Approved_By"])),
    approved_at: timestampOrNull(firstValue(record, ["approved_at", "approvedAt", "Approved_At"])),
    paid_by: textOrNull(firstValue(record, ["paid_by", "paidBy", "Paid_By"])),
    paid_at: timestampOrNull(firstValue(record, ["paid_at", "paidAt", "Paid_At", "paymentDate"])),
    payment_ref_id: textOrNull(firstValue(record, ["payment_ref_id", "paymentRefId", "Payment_Ref_ID"])),
    payment_reference: textOrNull(firstValue(record, ["payment_reference", "paymentReference", "Payment_Reference", "reference", "Reference"])),
    payment_notes: textOrNull(firstValue(record, ["payment_notes", "paymentNotes", "Payment_Notes", "notes", "Notes"])),
    backup_status: "pending",
    backup_synced_at: null,
    backup_error: null,
    raw_data: record,
    created_at: timestampOrNow(firstValue(record, ["created_at", "createdAt", "Created_At"]) || now),
    updated_at: timestampOrNow(firstValue(record, ["updated_at", "updatedAt", "Updated_At"]) || now),
    is_deleted: boolFromValue(firstValue(record, ["is_deleted", "isDeleted", "Is_Deleted"]))
  };
}

function timestampOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatCashRecord(record = {}) {
  const raw = record.raw_data && typeof record.raw_data === "object" ? record.raw_data : {};
  const displayType = record.request_type ||
    raw.request_type ||
    raw.requestType ||
    raw.Request_Type ||
    raw.Transaction_Type ||
    raw.Type ||
    raw.transactionType ||
    raw.type ||
    "";
  const formatted = {
    ...raw,
    id: record.request_id,
    cashId: record.request_id,
    request_id: record.request_id,
    requestId: record.request_id,
    Cash_ID: record.request_id,
    request_no: record.request_no || raw.request_no || raw.requestNo || raw.Request_No || "",
    requestNo: record.request_no || raw.requestNo || raw.Request_No || "",
    Request_No: record.request_no || raw.Request_No || raw.requestNo || "",
    cash_ref_id: record.cash_ref_id || raw.cash_ref_id || raw.cashRefId || raw.Cash_Ref_ID || record.request_no || "",
    cashRefId: record.cash_ref_id || raw.cashRefId || raw.Cash_Ref_ID || record.request_no || "",
    Cash_Ref_ID: record.cash_ref_id || raw.Cash_Ref_ID || raw.cashRefId || record.request_no || "",
    date: record.request_date || raw.date || raw.Date || "",
    Date: record.request_date || raw.Date || raw.date || "",
    type: displayType,
    request_type: displayType,
    requestType: displayType,
    Transaction_Type: displayType,
    groupCategory: record.group_name || raw.groupCategory || raw.Group_Category || "",
    Group_Category: record.group_name || raw.Group_Category || raw.groupCategory || "",
    plateNumber: record.plate_number || raw.plateNumber || raw.Plate_Number || raw.Sender || "",
    Plate_Number: record.plate_number || raw.Plate_Number || raw.plateNumber || raw.Sender || "",
    driverName: record.driver_name || raw.driverName || raw.Driver_Name || "",
    helperName: record.helper_name || raw.helperName || raw.Helper_Name || "",
    loggedBy: record.logged_by || raw.loggedBy || raw.Logged_By || raw.Encoded_By || "",
    Logged_By: record.logged_by || raw.Logged_By || raw.loggedBy || "",
    personName: record.receiver_name || raw.personName || raw.Person_Name || "",
    Person_Name: record.receiver_name || raw.Person_Name || raw.personName || "",
    role: raw.role || raw.Role || "",
    Role: raw.Role || raw.role || "",
    amount: record.amount ?? raw.amount ?? raw.budgetAmount ?? raw.Amount ?? "",
    Amount: record.amount ?? raw.Amount ?? raw.amount ?? raw.budgetAmount ?? "",
    budgetType: raw.budgetType || raw.Budget_Type || record.budget_type || "",
    poNumber: raw.poNumber || raw.PO_Number || record.budget_type || "",
    route: raw.route || raw.Route || record.destination || "",
    source: raw.source || raw.Source || record.source || "",
    destination: raw.destination || raw.Destination || "",
    remarks: raw.remarks || raw.Remarks || record.remarks || "",
    status: record.status || record.approval_status || raw.status || raw.Review_Status || "",
    Status: record.status || raw.Status || raw.status || "",
    approval_status: record.approval_status || raw.approval_status || raw.approvalStatus || raw.Approval_Status || "",
    approvalStatus: record.approval_status || raw.approvalStatus || raw.Approval_Status || "",
    Approval_Status: record.approval_status || raw.Approval_Status || raw.approvalStatus || "",
    Review_Status: record.status || raw.Review_Status || raw.status || record.approval_status || "",
    payment_status: record.payment_status || raw.payment_status || raw.paymentStatus || raw.Payment_Status || "",
    paymentStatus: record.payment_status || raw.paymentStatus || raw.Payment_Status || "",
    Payment_Status: record.payment_status || raw.Payment_Status || raw.paymentStatus || "",
    backup_status: record.backup_status || raw.backup_status || "",
    backup_error: record.backup_error || raw.backup_error || "",
    created_at: record.created_at || raw.created_at || raw.Created_At || raw.createdAt || "",
    createdAt: record.created_at || raw.createdAt || raw.Created_At || "",
    updated_at: record.updated_at || raw.updated_at || raw.Updated_At || raw.updatedAt || "",
    updatedAt: record.updated_at || raw.updatedAt || raw.Updated_At || "",
    approved_at: record.approved_at || raw.approved_at || raw.Approved_At || raw.approvedAt || "",
    approvedAt: record.approved_at || raw.approvedAt || raw.Approved_At || "",
    paid_at: record.paid_at || raw.paid_at || raw.Paid_At || raw.paidAt || "",
    paidAt: record.paid_at || raw.paidAt || raw.Paid_At || "",
    payment_ref_id: record.payment_ref_id || raw.payment_ref_id || raw.paymentRefId || "",
    paymentRefId: record.payment_ref_id || raw.paymentRefId || "",
    Payment_Ref_ID: record.payment_ref_id || raw.Payment_Ref_ID || "",
    payment_reference: record.payment_reference || raw.payment_reference || raw.paymentReference || raw.Payment_Reference || raw.Reference || "",
    paymentReference: record.payment_reference || raw.paymentReference || raw.Payment_Reference || raw.Reference || "",
    Payment_Reference: record.payment_reference || raw.Payment_Reference || raw.paymentReference || raw.Reference || "",
    payment_notes: record.payment_notes || raw.payment_notes || raw.paymentNotes || "",
    paymentNotes: record.payment_notes || raw.paymentNotes || "",
    isDeleted: raw.isDeleted ?? raw.Is_Deleted ?? record.is_deleted ?? false
  };
  console.log("Cash type source check", {
    request_id: record.request_id,
    canonical: record.request_type,
    rawTransactionType: raw.Transaction_Type,
    rawType: raw.Type || raw.type,
    displayType
  });
  console.log("Cash canonical formatted record", formatted);
  return formatted;
}

export async function upsertCashRequestToSupabase(env, input) {
  const records = normalizeCashInput(input).map(mapCashRecord).filter(Boolean);
  if (!records.length) {
    return { ok: false, error: "No valid cash request records were provided", status: 400 };
  }

  for (const record of records) {
    if (!record.request_no) record.request_no = await generateFriendlyId(env, "cash_requests", "request_no", cashFriendlyPrefix(record.raw_data || record), record.request_date || record.created_at);
    if (!record.cash_ref_id) record.cash_ref_id = record.request_no;
  }

  let result = await supabaseFetch(env, "cash_requests?on_conflict=request_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(records)
  });

  if (result.error && cashMissingFriendlyColumn(result)) {
    console.warn("Cash friendly ref columns missing; retrying without friendly fields. Run supabase/friendly-ref-ids-and-payment-fields.sql.", result.error);
    result = await supabaseFetch(env, "cash_requests?on_conflict=request_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify(records.map(stripFriendlyCashColumns))
    });
  }

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const savedRecords = Array.isArray(result.body) ? result.body : [];
  return {
    ok: true,
    source: "supabase",
    request_id: records[0].request_id,
    count: records.length,
    record: formatCashRecord(savedRecords[0] || records[0]),
    records: savedRecords.map(formatCashRecord)
  };
}

export async function listCashRequestsFromSupabase(env, searchParams) {
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1000);
  const includeDeleted = String(searchParams.get("includeDeleted") || "").toLowerCase() === "true";
  const filters = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit)
  });

  if (!includeDeleted) filters.set("or", "(is_deleted.is.false,is_deleted.is.null)");
  if (searchParams.get("status")) filters.set("status", `eq.${searchParams.get("status")}`);
  if (searchParams.get("approval_status")) filters.set("approval_status", `eq.${searchParams.get("approval_status")}`);
  if (searchParams.get("payment_status")) filters.set("payment_status", `eq.${searchParams.get("payment_status")}`);

  const result = await supabaseFetch(env, `cash_requests?${filters.toString()}`, {
    method: "GET"
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const records = (Array.isArray(result.body) ? result.body : [])
    .filter(record => includeDeleted || !isDeletedCashRecord(record));
  return {
    ok: true,
    source: "supabase",
    records: records.map(formatCashRecord),
    count: records.length
  };
}

export async function updateCashBackupStatus(env, input = {}) {
  const requestId = textOrNull(input.request_id || input.Request_ID || input.cashId || input.Cash_ID || input.id);
  const backupStatus = textOrNull(input.backup_status || input.backupStatus);
  if (!requestId || !["synced", "failed", "pending"].includes(backupStatus)) {
    return { ok: false, error: "request_id and valid backup_status are required", status: 400 };
  }

  const payload = {
    backup_status: backupStatus,
    backup_synced_at: backupStatus === "synced" ? new Date().toISOString() : null,
    backup_error: backupStatus === "failed" ? String(input.backup_error || input.backupError || "").slice(0, 500) : null,
    updated_at: new Date().toISOString()
  };

  const filters = new URLSearchParams({
    request_id: `eq.${requestId}`
  });
  const result = await supabaseFetch(env, `cash_requests?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  return {
    ok: true,
    request_id: requestId,
    backup_status: backupStatus
  };
}

export async function updateCashRequestStatus(env, input = {}) {
  const requestId = textOrNull(input.request_id || input.Request_ID || input.cashId || input.Cash_ID || input.id);
  if (!requestId) {
    return { ok: false, error: "request_id is required", status: 400 };
  }

  const now = new Date().toISOString();
  const status = textOrNull(input.status || input.Status);
  const approvalStatus = textOrNull(input.approval_status || input.approvalStatus || input.Approval_Status);
  const paymentStatus = textOrNull(input.payment_status || input.paymentStatus || input.Payment_Status || input.Posted_Status);
  const isApprovedUpdate = status === "Approved" || approvalStatus === "Approved";
  const isPaidUpdate = status === "Paid" || paymentStatus === "Paid";
  const payload = {
    status: status || "Approved",
    approval_status: approvalStatus || (isPaidUpdate ? null : "Approved"),
    payment_status: paymentStatus || (isApprovedUpdate ? "Unpaid" : null),
    approved_by: textOrNull(input.approved_by || input.approvedBy || input.Approved_By),
    approved_at: timestampOrNull(input.approved_at || input.approvedAt || input.Approved_At) || (isPaidUpdate ? null : now),
    paid_by: textOrNull(input.paid_by || input.paidBy || input.Paid_By || input.Released_By),
    paid_at: timestampOrNull(input.paid_at || input.paidAt || input.Paid_At || input.Released_At) || (isPaidUpdate ? now : null),
    payment_ref_id: textOrNull(input.payment_ref_id || input.paymentRefId || input.Payment_Ref_ID),
    payment_reference: textOrNull(input.payment_reference || input.paymentReference || input.Payment_Reference || input.reference || input.Reference),
    payment_notes: textOrNull(input.payment_notes || input.paymentNotes || input.Payment_Notes || input.notes || input.Notes),
    remarks: textOrNull(input.notes || input.Notes || input.remarks || input.Remarks),
    backup_status: "pending",
    backup_synced_at: null,
    backup_error: null,
    updated_at: now
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === "") delete payload[key];
  });
  if (isPaidUpdate && !payload.payment_ref_id) payload.payment_ref_id = await generateFriendlyId(env, "cash_requests", "payment_ref_id", "PMT", now);

  const filters = new URLSearchParams({
    request_id: `eq.${requestId}`
  });
  let result = await supabaseFetch(env, `cash_requests?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });

  if (result.error && cashMissingFriendlyColumn(result)) {
    const fallbackPayload = { ...payload };
    ["payment_ref_id", "payment_reference", "payment_notes"].forEach(key => delete fallbackPayload[key]);
    result = await supabaseFetch(env, `cash_requests?${filters.toString()}`, {
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
    return { ok: false, error: `No cash request found for request_id ${requestId}`, status: 404 };
  }

  return {
    ok: true,
    source: "supabase",
    request_id: requestId,
    record: formatCashRecord(records[0]),
    records: records.map(formatCashRecord)
  };
}

export function cashArrayFromAnyResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of CASH_ARRAY_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}
