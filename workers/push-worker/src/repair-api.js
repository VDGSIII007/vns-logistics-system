const REPAIR_ARRAY_KEYS = ["records", "entries", "data", "items", "rows", "result"];
const SAFE_ERROR = "Repair data service is unavailable";

function supabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase repair API is not configured" };
  }

  return {
    url: String(env.SUPABASE_URL).replace(/\/+$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
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

function boolFromValue(value) {
  return ["true", "yes", "1", "deleted"].includes(String(value ?? "").trim().toLowerCase());
}

function linksJson(...values) {
  return values.map(value => String(value ?? "").trim()).filter(Boolean);
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeRepairInput(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.records)) return input.records;
  if (input?.record && typeof input.record === "object") return [input.record];
  if (input && typeof input === "object") return [input];
  return [];
}

function mapRepairRecord(record) {
  const now = new Date().toISOString();
  const requestId = textOrNull(firstValue(record, ["Request_ID", "request_id", "requestId"]));
  if (!requestId) return null;

  const createdAt = timestampOrNow(firstValue(record, ["Created_At", "created_at", "createdAt"]));
  const updatedAt = timestampOrNow(firstValue(record, ["Last_Updated", "Updated_At", "updated_at", "updatedAt"]) || now);

  return {
    request_id: requestId,
    request_type: textOrNull(firstValue(record, ["Request_Type", "request_type", "requestType"])),
    date_requested: dateOrNull(firstValue(record, ["Date_Requested", "date_requested", "dateRequested"])),
    date_finished: dateOrNull(firstValue(record, ["Date_Finished", "date_finished", "dateFinished"])),
    requested_by: textOrNull(firstValue(record, ["Requested_By", "requested_by", "requestedBy"])),
    plate_number: textOrNull(firstValue(record, ["Plate_Number", "plate_number", "plateNumber"])),
    truck_type: textOrNull(firstValue(record, ["Truck_Type", "truck_type", "truckType"])),
    driver: textOrNull(firstValue(record, ["Driver", "driver"])),
    helper: textOrNull(firstValue(record, ["Helper", "helper"])),
    category: textOrNull(firstValue(record, ["Category", "category"])),
    repair_parts: textOrNull(firstValue(record, ["Repair_Parts", "repair_parts", "repairParts"])),
    work_done: textOrNull(firstValue(record, ["Work_Done", "work_done", "workDone"])),
    quantity: numberOrNull(firstValue(record, ["Quantity", "quantity"])),
    unit_cost: numberOrNull(firstValue(record, ["Unit_Cost", "unit_cost", "unitCost"])),
    parts_cost: numberOrNull(firstValue(record, ["Parts_Cost", "parts_cost", "partsCost"])),
    labor_cost: numberOrNull(firstValue(record, ["Labor_Cost", "labor_cost", "laborCost"])),
    total_cost: numberOrNull(firstValue(record, ["Total_Cost", "total_cost", "totalCost", "Original_Total_Cost"])),
    supplier: textOrNull(firstValue(record, ["Supplier", "supplier"])),
    payee: textOrNull(firstValue(record, ["Payee", "payee"])),
    status: textOrNull(firstValue(record, ["Status", "status"])) || "Draft",
    repair_status: textOrNull(firstValue(record, ["Repair_Status", "repair_status", "repairStatus"])) || "Pending",
    approval_status: textOrNull(firstValue(record, ["Approval_Status", "approval_status", "approvalStatus"])) || "Pending",
    payment_status: textOrNull(firstValue(record, ["Payment_Status", "payment_status", "paymentStatus"])) || "Unpaid",
    approved_by: textOrNull(firstValue(record, ["Approved_By", "approved_by", "approvedBy"])),
    photo_links: linksJson(record.Photo_Link, record.Receipt_Link, record.Proof_Of_Payment),
    video_links: [],
    source_message: textOrNull(firstValue(record, ["Source_Message", "source_message", "sourceMessage"])),
    remarks: textOrNull(firstValue(record, ["Remarks", "remarks", "Cost_Remarks", "costRemarks"])),
    saved_by: textOrNull(firstValue(record, ["Saved_By", "saved_by", "savedBy"])),
    created_at: createdAt,
    updated_at: updatedAt,
    is_deleted: boolFromValue(firstValue(record, ["Is_Deleted", "is_deleted", "isDeleted"])),
    backup_status: "pending",
    backup_synced_at: null,
    backup_error: null
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

export async function upsertRepairRequestToSupabase(env, input) {
  const records = normalizeRepairInput(input).map(mapRepairRecord).filter(Boolean);
  if (!records.length) {
    return { ok: false, error: "No valid repair request records were provided", status: 400 };
  }

  const result = await supabaseFetch(env, "repair_requests?on_conflict=request_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(records)
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  return {
    ok: true,
    source: "supabase",
    request_id: records[0].request_id,
    count: records.length,
    records: Array.isArray(result.body) ? result.body : []
  };
}

export async function listRepairRequestsFromSupabase(env, searchParams) {
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1000);
  const filters = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit)
  });

  if (searchParams.get("status")) filters.set("status", `eq.${searchParams.get("status")}`);
  if (searchParams.get("payment_status")) filters.set("payment_status", `eq.${searchParams.get("payment_status")}`);
  if (searchParams.get("today") === "true") {
    const today = new Date().toISOString().slice(0, 10);
    filters.set("or", `(date_requested.eq.${today},created_at.gte.${today}T00:00:00Z,updated_at.gte.${today}T00:00:00Z,date_finished.eq.${today})`);
  }

  const result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
    method: "GET"
  });

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  const records = Array.isArray(result.body) ? result.body : [];
  return {
    ok: true,
    source: "supabase",
    records,
    count: records.length
  };
}

