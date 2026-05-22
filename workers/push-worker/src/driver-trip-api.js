const SAFE_ERROR = "Driver trip service is unavailable";

function supabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase driver trip API is not configured" };
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

function friendlyDateStamp(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function generateFriendlyId(env, dateValue) {
  const stamp = friendlyDateStamp(dateValue);
  const start = `DTRIP-${stamp}-`;
  const filters = new URLSearchParams({
    select: "trip_ref_id",
    trip_ref_id: `like.${start}%`,
    order: "trip_ref_id.desc",
    limit: "100"
  });
  const result = await supabaseFetch(env, `driver_trip_submissions?${filters.toString()}`, { method: "GET" });
  if (result.error) return `${start}${String(Date.now()).slice(-3)}`;
  const highest = (Array.isArray(result.body) ? result.body : []).reduce((max, row) => {
    const match = String(row?.trip_ref_id || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${start}${String(highest + 1).padStart(3, "0")}`;
}

function mapDriverTripSubmission(input = {}, tripRefId) {
  const now = new Date().toISOString();
  return {
    trip_ref_id: tripRefId || textOrNull(input.trip_ref_id),
    plate_number: textOrNull(input.plate_number || input.plateNumber),
    driver_name: textOrNull(input.driver_name || input.driverName),
    helper_name: textOrNull(input.helper_name || input.helperName),
    mobile_number: textOrNull(input.mobile_number || input.mobileNumber),
    trip_date: dateOrNull(input.trip_date || input.tripDate),
    shipment_number: textOrNull(input.shipment_number || input.shipmentNumber),
    container_number: textOrNull(input.container_number || input.containerNumber),
    product_line: textOrNull(input.product_line || input.productLine),
    source: textOrNull(input.source),
    destination: textOrNull(input.destination),
    trip_status: textOrNull(input.trip_status || input.tripStatus) || "Submitted",
    driver_allowance: numberOrZero(input.driver_allowance || input.driverAllowance),
    helper_allowance: numberOrZero(input.helper_allowance || input.helperAllowance),
    fuel_amount: numberOrZero(input.fuel_amount || input.fuelAmount),
    toll_fee: numberOrZero(input.toll_fee || input.tollFee),
    parking_fee: numberOrZero(input.parking_fee || input.parkingFee),
    passway_fee: numberOrZero(input.passway_fee || input.passwayFee || input.passway),
    other_expense: numberOrZero(input.other_expense || input.otherExpense),
    other_expense_description: textOrNull(input.other_expense_description || input.otherExpenseDescription),
    delivered_at: timestampOrNull(input.delivered_at || input.deliveredAt),
    receiver_name: textOrNull(input.receiver_name || input.receiverName),
    remarks: textOrNull(input.remarks),
    submission_status: textOrNull(input.submission_status || input.submissionStatus) || "Submitted",
    raw_data: input && typeof input === "object" ? input : {},
    updated_at: now
  };
}

function validateDriverTripSubmission(record = {}) {
  if (!record.plate_number) return "plate_number is required";
  if (!record.driver_name) return "driver_name is required";
  if (!record.trip_date) return "trip_date is required";
  if (!record.shipment_number) return "shipment_number is required";
  if (!record.source) return "source is required";
  if (!record.destination) return "destination is required";
  return "";
}

export async function createDriverTripSubmissionInSupabase(env, input = {}) {
  const tripRefId = textOrNull(input.trip_ref_id || input.tripRefId) || await generateFriendlyId(env, input.trip_date || input.tripDate);
  const record = mapDriverTripSubmission(input, tripRefId);
  const validationError = validateDriverTripSubmission(record);
  if (validationError) return { ok: false, error: validationError, status: 400 };

  const result = await supabaseFetch(env, "driver_trip_submissions?on_conflict=trip_ref_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([record])
  });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };

  const saved = Array.isArray(result.body) ? result.body[0] : record;
  return {
    ok: true,
    source: "supabase",
    trip_ref_id: saved.trip_ref_id || tripRefId,
    refId: saved.trip_ref_id || tripRefId,
    record: saved
  };
}

export async function listDriverTripSubmissionsFromSupabase(env, searchParams) {
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 1000);
  const filters = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit)
  });
  if (searchParams.get("submission_status")) filters.set("submission_status", `eq.${searchParams.get("submission_status")}`);
  if (searchParams.get("plate_number")) filters.set("plate_number", `eq.${searchParams.get("plate_number")}`);
  if (searchParams.get("driver_name")) filters.set("driver_name", `ilike.${searchParams.get("driver_name")}`);
  if (searchParams.get("trip_date")) filters.set("trip_date", `eq.${searchParams.get("trip_date")}`);

  const result = await supabaseFetch(env, `driver_trip_submissions?${filters.toString()}`, { method: "GET" });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };

  const records = Array.isArray(result.body) ? result.body : [];
  return {
    ok: true,
    source: "supabase",
    records,
    count: records.length
  };
}

export async function updateDriverTripSubmissionStatusInSupabase(env, input = {}) {
  const tripRefId = textOrNull(input.trip_ref_id || input.tripRefId || input.ref_id || input.refId);
  const submissionStatus = textOrNull(input.submission_status || input.submissionStatus || input.status);
  if (!tripRefId || !submissionStatus) {
    return { ok: false, error: "trip_ref_id and submission_status are required", status: 400 };
  }

  const payload = {
    submission_status: submissionStatus,
    remarks: textOrNull(input.remarks) || textOrNull(input.notes),
    updated_at: new Date().toISOString()
  };
  Object.keys(payload).forEach(key => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === "") delete payload[key];
  });

  const filters = new URLSearchParams({ trip_ref_id: `eq.${tripRefId}` });
  const result = await supabaseFetch(env, `driver_trip_submissions?${filters.toString()}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(payload)
  });
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };
  const records = Array.isArray(result.body) ? result.body : [];
  if (!records.length) return { ok: false, error: `No driver trip found for ${tripRefId}`, status: 404 };

  return {
    ok: true,
    source: "supabase",
    trip_ref_id: tripRefId,
    record: records[0]
  };
}
