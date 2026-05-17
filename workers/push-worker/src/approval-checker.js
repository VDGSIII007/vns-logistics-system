import { fetchCashPendingCount } from "./checkers/cash.js";
import { fetchRepairPendingCount } from "./checkers/repair.js";
import { listTargetSubscriptions, subscriptionKey } from "./subscriptions.js";
import { sendWebPush } from "./webpush.js";

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

function buildPayload(cashIncreased, repairIncreased) {
  if (cashIncreased && !repairIncreased) {
    return {
      title: "VNS Cash Approval",
      body: "New Cash / PO / Bali request waiting for approval.",
      url: "/approval-center.html?tab=cash"
    };
  }

  if (repairIncreased && !cashIncreased) {
    return {
      title: "VNS Repair Approval",
      body: "New Repair / Labor request waiting for approval.",
      url: "/approval-center.html?tab=repair"
    };
  }

  return {
    title: "VNS Approval Alert",
    body: "New approval requests are waiting.",
    url: "/approval-center.html"
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

  const [cashPending, repairPending] = await Promise.all([
    fetchCashPendingCount(env),
    fetchRepairPendingCount(env)
  ]);
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
    const payload = buildPayload(cashIncreased, repairIncreased);
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
