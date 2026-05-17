import { fetchCashPendingCount } from "./checkers/cash.js";
import { fetchRepairPendingCount } from "./checkers/repair.js";
import { listTargetSubscriptions, subscriptionKey } from "./subscriptions.js";
import { sendWebPush } from "./webpush.js";

const LAST_COUNTS_KEY = "push:last-counts:global";
const LAST_SENT_KEY = "push:last-sent:global";
const MIN_PUSH_INTERVAL_MS = 5 * 60 * 1000;

function buildCounts(cashPending, repairPending) {
  return {
    cashPending,
    repairPending,
    totalPending: cashPending + repairPending
  };
}

function buildPayload(cashIncreased, repairIncreased) {
  let body = "New approval requests are waiting.";
  if (cashIncreased && !repairIncreased) body = "New Cash / PO / Bali request waiting for approval.";
  if (repairIncreased && !cashIncreased) body = "New Repair / Labor request waiting for approval.";

  return {
    title: "VNS Approval Alert",
    body,
    url: "/approval-center.html"
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
  const hasPrevious = Boolean(previous);
  const previousCounts = {
    cashPending: Number(previous?.cashPending || 0),
    repairPending: Number(previous?.repairPending || 0),
    totalPending: Number(previous?.totalPending || 0),
    checkedAt: previous?.checkedAt || null
  };

  const cashIncreased = hasPrevious && counts.cashPending > previousCounts.cashPending;
  const repairIncreased = hasPrevious && counts.repairPending > previousCounts.repairPending;
  const shouldPush = cashIncreased || repairIncreased;
  const lastSentIso = await env.VNS_PUSH_SUBSCRIPTIONS.get(LAST_SENT_KEY);
  const lastSentTime = lastSentIso ? Date.parse(lastSentIso) : 0;
  const rateLimited = shouldPush && lastSentTime && Date.now() - lastSentTime < MIN_PUSH_INTERVAL_MS;

  let sent = 0;
  let failed = 0;
  let pushed = false;

  if (shouldPush && !rateLimited) {
    const result = await sendToTargets(env, buildPayload(cashIncreased, repairIncreased));
    sent = result.sent;
    failed = result.failed;
    pushed = sent > 0;
    if (pushed) await env.VNS_PUSH_SUBSCRIPTIONS.put(LAST_SENT_KEY, new Date().toISOString());
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
