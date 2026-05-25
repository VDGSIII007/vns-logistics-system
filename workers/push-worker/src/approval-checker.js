import { extractCashRows, fetchCashSource } from "./checkers/cash.js";
import { extractRepairRows, fetchRepairSource } from "./checkers/repair.js";
import { listTargetSubscriptions, subscriptionKey } from "./subscriptions.js";
import { sendWebPush } from "./webpush.js";

const CASH_PENDING_STATUSES = new Set([
  "for approval", "pending", "pending approval", "submitted", "for review"
]);
const CASH_FINAL_STATUSES = new Set([
  "approved", "paid", "deposited", "used", "rejected", "returned",
  "deleted", "cancelled", "canceled"
]);
const REPAIR_PENDING_STATUSES = new Set([
  "for approval", "pending", "pending approval", "submitted", "for review"
]);
const REPAIR_FINAL_STATUSES = new Set([
  "approved", "paid", "rejected", "returned", "deleted", "cancelled", "canceled"
]);

function norm(v) { return String(v ?? "").trim().toLowerCase(); }

function rowStatuses(row) {
  return [
    row?.Review_Status, row?.reviewStatus, row?.Status, row?.status,
    row?.Approval_Status, row?.approvalStatus, row?.payment_status,
    row?.Payment_Status, row?.Request_Status, row?.requestStatus,
  ].map(norm).filter(Boolean);
}

function isPending(row, pendingSet, finalSet) {
  if (!row || row.isDeleted || norm(row.Is_Deleted) === "true") return false;
  for (const s of rowStatuses(row)) {
    if (s === "draft") continue;
    if ([...finalSet].some(t => s === t || (t.length > 4 && s.includes(t)))) return false;
    if ([...pendingSet].some(t => s === t || (t.length > 4 && s.includes(t)))) return true;
  }
  return false;
}

