const REPAIR_ARRAY_KEYS = ["records", "entries", "data", "items", "rows", "result"];
const SAFE_ERROR = "Repair data service is unavailable";
const REPAIR_MEDIA_BUCKET = "repair-media";

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

function linkArrayFromValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(item => String(item ?? "").trim()).filter(Boolean);
  } catch {
    // Treat non-JSON values as a single legacy link.
  }
  return [text];
}

function repairItemsFromValue(value) {
  if (Array.isArray(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function stripFriendlyRepairColumns(record = {}) {
  const copy = { ...record };
  ["request_no", "repair_ref_id", "odometer_reading", "account_number", "repair_items", "payment_ref_id", "payment_reference", "payment_notes", "truck_repair_ref_id", "labor_items"].forEach(key => delete copy[key]);
  return copy;
}

function repairMissingFriendlyColumn(result = {}) {
  return /request_no|repair_ref_id|odometer_reading|account_number|repair_items|payment_ref_id|payment_reference|payment_notes|truck_repair_ref_id|labor_items/i.test(String(result.details?.message || result.error || result.details || ""));
}

function withRepairFriendlyAliases(record = {}) {
  const requestNo = textOrNull(firstValue(record, ["request_no", "requestNo", "Request_No"]));
  const repairRefId = textOrNull(firstValue(record, ["repair_ref_id", "repairRefId", "Repair_Ref_ID", "request_no", "requestNo", "Request_No"]));
  const truckRepairRefId = textOrNull(firstValue(record, ["truck_repair_ref_id", "truckRepairRefId", "Truck_Repair_Ref_ID"]));
  return {
    ...record,
    request_no: requestNo,
    requestNo,
    Request_No: requestNo,
    repair_ref_id: repairRefId,
    repairRefId,
    Repair_Ref_ID: repairRefId,
    truck_repair_ref_id: truckRepairRefId,
    truckRepairRefId,
    Truck_Repair_Ref_ID: truckRepairRefId
  };
}

function mapRepairRecord(record) {
  const now = new Date().toISOString();
  const requestId = textOrNull(firstValue(record, ["Request_ID", "request_id", "requestId"]));
  if (!requestId) return null;

  const createdAt = timestampOrNow(firstValue(record, ["Created_At", "created_at", "createdAt"]));
  const updatedAt = timestampOrNow(firstValue(record, ["Last_Updated", "Updated_At", "updated_at", "updatedAt"]) || now);

  return {
    request_id: requestId,
    request_no: textOrNull(firstValue(record, ["request_no", "requestNo", "Request_No", "repair_ref_id", "repairRefId", "Repair_Ref_ID"])),
    repair_ref_id: textOrNull(firstValue(record, ["repair_ref_id", "repairRefId", "Repair_Ref_ID", "request_no", "requestNo", "Request_No"])),
    request_type: textOrNull(firstValue(record, ["Request_Type", "request_type", "requestType"])),
    date_requested: dateOrNull(firstValue(record, ["Date_Requested", "date_requested", "dateRequested"])),
    date_finished: dateOrNull(firstValue(record, ["Date_Finished", "date_finished", "dateFinished"])),
    requested_by: textOrNull(firstValue(record, ["Requested_By", "requested_by", "requestedBy"])),
    plate_number: textOrNull(firstValue(record, ["Plate_Number", "plate_number", "plateNumber"])),
    truck_type: textOrNull(firstValue(record, ["Truck_Type", "truck_type", "truckType"])),
    driver: textOrNull(firstValue(record, ["Driver", "driver"])),
    helper: textOrNull(firstValue(record, ["Helper", "helper"])),
    odometer_reading: textOrNull(firstValue(record, ["Odometer", "odometer", "odometer_reading", "odometerReading", "KM_Reading", "kmReading"])),
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
    account_number: textOrNull(firstValue(record, ["Account_Number", "account_number", "accountNumber"])),
    repair_items: repairItemsFromValue(firstValue(record, ["Repair_Items", "repair_items", "repairItems"])),
    labor_items: repairItemsFromValue(firstValue(record, ["Labor_Items", "labor_items", "laborItems"])),
    status: textOrNull(firstValue(record, ["Status", "status"])) || "Draft",
    repair_status: textOrNull(firstValue(record, ["Repair_Status", "repair_status", "repairStatus"])) || "Pending",
    approval_status: textOrNull(firstValue(record, ["Approval_Status", "approval_status", "approvalStatus"])) || "Pending",
    payment_status: textOrNull(firstValue(record, ["Payment_Status", "payment_status", "paymentStatus"])) || "Unpaid",
    approved_by: textOrNull(firstValue(record, ["Approved_By", "approved_by", "approvedBy"])),
    payment_ref_id: textOrNull(firstValue(record, ["payment_ref_id", "paymentRefId", "Payment_Ref_ID"])),
    payment_reference: textOrNull(firstValue(record, ["payment_reference", "paymentReference", "Payment_Reference", "Proof_Of_Payment"])),
    payment_notes: textOrNull(firstValue(record, ["payment_notes", "paymentNotes", "Payment_Notes", "notes", "Notes"])),
    photo_links: [
      ...linkArrayFromValue(firstValue(record, ["photo_links", "Photo_Links", "photoLinks"])),
      ...linksJson(record.Photo_Link, record.Receipt_Link, record.Proof_Of_Payment)
    ],
    video_links: linkArrayFromValue(firstValue(record, ["video_links", "Video_Links", "videoLinks"])),
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

function storageHeaders(config, contentType = "") {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`
  };
  if (contentType) headers["content-type"] = contentType;
  return headers;
}

function safeFileName(name = "repair-media") {
  const cleaned = String(name || "repair-media")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned || "repair-media";
}

function safeStoragePath(requestId, fileName) {
  const safeRequestId = String(requestId || "").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120);
  if (!safeRequestId) return "";
  return `repair_requests/${safeRequestId}/${Date.now()}_${safeFileName(fileName)}`;
}

function decodeMediaPath(path) {
  const rawPath = textOrNull(path);
  if (!rawPath) return "";
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function isDangerousMediaPath(path) {
  return !path || path.includes("..") || path.startsWith("/") || path.includes("\\");
}

function encodeStorageObjectPath(path) {
  return path.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

async function fetchRepairMediaArrays(env, requestId) {
  const filters = new URLSearchParams({
    select: "photo_links,video_links",
    request_id: `eq.${requestId}`,
    limit: "1"
  });
  const result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
    method: "GET"
  });
  if (result.error) return result;
  const record = Array.isArray(result.body) ? result.body[0] : null;
  if (!record) return { error: `No repair request found for request_id ${requestId}`, status: 404 };
  return {
    photo_links: linkArrayFromValue(record.photo_links),
    video_links: linkArrayFromValue(record.video_links)
  };
}

async function appendRepairMediaPath(env, requestId, mediaType, path) {
  const current = await fetchRepairMediaArrays(env, requestId);
  if (current.error) return { ok: false, error: current.error, status: current.status || 500 };

  const field = mediaType === "photo" ? "photo_links" : "video_links";
  const nextLinks = Array.from(new Set([...(current[field] || []), path]));
  const filters = new URLSearchParams({ request_id: `eq.${requestId}` });
  const result = await supabaseFetch(env, `repair_requests?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({
      [field]: nextLinks,
      updated_at: new Date().toISOString()
    })
  });

  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  return { ok: true, links: nextLinks };
}

export async function uploadRepairMediaToSupabase(env, formData) {
  const config = supabaseConfig(env);
  if (config.error) return { ok: false, error: config.error, status: 500 };

  const requestId = textOrNull(formData.get("request_id"));
  const mediaType = textOrNull(formData.get("media_type"));
  const file = formData.get("file");
  if (!requestId || !["photo", "video"].includes(mediaType || "") || !file || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "request_id, valid media_type, and file are required", status: 400 };
  }

  const path = safeStoragePath(requestId, file.name || `${mediaType}-evidence`);
  if (!path) return { ok: false, error: "Invalid request_id", status: 400 };

  const uploadResponse = await fetch(`${config.url}/storage/v1/object/${REPAIR_MEDIA_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...storageHeaders(config, file.type || "application/octet-stream"),
      "x-upsert": "false"
    },
    body: await file.arrayBuffer()
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => "");
    return { ok: false, error: SAFE_ERROR, details, status: uploadResponse.status || 500 };
  }

  const appended = await appendRepairMediaPath(env, requestId, mediaType, path);
  if (!appended.ok) return appended;

  return {
    ok: true,
    request_id: requestId,
    media_type: mediaType,
    path
  };
}

export async function createRepairMediaSignedUrl(env, path) {
  const config = supabaseConfig(env);
  if (config.error) return { ok: false, error: config.error, status: 500 };

  const safePath = decodeMediaPath(path);
  if (isDangerousMediaPath(safePath)) {
    console.warn("Invalid repair media signed URL path", safePath || "(empty)");
    return { ok: false, error: "Valid media path is required", status: 400 };
  }

  const encodedPath = encodeStorageObjectPath(safePath);
  const response = await fetch(`${config.url}/storage/v1/object/sign/${REPAIR_MEDIA_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      ...storageHeaders(config, "application/json")
    },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: SAFE_ERROR, details: body, status: response.status || 500 };
  }

  const signedUrl = body?.signedURL || body?.signedUrl || "";
  const absoluteSignedUrl = signedUrl.startsWith("http")
    ? signedUrl
    : signedUrl.startsWith("/storage/v1")
      ? `${config.url}${signedUrl}`
      : `${config.url}/storage/v1${signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`}`;
  return {
    ok: true,
    path: safePath,
    expires_in: 3600,
    url: absoluteSignedUrl
  };
}

export async function upsertRepairRequestToSupabase(env, input) {
  const records = normalizeRepairInput(input).map(mapRepairRecord).filter(Boolean);
  if (!records.length) {
    return { ok: false, error: "No valid repair request records were provided", status: 400 };
  }

  let persistedRecords = records;
  for (const record of records) {
    const friendlyPrefix = /truck repair|for repair/i.test(String(record.request_type || "")) ? "TRKREP" : "REP";
    if (!record.request_no) record.request_no = await generateFriendlyId(env, "repair_requests", "request_no", friendlyPrefix, record.date_requested || record.created_at);
    if (!record.repair_ref_id) record.repair_ref_id = record.request_no;
  }
  let result = await supabaseFetch(env, "repair_requests?on_conflict=request_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(persistedRecords)
  });

  if (result.error && /repair_items|labor_items|account_number|schema cache|column/i.test(JSON.stringify(result.details || result.error || ""))) {
    persistedRecords = records.map(({ repair_items, labor_items, account_number, ...record }) => record);
    result = await supabaseFetch(env, "repair_requests?on_conflict=request_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify(persistedRecords)
    });
  }

  if (result.error && repairMissingFriendlyColumn(result)) {
    console.warn("Repair friendly ref columns missing; retrying without friendly fields. Run supabase/friendly-ref-ids-and-payment-fields.sql.", result.error);
    persistedRecords = records.map(stripFriendlyRepairColumns);
    result = await supabaseFetch(env, "repair_requests?on_conflict=request_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify(persistedRecords)
    });
  }

  if (result.error) {
    return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  }

  return {
    ok: true,
    source: "supabase",
    request_id: records[0].request_id,
    count: records.length,
    records: (Array.isArray(result.body) ? result.body : []).map(withRepairFriendlyAliases)
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
    payment_ref_id: textOrNull(input.payment_ref_id || input.Payment_Ref_ID || input.paymentRefId),
    payment_reference: textOrNull(input.payment_reference || input.Payment_Reference || input.paymentReference || input.reference || input.Reference),
    payment_notes: textOrNull(input.payment_notes || input.Payment_Notes || input.paymentNotes || input.notes || input.Notes),
    updated_at: timestampOrNow(input.updated_at || input.Updated_At || input.updatedAt || now),
    backup_status: textOrNull(input.backup_status || input.Backup_Status || input.backupStatus) || "pending",
    backup_synced_at: null,
    backup_error: null
  };

  // TODO: insert approval/payment audit rows into repair_events after the event schema is finalized.
  Object.keys(payload).forEach(key => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === "") delete payload[key];
  });
  const isPaidUpdate = String(payload.status || "").toLowerCase() === "paid" || String(payload.payment_status || "").toLowerCase() === "paid";
  if (isPaidUpdate && !payload.payment_ref_id) payload.payment_ref_id = await generateFriendlyId(env, "repair_requests", "payment_ref_id", "PMT", now);

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

  if (result.error && repairMissingFriendlyColumn(result)) {
    const fallbackPayload = { ...payload };
    ["payment_ref_id", "payment_reference", "payment_notes"].forEach(key => delete fallbackPayload[key]);
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

export async function upsertForRepairTruckToSupabase(env, input) {
  const raw = Array.isArray(input) ? input[0] : (input?.record ?? input);
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "No valid for-repair-truck record provided", status: 400 };
  }

  const forRepairId = textOrNull(
    firstValue(raw, ["For_Repair_ID", "for_repair_id", "forRepairId"])
  );
  if (!forRepairId) {
    return { ok: false, error: "For_Repair_ID is required", status: 400 };
  }

  const dateValue = textOrNull(
    firstValue(raw, ["Start_Date", "start_date", "startDate", "Created_At", "created_at"])
  );

  const existingRef = textOrNull(
    firstValue(raw, ["truck_repair_ref_id", "truckRepairRefId", "Truck_Repair_Ref_ID"])
  );

  const truckRepairRefId = existingRef ||
    await generateFriendlyId(env, "for_repair_trucks", "truck_repair_ref_id", "TRKREP", dateValue);

  const record = {
    for_repair_id: forRepairId,
    truck_repair_ref_id: truckRepairRefId,
    plate_number: textOrNull(firstValue(raw, ["Plate_Number", "plate_number", "plateNumber"])),
    group_category: textOrNull(firstValue(raw, ["Group_Category", "group_category", "groupCategory"])),
    truck_type: textOrNull(firstValue(raw, ["Truck_Type", "truck_type", "truckType"])),
    driver: textOrNull(firstValue(raw, ["Driver", "driver"])),
    helper: textOrNull(firstValue(raw, ["Helper", "helper"])),
    garage_location: textOrNull(firstValue(raw, ["Garage_Location", "garage_location", "garageLocation"])),
    repair_issue: textOrNull(firstValue(raw, ["Repair_Issue", "repair_issue", "repairIssue"])),
    start_date: dateOrNull(firstValue(raw, ["Start_Date", "start_date", "startDate"])),
    estimated_finish_date: dateOrNull(firstValue(raw, ["Estimated_Finish_Date", "estimated_finish_date", "estimatedFinishDate"])),
    end_date: dateOrNull(firstValue(raw, ["End_Date", "end_date", "endDate"])),
    repair_status: textOrNull(firstValue(raw, ["Repair_Status", "repair_status", "repairStatus"])) || "For Repair",
    remarks: textOrNull(firstValue(raw, ["Remarks", "remarks"])),
    odometer_reading: textOrNull(firstValue(raw, ["Odometer", "odometer", "odometer_reading", "odometerReading"])),
    created_at: timestampOrNow(firstValue(raw, ["Created_At", "created_at", "createdAt"])),
    updated_at: new Date().toISOString()
  };

  let result = await supabaseFetch(env, "for_repair_trucks?on_conflict=for_repair_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([record])
  });

  if (result.error && /truck_repair_ref_id|odometer_reading/i.test(String(result.details?.message || result.error || ""))) {
    console.warn("for_repair_trucks friendly columns missing; retrying without them. Run supabase/friendly-ref-ids-and-payment-fields.sql.");
    const fallbackRecord = { ...record };
    delete fallbackRecord.truck_repair_ref_id;
    delete fallbackRecord.odometer_reading;
    result = await supabaseFetch(env, "for_repair_trucks?on_conflict=for_repair_id", {
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
    for_repair_id: forRepairId,
    truck_repair_ref_id: truckRepairRefId,
    record: saved || record
  };
}
