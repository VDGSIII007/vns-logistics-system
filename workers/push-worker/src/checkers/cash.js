const CASH_PENDING_STATUSES = new Set([
  "for approval",
  "pending",
  "pending approval",
  "submitted",
  "for review"
]);

const CASH_FINAL_STATUSES = new Set([
  "approved",
  "paid",
  "deposited",
  "used",
  "rejected",
  "returned",
  "deleted",
  "cancelled",
  "canceled"
]);

const STATUS_FIELDS = [
  "Review_Status",
  "reviewStatus",
  "Status",
  "status",
  "Approval_Status",
  "approvalStatus",
  "Request_Status",
  "requestStatus",
  "State",
  "state"
];

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusMatches(value, statuses) {
  const status = normalizeStatus(value);
  return [...statuses].some(target => status === target || (target.length > 4 && status.includes(target)));
}

export function extractCashRows(input) {
  if (Array.isArray(input)) return { rows: input, responseKeys: [] };
  if (!input || typeof input !== "object") return { rows: [], responseKeys: [] };

  const containers = [
    input.records,
    input.data,
    input.items,
    input.rows,
    input.entries,
    input.requests,
    input.result
  ];

  for (const value of containers) {
    if (Array.isArray(value)) return { rows: value, responseKeys: Object.keys(input) };
  }

  return { rows: [], responseKeys: Object.keys(input) };
}

function statusValues(row) {
  return STATUS_FIELDS.map(field => normalizeStatus(row?.[field])).filter(Boolean);
}

function isDeleted(row) {
  if (!row || row.isDeleted) return true;
  return normalizeStatus(row.Is_Deleted) === "true" ||
    statusValues(row).some(value => statusMatches(value, new Set(["deleted", "cancelled", "canceled"])));
}

function isCashPending(row) {
  if (isDeleted(row)) return false;

  for (const status of statusValues(row)) {
    if (status === "draft") continue;
    if (statusMatches(status, CASH_FINAL_STATUSES)) return false;
    if (statusMatches(status, CASH_PENDING_STATUSES)) return true;
  }

  return false;
}

export function countCashPending(input) {
  return extractCashRows(input).rows.filter(isCashPending).length;
}

export async function fetchCashSource(env) {
  if (!env.CASH_APP_SCRIPT_URL) throw new Error("CASH_APP_SCRIPT_URL is not configured");
  if (!env.CASH_SYNC_KEY) throw new Error("CASH_SYNC_KEY is not configured");

  const url = new URL(env.CASH_APP_SCRIPT_URL);
  url.searchParams.set("action", "listEntries");
  url.searchParams.set("syncKey", env.CASH_SYNC_KEY);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Cash API returned ${response.status}`);

  return response.json();
}

export async function fetchCashPendingCount(env) {
  return countCashPending(await fetchCashSource(env));
}

function uniqueFirst(values, max = 12) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

export async function debugCashSource(env) {
  try {
    const data = await fetchCashSource(env);
    const { rows, responseKeys } = extractCashRows(data);
    const records = rows.filter(row => row && typeof row === "object");

    return {
      fetched: true,
      recordCount: records.length,
      sampleKeys: uniqueFirst(records.flatMap(record => Object.keys(record))),
      sampleStatuses: uniqueFirst(records.flatMap(statusValues)),
      pendingCount: records.filter(isCashPending).length,
      ...(records.length ? {} : { responseKeys })
    };
  } catch (error) {
    return {
      fetched: false,
      recordCount: 0,
      sampleKeys: [],
      sampleStatuses: [],
      pendingCount: 0,
      error: error?.message || "Cash source fetch failed"
    };
  }
}