function firstField(row, fields) {
  for (const f of fields) {
    const v = row?.[f];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function summarizeCashRow(row) {
  const plate = firstField(row, ["Plate_Number", "plateNumber", "plate_number"]);
  const ref   = firstField(row, ["Request_No", "requestNo", "request_no", "Cash_Ref_ID", "cashRefId", "cash_ref_id"]);
  const type  = firstField(row, ["Transaction_Type", "transactionType", "Type", "type", "Request_Type", "requestType", "request_type"]) || "Cash";
  const amt   = firstField(row, ["Amount", "amount", "budgetAmount"]);
  return { plate, ref, type, amount: amt };
}

function summarizeRepairRow(row) {
  const plate = firstField(row, ["Plate_Number", "plateNumber", "plate_number"]);
  const ref   = firstField(row, ["Request_No", "requestNo", "request_no", "Repair_Ref_ID", "repairRefId", "repair_ref_id"]);
  const type  = firstField(row, ["Request_Type", "requestType", "request_type", "Type", "type"]) || "Repair";
  const amt   = firstField(row, ["Total_Amount", "totalAmount", "total_amount", "Amount", "amount"]);
  return { plate, ref, type, amount: amt };
}

function formatAmount(amt) {
  const n = Number(amt);
  if (!Number.isFinite(n) || n === 0) return "";
  return ` ₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function bodyFromSummary(s) {
  const bits = [];
  if (s.plate) bits.push(s.plate);
  if (s.type)  bits.push(s.type);
  const base = bits.join(" · ");
  return `${base}${formatAmount(s.amount)}${s.ref ? ` · ${s.ref}` : ""}`.trim() || "New request waiting for approval.";
}

const LAST_COUNTS_KEY = "push:last-counts:global";
const LAST_SENT_KEY = "push:last-sent:global";
export const LAST_NOTIFICATION_KEY = "push:last-notification:global";
const MIN_PUSH_INTERVAL_MS = 5 * 60 * 1000;

function buildCounts(cashPending, repairPending) {
  return {
    cashPending,
    repairPending,
    totalPending: cashPending + repairPending
  };
}

function buildPayload(cashIncreased, repairIncreased, latestCash, latestRepair) {
  if (cashIncreased && !repairIncreased) {
    const s = latestCash ? summarizeCashRow(latestCash) : null;
    return {
      title: "VNS Cash Approval",
      body: s ? bodyFromSummary(s) : "New Cash / PO / Bali request waiting for approval.",
      url: s?.ref
        ? `/mobile/approval?module=cash&ref=${encodeURIComponent(s.ref)}`
        : "/mobile/approval?module=cash"
    };
  }

  if (repairIncreased && !cashIncreased) {
    const s = latestRepair ? summarizeRepairRow(latestRepair) : null;
    return {
      title: "VNS Repair Approval",
      body: s ? bodyFromSummary(s) : "New Repair / Labor request waiting for approval.",
      url: s?.ref
        ? `/mobile/approval?module=repair&ref=${encodeURIComponent(s.ref)}`
        : "/mobile/approval?module=repair"
    };
  }

  return {
    title: "VNS Approval Alert",
    body: "New approval requests are waiting.",
    url: "/mobile/approval"
  };
}

export async function getLastNotification(env) {
  if (!env.VNS_PUSH_SUBSCRIPTIONS) return null;
  return env.VNS_PUSH_SUBSCRIPTIONS.get(LAST_NOTIFICATION_KEY, "json");
}

export function publicLastNotification(record) {
  if (!record) return null;
  return {
    title: record.title || "",
    body: record.body || "",
    sentAt: record.sentAt || null,
    acknowledgedAt: record.acknowledgedAt || null
  };
}

export async function acknowledgeLastNotification(env, input = {}) {
  if (!env.VNS_PUSH_SUBSCRIPTIONS) throw new Error("KV binding is not configured");

  const existing = await getLastNotification(env);
  if (!existing) {
    return {
      ok: true,
      acknowledged: false,
      lastNotification: null
    };
  }

  const updated = {
    ...existing,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: String(input.role || "unknown").trim().slice(0, 80) || "unknown"
  };
  await env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_NOTIFICATION_KEY, JSON.stringify(updated));

  return {
    ok: true,
    acknowledged: true,
    lastNotification: updated
  };
}

async function sendToTargets(env, payload) {
  const targets = await listTargetSubscriptions(env.VNS_PUSH_SUBSCRIPTIONS);
  let sent = 0;
  let failed = 0;

  await Promise.all(targets.map(async record => {
    try {
      const result = await sendWebPush(record.subscription, payload, env);
      if (result.expired) await env.VNS_PUSH_SUBSCRIPTIONS.delete(subscriptionKey(record.endpointHash));
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
    }
  }));

  return { sent, failed };
}

export async function runApprovalPushCheck(env) {
  if (!env.VNS_PUSH_SUBSCRIPTIONS) throw new Error("KV binding is not configured");

  const [cashRaw, repairRaw] = await Promise.all([
    fetchCashSource(env).catch(() => null),
    fetchRepairSource(env).catch(() => null)
  ]);
  const cashRows = cashRaw ? extractCashRows(cashRaw).rows.filter(r => isPending(r, CASH_PENDING_STATUSES, CASH_FINAL_STATUSES)) : [];
  const repairRows = repairRaw ? extractRepairRows(repairRaw).rows.filter(r => isPending(r, REPAIR_PENDING_STATUSES, REPAIR_FINAL_STATUSES)) : [];
  const cashPending = cashRows.length;
  const repairPending = repairRows.length;
  const latestCash = cashRows[0] || null;
  const latestRepair = repairRows[0] || null;
  const counts = buildCounts(cashPending, repairPending);
  const previous = await env.VNS_PUSH_SUBSCRIPTIONS.get(LAST_COUNTS_KEY, "json");
  const lastNotification = await getLastNotification(env);
  const hasPrevious = Boolean(previous);
  const previousCounts = {
    cashPending: Number(previous?.cashPending || 0),
    repairPending: Number(previous?.repairPending || 0),
    totalPending: Number(previous?.totalPending || 0),
    checkedAt: previous?.checkedAt || null
  };
  const seenCounts = {
    cashPending: Math.max(previousCounts.cashPending, Number(lastNotification?.cashPending || 0)),
    repairPending: Math.max(previousCounts.repairPending, Number(lastNotification?.repairPending || 0))
  };

  const cashIncreased = hasPrevious && counts.cashPending > seenCounts.cashPending;
  const repairIncreased = hasPrevious && counts.repairPending > seenCounts.repairPending;
  const shouldPush = cashIncreased || repairIncreased;
  const lastSentIso = await env.VNS_PUSH_SUBSCRIPTIONS.get(LAST_SENT_KEY);
  const lastSentTime = lastSentIso ? Date.parse(lastSentIso) : 0;
  const rateLimited = shouldPush && lastSentTime && Date.now() - lastSentTime < MIN_PUSH_INTERVAL_MS;

  let sent = 0;
  let failed = 0;
  let pushed = false;

  if (shouldPush && !rateLimited) {
    const payload = buildPayload(cashIncreased, repairIncreased, latestCash, latestRepair);
    const result = await sendToTargets(env, payload);
    sent = result.sent;
    failed = result.failed;
    pushed = sent > 0;
    if (pushed) {
      const sentAt = new Date().toISOString();
      await Promise.all([
        env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_SENT_KEY, sentAt),
        env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_NOTIFICATION_KEY, JSON.stringify({
          ...counts,
          cashDelta: counts.cashPending - seenCounts.cashPending,
          repairDelta: counts.repairPending - seenCounts.repairPending,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          sentAt,
          acknowledgedAt: null,
          acknowledgedBy: null
        }))
      ]);
    }
  }

  await env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_COUNTS_KEY, JSON.stringify({
    ...counts,
    checkedAt: new Date().toISOString()
  }));

  return {
    ok: true,
    counts,
    previous: previousCounts,
    pushed,
    sent,
    failed,
    rateLimited: Boolean(rateLimited)
  };
}
