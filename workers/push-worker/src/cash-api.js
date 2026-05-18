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
  const status = textOrNull(firstValue(record, ["approval_status", "approvalStatus", "Approval_Status", "Review_Status", "reviewStatus", "status", "Status"])) || "Draft";

  return {
    request_id: requestId,
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
    status: textOrNull(firstValue(record, ["status", "Status"])) || "Draft",
    approval_status: status,
    payment_status: textOrNull(firstValue(record, ["payment_status", "paymentStatus", "Payment_Status", "Posted_Status"])) || "Unpaid",
    approved_by: textOrNull(firstValue(record, ["approved_by", "approvedBy", "Approved_By"])),
    approved_at: timestampOrNull(firstValue(record, ["approved_at", "approvedAt", "Approved_At"])),
    paid_by: textOrNull(firstValue(record, ["paid_by", "paidBy", "Paid_By"])),
    paid_at: timestampOrNull(firstValue(record, ["paid_at", "paidAt", "Paid_At", "paymentDate"])),
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
  return {
    ...raw,
    id: record.request_id,
    cashId: record.request_id,
    request_id: record.request_id,
    Cash_ID: raw.Cash_ID || record.request_id,
    date: raw.date || raw.Date || record.request_date || "",
    Date: raw.Date || raw.date || record.request_date || "",
    type: raw.type || raw.Transaction_Type || record.request_type || "",
    Transaction_Type: raw.Transaction_Type || raw.type || record.request_type || "",
    groupCategory: raw.groupCategory || raw.Group_Category || record.group_name || "",
    Group_Category: raw.Group_Category || raw.groupCategory || record.group_name || "",
    plateNumber: raw.plateNumber || raw.Plate_Number || record.plate_number || "",
    Plate_Number: raw.Plate_Number || raw.plateNumber || record.plate_number || "",
    driverName: raw.driverName || raw.Driver_Name || record.driver_name || "",
    helperName: raw.helperName || raw.Helper_Name || record.helper_name || "",
    loggedBy: raw.loggedBy || raw.Logged_By || raw.Encoded_By || record.logged_by || "",
    Logged_By: raw.Logged_By || raw.loggedBy || record.logged_by || "",
    personName: raw.personName || raw.Person_Name || record.receiver_name || "",
    Person_Name: raw.Person_Name || raw.personName || record.receiver_name || "",
    role: raw.role || raw.Role || "",
    Role: raw.Role || raw.role || "",
    amount: raw.amount ?? raw.budgetAmount ?? raw.Amount ?? record.amount ?? "",
    Amount: raw.Amount ?? raw.amount ?? raw.budgetAmount ?? record.amount ?? "",
    budgetType: raw.budgetType || raw.Budget_Type || record.budget_type || "",
    poNumber: raw.poNumber || raw.PO_Number || record.budget_type || "",
    route: raw.route || raw.Route || record.destination || "",
    source: raw.source || raw.Source || record.source || "",
    destination: raw.destination || raw.Destination || "",
    remarks: raw.remarks || raw.Remarks || record.remarks || "",
    status: raw.status || raw.Review_Status || record.approval_status || record.status || "",
    Review_Status: raw.Review_Status || raw.status || record.approval_status || record.status || "",
    paymentStatus: raw.paymentStatus || raw.Payment_Status || record.payment_status || "",
    backup_status: record.backup_status || raw.backup_status || "",
    backup_error: record.backup_error || raw.backup_error || "",
    createdAt: raw.createdAt || raw.Created_At || record.created_at || "",
    updatedAt: raw.updatedAt || raw.Updated_At || record.updated_at || "",
    isDeleted: raw.isDeleted ?? raw.Is_Deleted ?? record.is_deleted ?? false
  };
}

export async function upsertCashRequestToSupabase(env, input) {
  const records = normalizeCashInput(input).map(mapCashRecord).filter(Boolean);
  if (!records.length) {
    return { ok: false, error: "No valid cash request records were provided", status: 400 };
  }

  const result = await supabaseFetch(env, "cash_requests?on_conflict=request_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(records)
  });

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
  const payload = {
    status: textOrNull(input.status || input.Status) || "Approved",
    approval_status: textOrNull(input.approval_status || input.approvalStatus || input.Approval_Status) || "Approved",
    approved_by: textOrNull(input.approved_by || input.approvedBy || input.Approved_By),
    approved_at: timestampOrNull(input.approved_at || input.approvedAt || input.Approved_At) || now,
    remarks: textOrNull(input.notes || input.Notes || input.remarks || input.Remarks),
    backup_status: "pending",
    backup_synced_at: null,
    backup_error: null,
    updated_at: now
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === "") delete payload[key];
  });

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
