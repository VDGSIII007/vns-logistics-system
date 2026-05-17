const REPAIR_PENDING_STATUSES = new Set([
  "for approval",
  "pending",
  "pending owner approval",
  "submitted",
  "for review"
]);

const REPAIR_FINAL_STATUSES = new Set([
  "approved",
  "paid",
  "completed",
  "done",
  "rejected",
  "returned",
  "deleted",
  "cancelled",
  "canceled"
]);

const STATUS_FIELDS = [
  "Approval_Status",
  "approvalStatus",
  "Status",
  "status",
  "Repair_Status",
  "repairStatus",
  "Request_Status",
  "requestStatus",
  "Payment_Status",
  "paymentStatus"
];

const APPROVAL_STATUS_FIELDS = [
  "Approval_Status",
  "approvalStatus",
  "Status",
  "status",
  "Repair_Status",
  "repairStatus",
  "Request_Status",
  "requestStatus"
];

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusMatches(value, statuses) {
  const status = normalizeStatus(value);
  return [...statuses].some(target => status === target || (target.length > 4 && status.includes(target)));
}

export function extractRepairRows(input) {
  if (Array.isArray(input)) return { rows: input, responseKeys: [] };
  if (!input || typeof input !== "object") return { rows: [], responseKeys: [] };

  const containers = [
    input.records,
    input.data,
    input.items,
    input.rows,
    input.entries,
    input.requests,
    input.repairs,
    input.result
  ];

  for (const value of containers) {
    if (Array.isArray(value)) return { rows: value, responseKeys: Object.keys(input) };
  }

  return { rows: [], responseKeys: Object.keys(input) };
}

function valuesFrom(row, fields) {
  return fields.map(field => normalizeStatus(row?.[field])).filter(Boolean);
}

function isDeleted(row) {
  if (!row || row.isDeleted) return true;
  return normalizeStatus(row.Is_Deleted) === "true";
}

function isRepairPending(row) {
  if (isDeleted(row)) return false;

  const allStatuses = valuesFrom(row, STATUS_FIELDS);
  if (allStatuses.some(value => statusMatches(value, REPAIR_FINAL_STATUSES))) return false;

  return valuesFrom(row, APPROVAL_STATUS_FIELDS)
    .filter(status => status !== "draft")
    .some(status => statusMatches(status, REPAIR_PENDING_STATUSES));
}

export function countRepairPending(input) {
  return extractRepairRows(input).rows.filter(isRepairPending).length;
}

export async function fetchRepairSource(env) {
  if (!env.REPAIR_WEB_APP_URL) throw new Error("REPAIR_WEB_APP_URL is not configured");

  const url = new URL(env.REPAIR_WEB_APP_URL);
  url.searchParams.set("action", "list");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Repair API returned ${response.status}`);

  return response.json();
}

export async function fetchRepairPendingCount(env) {
  return countRepairPending(await fetchRepairSource(env));
}

function uniqueFirst(values, max = 12) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

export async function debugRepairSource(env) {
  try {
    const data = await fetchRepairSource(env);
    const { rows, responseKeys } = extractRepairRows(data);
    const records = rows.filter(row => row && typeof row === "object");

    return {
      fetched: true,
      recordCount: records.length,
      sampleKeys: uniqueFirst(records.flatMap(record => Object.keys(record))),
      sampleStatuses: uniqueFirst(records.flatMap(record => valuesFrom(record, STATUS_FIELDS))),
      pendingCount: records.filter(isRepairPending).length,
      ...(records.length ? {} : { responseKeys })
    };
  } catch (error) {
    return {
      fetched: false,
      recordCount: 0,
      sampleKeys: [],
      sampleStatuses: [],
      pendingCount: 0,
      error: error?.message || "Repair source fetch failed"
    };
  }
}
