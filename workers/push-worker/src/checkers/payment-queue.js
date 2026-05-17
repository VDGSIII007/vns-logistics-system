import { fetchCashSource, extractCashRows } from "./cash.js";
import { fetchRepairSource, extractRepairRows } from "./repair.js";
import { listSubscriptionsByRoles, subscriptionKey } from "../subscriptions.js";
import { sendWebPush } from "../webpush.js";

const LAST_PAYMENT_COUNT_KEY = "push:last-payment-queue-count:global";
const LAST_PAYMENT_NOTIFICATION_KEY = "push:last-payment-notification:global";
const TARGET_ROLES = ["Sister", "Payment", "Admin"];

const PAYMENT_QUEUE_STATUSES = new Set([
  "approved",
  "for payment",
  "for release",
  "unpaid",
  "pending payment",
  "ready for payment",
  "ready for release"
]);

const FINAL_PAYMENT_STATUSES = new Set([
  "paid",
  "deposited",
  "used",
  "released",
  "completed",
  "done",
  "rejected",
  "returned",
  "cancelled",
  "canceled",
  "deleted",
  "draft"
]);

const CASH_STATUS_FIELDS = [
  "Review_Status",
  "reviewStatus",
  "Status",
  "status",
  "Approval_Status",
  "approvalStatus",
  "Payment_Status",
  "paymentStatus",
  "Posted_Status",
  "postedStatus"
];

const REPAIR_STATUS_FIELDS = [
  "Approval_Status",
  "approvalStatus",
  "Status",
  "status",
  "Repair_Status",
  "repairStatus",
  "Request_Status",
  "requestStatus",
  "Payment_Status",
  "paymentStatus",
  "Posted_Status",
  "postedStatus"
];

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusMatches(value, statuses) {
  const status = normalizeStatus(value);
  return [...statuses].some(target => status === target || (target.length > 4 && status.includes(target)));
}

function valuesFrom(row, fields) {
  return fields.map(field => normalizeStatus(row?.[field])).filter(Boolean);
}

function isDeleted(row) {
  if (!row || row.isDeleted) return true;
  return normalizeStatus(row.Is_Deleted) === "true";
}

function paymentQueueReady(row, fields) {
  if (isDeleted(row)) return false;
  const statuses = valuesFrom(row, fields);
  if (statuses.some(status => statusMatches(status, FINAL_PAYMENT_STATUSES))) return false;
  return statuses.some(status => statusMatches(status, PAYMENT_QUEUE_STATUSES));
}

function uniqueFirst(values, max = 12) {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

function debugSource(records, fields, paymentQueueCount, extra = {}) {
  return {
    fetched: true,
    recordCount: records.length,
    sampleKeys: uniqueFirst(records.flatMap(record => Object.keys(record))),
    sampleStatuses: uniqueFirst(records.flatMap(record => valuesFrom(record, fields))),
    paymentQueueCount,
    ...extra
  };
}

async function debugCashPaymentQueue(env) {
  const data = await fetchCashSource(env);
  const { rows, responseKeys } = extractCashRows(data);
  const records = rows.filter(row => row && typeof row === "object");
  const paymentQueueCount = records.filter(row => paymentQueueReady(row, CASH_STATUS_FIELDS)).length;
  return debugSource(records, CASH_STATUS_FIELDS, paymentQueueCount, records.length ? {} : { responseKeys });
}

async function debugRepairPaymentQueue(env) {
  const data = await fetchRepairSource(env);
  const { rows, responseKeys } = extractRepairRows(data);
  const records = rows.filter(row => row && typeof row === "object");
  const paymentQueueCount = records.filter(row => paymentQueueReady(row, REPAIR_STATUS_FIELDS)).length;
  return debugSource(records, REPAIR_STATUS_FIELDS, paymentQueueCount, records.length ? {} : { responseKeys });
}

function debugPayrollPaymentQueue(env) {
  if (!env.PAYROLL_WEB_APP_URL && !env.PAYROLL_APP_SCRIPT_URL) {
    return {
      fetched: false,
      reason: "Payroll backend not configured in push worker yet",
      paymentQueueCount: 0
    };
  }

  return {
    fetched: false,
    reason: "Payroll payment queue checker is not enabled yet",
    paymentQueueCount: 0
  };
}

async function safeDebug(label, read) {
  try {
    return await read();
  } catch (error) {
    return {
      fetched: false,
      recordCount: 0,
      sampleKeys: [],
      sampleStatuses: [],
      paymentQueueCount: 0,
      error: error?.message || `${label} payment queue fetch failed`
    };
  }
}

export async function debugPaymentQueueSources(env) {
  const [cash, repair] = await Promise.all([
    safeDebug("Cash", () => debugCashPaymentQueue(env)),
    safeDebug("Repair", () => debugRepairPaymentQueue(env))
  ]);
  const payroll = debugPayrollPaymentQueue(env);

  return {
    cash,
    repair,
    payroll,
    paymentQueuePending: cash.paymentQueueCount + repair.paymentQueueCount + payroll.paymentQueueCount
  };
}

async function sendPaymentQueuePush(env, payload) {
  const targets = await listSubscriptionsByRoles(env.VNS_PUSH_SUBSCRIPTIONS, TARGET_ROLES);
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

export async function runPaymentQueuePushCheck(env) {
  if (!env.VNS_PUSH_SUBSCRIPTIONS) throw new Error("KV binding is not configured");

  const paymentQueue = await debugPaymentQueueSources(env);
  const paymentQueuePending = paymentQueue.paymentQueuePending;
  const previous = await env.VNS_PUSH_SUBSCRIPTIONS.get(LAST_PAYMENT_COUNT_KEY, "json");
  const previousCount = Number(previous?.paymentQueuePending || 0);
  const hasPrevious = Boolean(previous);
  const shouldPush = hasPrevious && paymentQueuePending > previousCount;
  const payload = {
    title: "VNS Payment Queue",
    body: "New item ready for payment release.",
    url: "/payment-queue.html"
  };

  let sent = 0;
  let failed = 0;
  let pushed = false;

  if (shouldPush) {
    const result = await sendPaymentQueuePush(env, payload);
    sent = result.sent;
    failed = result.failed;
    pushed = sent > 0;
    if (pushed) {
      await env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_PAYMENT_NOTIFICATION_KEY, JSON.stringify({
        paymentQueuePending,
        paymentQueueDelta: paymentQueuePending - previousCount,
        ...payload,
        targetRoles: TARGET_ROLES,
        sentAt: new Date().toISOString()
      }));
    }
  }

  await env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_PAYMENT_COUNT_KEY, JSON.stringify({
    paymentQueuePending,
    checkedAt: new Date().toISOString()
  }));

  return {
    ok: true,
    counts: { paymentQueuePending },
    previous: previous || { paymentQueuePending: previousCount, checkedAt: null },
    pushed,
    sent,
    failed
  };
}