export async function updateRepairBackupStatus(env, input = {}) {
  const requestId = textOrNull(input.request_id || input.Request_ID);
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
  const result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
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

export async function updateRepairRequestStatus(env, input = {}) {
  const requestId = textOrNull(input.request_id || input.Request_ID || input.requestId);
  if (!requestId) {
    return { ok: false, error: "request_id is required", status: 400 };
  }

  const now = new Date().toISOString();
  const payload = {
    status: textOrNull(input.status || input.Status),
    approval_status: textOrNull(input.approval_status || input.Approval_Status || input.approvalStatus),
    repair_status: textOrNull(input.repair_status || input.Repair_Status || input.repairStatus),
    payment_status: textOrNull(input.payment_status || input.Payment_Status || input.paymentStatus),
    approved_by: textOrNull(input.approved_by || input.Approved_By || input.approvedBy),
    approved_at: input.approved_at || input.Approved_At || input.approvedAt || null,
    paid_by: textOrNull(input.paid_by || input.Paid_By || input.paidBy),
    paid_at: input.paid_at || input.Paid_At || input.paidAt || null,
    updated_at: timestampOrNow(input.updated_at || input.Updated_At || input.updatedAt || now),
    backup_status: textOrNull(input.backup_status || input.Backup_Status || input.backupStatus) || "pending",
    backup_synced_at: null,
    backup_error: null
  };

  // TODO: insert approval/payment audit rows into repair_events after the event schema is finalized.
  Object.keys(payload).forEach(key => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === "") delete payload[key];
  });

  const filters = new URLSearchParams({
    request_id: `eq.${requestId}`
  });
  let result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });

  if (result.error && /approved_at|paid_by|paid_at/i.test(String(result.details?.message || result.error || ""))) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.approved_at;
    delete fallbackPayload.paid_by;
    delete fallbackPayload.paid_at;
    result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
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
    return { ok: false, error: `No repair request found for request_id ${requestId}`, status: 404 };
  }

  return {
    ok: true,
    source: "supabase",
    request_id: requestId,
    records
  };
}

export function repairArrayFromAnyResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of REPAIR_ARRAY_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}
