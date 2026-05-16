(function () {
  "use strict";

  const CASH_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyu1N444S_vthjIoxcy081CdDZJuy6EwHt5ktKU42U4qNY_HL4F2HHKEQl6HDSZZItf/exec";
  const CASH_SYNC_KEY = "vns-cash-sync-2026-Jay";
  const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";
  const REFRESH_INTERVAL_MS = 60000;
  const NOTIFICATION_COOLDOWN_MS = 60000;
  const LAST_NOTIFIED_COUNT_KEY = "vnsLastNotifiedCount";
  const LAST_NOTIFICATION_AT_KEY = "vnsLastNotificationAt";
  const PUSH_SUBSCRIPTION_KEY = "vnsPushSubscription";
  const PUSH_ENDPOINT_HASH_KEY = "vnsPushEndpointHash";
  const PUSH_PUBLIC_KEY = window.VNS_PUSH_PUBLIC_KEY || "";
  const PUSH_API_BASE = window.VNS_PUSH_API_BASE || "/api/push";
  const ORIGINAL_TITLE = (document.title.replace(/^\(\d+\)\s*/, "") || "VNS Portal")
    .replace(/^VNS Logistics System Portal$/, "VNS Portal");

  const STORAGE_KEYS = {
    payroll: "vnsPayrollRecords",
    diesel: "vnsDieselPOEntries",
    budget: "vnsTripBudgets",
    bali: "vnsBaliCashAdvances",
    repair: "vnsRepairChangeRequests",
    forRepair: "vnsForRepairTrucks"
  };

  const APPROVAL_STATUSES = {
    payroll: ["submitted", "for review", "for approval"],
    cash: ["for approval", "pending", "pending approval", "submitted", "for review"],
    repair: ["for approval", "pending", "pending owner approval", "submitted", "for review"]
  };
  const RETURNED_STATUSES = ["returned", "needs revision", "return for revision"];
  const FINISHED_APPROVAL_STATUSES = ["approved", "completed", "done", "rejected", "returned", "deleted", "cancelled", "canceled", "paid", "deposited", "used"];

  let latestSummary = null;
  let isRefreshing = false;
  let serviceWorkerRegistration = null;
  let pushState = {
    supported: false,
    registered: false,
    subscribed: false,
    status: "Checking...",
    message: ""
  };

  function readJson(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function readNumber(key) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function writeStorageValue(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn("VNS notifications: unable to save browser alert state.", error);
    }
  }

  function writeJsonValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("VNS notifications: unable to save push subscription state.", error);
    }
  }

  function removeStorageValue(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("VNS notifications: unable to clear push subscription state.", error);
    }
  }

  function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function valuesFrom(record, keys) {
    return keys.map(key => normalize(record?.[key])).filter(Boolean);
  }

  function firstValue(record, keys) {
    return valuesFrom(record, keys)[0] || "";
  }

  function isDeleted(record) {
    if (!record || record.isDeleted) return true;
    return normalize(record.Is_Deleted) === "true" || valuesFrom(record, ["status", "Status"]).some(value => ["deleted", "cancelled", "canceled"].includes(value));
  }

  function statusMatches(value, statuses) {
    const status = normalize(value);
    return statuses.some(target => status === target || (target.length > 4 && status.includes(target)));
  }

  function anyStatusMatches(record, keys, statuses) {
    return valuesFrom(record, keys).some(value => statusMatches(value, statuses));
  }

  function normalizeListResponse(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.entries)) return data.entries;
    if (Array.isArray(data?.records)) return data.records;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.result)) return data.result;
    return [];
  }

  async function fetchJsonList(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return normalizeListResponse(await response.json()).filter(record => record && typeof record === "object");
  }

  async function loadCashRecords() {
    try {
      const params = new URLSearchParams({ action: "listEntries", syncKey: CASH_SYNC_KEY });
      const records = await fetchJsonList(`${CASH_APP_SCRIPT_URL}?${params.toString()}`);
      if (records.length) return { records, source: "Cash cloud listEntries" };
    } catch (error) {
      console.warn("VNS notifications: cash cloud unavailable; using localStorage fallback.", error);
    }
    return {
      records: [STORAGE_KEYS.diesel, STORAGE_KEYS.budget, STORAGE_KEYS.bali].flatMap(readJson),
      source: "localStorage cash fallback"
    };
  }

  async function loadRepairRecords() {
    try {
      const records = await fetchJsonList(`${REPAIR_WEB_APP_URL}?action=list`);
      if (records.length) return { records, source: "Repair cloud list action" };
    } catch (error) {
      console.warn("VNS notifications: repair cloud unavailable; using localStorage fallback.", error);
    }
    return {
      records: [STORAGE_KEYS.forRepair, STORAGE_KEYS.repair].flatMap(readJson),
      source: "localStorage repair fallback"
    };
  }

  function payrollNeedsApproval(record) {
    if (isDeleted(record)) return false;
    return anyStatusMatches(record, ["status", "Status", "Approval_Status", "approvalStatus", "Workflow_Status", "workflowStatus"], APPROVAL_STATUSES.payroll);
  }

  function cashNeedsApproval(record) {
    if (isDeleted(record)) return false;
    const status = firstValue(record, ["Review_Status", "reviewStatus", "Status", "status", "Approval_Status", "approvalStatus"]);
    if (!status || status === "draft" || FINISHED_APPROVAL_STATUSES.includes(status)) return false;
    return statusMatches(status, APPROVAL_STATUSES.cash);
  }

  function repairNeedsApproval(record) {
    if (isDeleted(record)) return false;
    const allStatuses = valuesFrom(record, ["Approval_Status", "approvalStatus", "Status", "status", "Repair_Status", "repairStatus", "Payment_Status", "paymentStatus"]);
    if (allStatuses.some(value => statusMatches(value, FINISHED_APPROVAL_STATUSES))) return false;
    return valuesFrom(record, ["Approval_Status", "approvalStatus", "Status", "status", "Repair_Status", "repairStatus"])
      .some(value => statusMatches(value, APPROVAL_STATUSES.repair));
  }

  function isPaidOrReleased(record) {
    return anyStatusMatches(record, ["Payment_Status", "paymentStatus", "Posted_Status", "postedStatus", "Status", "status"], ["paid", "deposited", "used", "released", "posted"]);
  }

  function payrollReadyForPayment(record) {
    if (isDeleted(record) || isPaidOrReleased(record)) return false;
    return anyStatusMatches(record, ["status", "Status", "Approval_Status", "approvalStatus", "Workflow_Status", "workflowStatus"], ["approved"]);
  }

  function cashReadyForPayment(record) {
    if (isDeleted(record) || isPaidOrReleased(record)) return false;
    const status = firstValue(record, ["Review_Status", "reviewStatus", "Status", "status", "Approval_Status", "approvalStatus"]);
    return status === "approved";
  }

  function repairReadyForPayment(record) {
    if (isDeleted(record) || isPaidOrReleased(record)) return false;
    return anyStatusMatches(record, ["status", "Status", "Approval_Status", "approvalStatus", "Payment_Status", "paymentStatus"], ["approved", "for deposit"]);
  }

  function needsRevision(record) {
    if (isDeleted(record)) return false;
    return anyStatusMatches(record, ["status", "Status", "Approval_Status", "approvalStatus", "Workflow_Status", "workflowStatus", "Review_Status", "reviewStatus", "Repair_Status", "repairStatus", "Payment_Status", "paymentStatus"], RETURNED_STATUSES);
  }

  function makeItem(id, title, count, description, href, roles) {
    return { id, title, count, description, href, roles };
  }

  function roleCanSee(item, role) {
    if (role === "Admin") return true;
    if (role === "Mother") return item.roles.includes("approval");
    if (role === "Sister") return item.roles.includes("payment");
    if (role === "Encoder") return item.roles.includes("revision") || item.roles.includes("entry");
    return item.roles.includes("viewer");
  }

  function currentRole() {
    return window.VNSAuth?.getRole ? window.VNSAuth.getRole() : "Admin";
  }

  function visibleGroupsForRole(summary, role = currentRole()) {
    return summary?.groups?.filter(item => roleCanSee(item, role)) || [];
  }

  function visibleActiveGroups(summary, role = currentRole()) {
    return visibleGroupsForRole(summary, role).filter(item => item.count > 0);
  }

  function visibleTotalForRole(summary, role = currentRole()) {
    return visibleActiveGroups(summary, role).reduce((total, item) => total + item.count, 0);
  }

  function visibleCountsByLane(summary, role = currentRole()) {
    return visibleGroupsForRole(summary, role).reduce((counts, item) => {
      if (item.roles.includes("payment")) counts.payment += item.count;
      if (item.roles.includes("approval")) counts.approval += item.count;
      if (item.roles.includes("revision")) counts.revision += item.count;
      return counts;
    }, { approval: 0, payment: 0, revision: 0 });
  }

  async function collectNotificationSummary() {
    const payrollRecords = readJson(STORAGE_KEYS.payroll);
    const [cashResult, repairResult] = await Promise.all([loadCashRecords(), loadRepairRecords()]);
    const cashRecords = cashResult.records;
    const repairRecords = repairResult.records;

    const counts = {
      payrollApproval: payrollRecords.filter(payrollNeedsApproval).length,
      cashApproval: cashRecords.filter(cashNeedsApproval).length,
      repairApproval: repairRecords.filter(repairNeedsApproval).length,
      payrollPayment: payrollRecords.filter(payrollReadyForPayment).length,
      cashPayment: cashRecords.filter(cashReadyForPayment).length,
      repairPayment: repairRecords.filter(repairReadyForPayment).length,
      returned: [
        ...payrollRecords,
        ...cashRecords,
        ...repairRecords
      ].filter(needsRevision).length
    };

    counts.approvalTotal = counts.payrollApproval + counts.cashApproval + counts.repairApproval;
    counts.paymentTotal = counts.payrollPayment + counts.cashPayment + counts.repairPayment;

    const groups = [
      makeItem("payroll", "Payroll Approval", counts.payrollApproval, `${counts.payrollApproval} waiting for Mother/Admin review`, "payroll.html", ["approval", "entry"]),
      makeItem("cash", "Cash / PO / Bali Approval", counts.cashApproval, `${counts.cashApproval} waiting across cash, PO, and Bali requests`, "cash.html", ["approval", "entry"]),
      makeItem("repair", "Repair / Labor Approval", counts.repairApproval, `${counts.repairApproval} repair or labor requests waiting`, "repair.html", ["approval", "entry"]),
      makeItem("payment", "Payment Queue", counts.paymentTotal, `${counts.paymentTotal} approved records ready for payment`, "payment-queue.html", ["payment"]),
      makeItem("returned", "Returned Requests", counts.returned, `${counts.returned} need revision`, "approval-center.html", ["revision", "approval"])
    ];

    return {
      counts,
      groups,
      sources: {
        payroll: STORAGE_KEYS.payroll,
        cash: cashResult.source,
        repair: repairResult.source,
        payment: "Approved unpaid local/cloud records",
        returned: "Returned status scan across notification sources"
      },
      checkedAt: new Date()
    };
  }

  function formatCheckedTime(date) {
    if (!date) return "Last checked: --";
    return `Last checked: ${date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
  }

  function browserAlertState() {
    if (!("Notification" in window)) {
      return {
        supported: false,
        permission: "unsupported",
        label: "Not supported",
        message: "Browser alerts are not supported on this device."
      };
    }
    if (Notification.permission === "granted") {
      return {
        supported: true,
        permission: "granted",
        label: "Enabled",
        message: "Browser alerts enabled."
      };
    }
    if (Notification.permission === "denied") {
      return {
        supported: true,
        permission: "denied",
        label: "Blocked",
        message: "Browser alerts are blocked. Please enable notifications in browser settings."
      };
    }
    return {
      supported: true,
      permission: "default",
      label: "Not enabled",
      message: "Browser alerts are not enabled."
    };
  }

  function renderBrowserAlertStatus(messageOverride = "") {
    const state = browserAlertState();
    const status = document.querySelector("[data-vns-browser-alert-status]");
    const message = document.querySelector("[data-vns-browser-alert-message]");
    const button = document.querySelector("[data-vns-enable-browser-alerts]");

    if (status) status.textContent = `Browser alerts: ${state.label}`;
    if (message) message.textContent = messageOverride || state.message;
    if (button) {
      button.hidden = false;
      button.disabled = !state.supported || state.permission === "granted" || state.permission === "denied";
      button.textContent = state.permission === "granted" ? "Browser Alerts Enabled" : "Enable Browser Alerts";
    }
  }

  function renderBackgroundPushStatus(messageOverride = "") {
    const status = document.querySelector("[data-vns-background-push-status]");
    const message = document.querySelector("[data-vns-background-push-message]");
    const subscribeButton = document.querySelector("[data-vns-subscribe-push]");
    const unsubscribeButton = document.querySelector("[data-vns-unsubscribe-push]");
    const testButton = document.querySelector("[data-vns-test-push]");

    if (status) status.textContent = `Background push: ${pushState.status}`;
    if (message) message.textContent = messageOverride || pushState.message || "";
    if (subscribeButton) {
      subscribeButton.hidden = pushState.subscribed;
      subscribeButton.disabled = !pushState.supported || !pushState.registered;
    }
    if (unsubscribeButton) {
      unsubscribeButton.hidden = !pushState.subscribed;
      unsubscribeButton.disabled = !pushState.supported || !pushState.registered;
    }
    if (testButton) {
      testButton.hidden = !pushState.subscribed;
      testButton.disabled = !pushState.supported || !pushState.registered;
    }
  }

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function hasConfiguredPushKey() {
    return Boolean(PUSH_PUBLIC_KEY && PUSH_PUBLIC_KEY !== "PUBLIC_KEY_PLACEHOLDER");
  }

  async function postPushApi(path, payload) {
    const response = await fetch(`${PUSH_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Push API failed: ${response.status}`);
    return data;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let index = 0; index < rawData.length; index += 1) {
      outputArray[index] = rawData.charCodeAt(index);
    }
    return outputArray;
  }

  async function syncPushSubscriptionState(registration = serviceWorkerRegistration) {
    if (!registration || !pushSupported()) {
      renderBackgroundPushStatus();
      return null;
    }

    const subscription = await registration.pushManager.getSubscription();
    pushState.subscribed = Boolean(subscription);
    if (subscription) {
      const serializedSubscription = subscription.toJSON ? subscription.toJSON() : subscription;
      writeJsonValue(PUSH_SUBSCRIPTION_KEY, serializedSubscription);
      if (hasConfiguredPushKey()) {
        try {
          const response = await postPushApi("/subscribe", {
            subscription: serializedSubscription,
            role: currentRole(),
            userAgent: navigator.userAgent || ""
          });
          if (response.endpointHash) writeStorageValue(PUSH_ENDPOINT_HASH_KEY, response.endpointHash);
        } catch (error) {
          console.warn("VNS notifications: unable to sync existing push subscription.", error);
        }
      }
      pushState.status = "Registered";
      pushState.message = "Background alerts subscribed.";
    } else {
      removeStorageValue(PUSH_SUBSCRIPTION_KEY);
      pushState.status = "Registered";
      pushState.message = hasConfiguredPushKey() ? "Background alerts can be subscribed on this browser." : "Background push needs server setup first.";
    }
    renderBackgroundPushStatus();
    return subscription;
  }

  async function registerServiceWorker() {
    if (!pushSupported()) {
      pushState = {
        supported: false,
        registered: false,
        subscribed: false,
        status: "Not supported",
        message: "Background push is not supported on this device."
      };
      renderBackgroundPushStatus();
      return null;
    }

    pushState.supported = true;
    pushState.status = "Supported";
    pushState.message = "Registering background push...";
    renderBackgroundPushStatus();

    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register("/service-worker.js");
      pushState.registered = true;
      pushState.status = "Registered";
      pushState.message = hasConfiguredPushKey() ? "Background push ready." : "Background push needs server setup first.";
      await syncPushSubscriptionState(serviceWorkerRegistration);
      return serviceWorkerRegistration;
    } catch (error) {
      console.warn("VNS notifications: service worker registration failed.", error);
      pushState.registered = false;
      pushState.subscribed = false;
      pushState.status = "Failed";
      pushState.message = "Background push registration failed.";
      renderBackgroundPushStatus();
      return null;
    }
  }

  function renderBadge(element, count, hideWhenZero = true) {
    if (!element) return;
    element.textContent = String(count);
    element.hidden = hideWhenZero && count <= 0;
    element.classList.toggle("is-zero", count <= 0);
  }

  function updateBrowserTabTitle(count) {
    const cleanTitle = ORIGINAL_TITLE.replace(/^\(\d+\)\s*/, "") || "VNS Portal";
    document.title = count > 0 ? `(${count}) ${cleanTitle}` : cleanTitle;
  }

  function renderNotifications(summary) {
    latestSummary = summary;
    const role = currentRole();
    const visibleGroups = visibleActiveGroups(summary, role);
    const visibleTotal = visibleTotalForRole(summary, role);

    renderBadge(document.querySelector("[data-vns-notification-total]"), visibleTotal);
    updateBrowserTabTitle(visibleTotal);

    const lastChecked = document.querySelector("[data-vns-notification-last-checked]");
    if (lastChecked) lastChecked.textContent = formatCheckedTime(summary.checkedAt);
    renderBrowserAlertStatus();
    renderBackgroundPushStatus();

    const list = document.querySelector("[data-vns-notification-list]");
    if (list) {
      list.innerHTML = visibleGroups.length ? visibleGroups.map(item => `
        <a class="notification-item" href="${item.href}">
          <span>
            <strong>${item.title} - ${item.count} ${item.id === "payment" ? "ready for payment" : item.id === "returned" ? "need revision" : "waiting"}</strong>
            <small>${item.description}</small>
          </span>
          <em>Open</em>
        </a>
      `).join("") : '<p class="notification-empty">All clear. No pending items.</p>';
    }

    renderPortalBadges(summary.counts);
  }

  function renderPortalBadges(counts) {
    const cardCounts = {
      approval: counts.approvalTotal,
      payment: counts.paymentTotal,
      cash: counts.cashApproval || counts.returned,
      repair: counts.repairApproval,
      payroll: counts.payrollApproval
    };
    Object.entries(cardCounts).forEach(([key, count]) => {
      renderBadge(document.querySelector(`[data-vns-card-badge="${key}"]`), count);
    });
  }

  function notificationBody(groups, increase) {
    const lines = groups
      .filter(item => item.count > 0)
      .slice(0, 3)
      .map(item => `${item.title}: ${item.count} ${item.id === "payment" ? "ready for payment" : item.id === "returned" ? "need revision" : "waiting"}`);
    return lines.length ? lines.join("\n") : `${increase} new item${increase === 1 ? "" : "s"} need attention.`;
  }

  function targetForIncrease(previousSummary, nextSummary, role) {
    const previousCounts = previousSummary ? visibleCountsByLane(previousSummary, role) : { approval: 0, payment: 0, revision: 0 };
    const nextCounts = visibleCountsByLane(nextSummary, role);
    const approvalIncrease = nextCounts.approval - previousCounts.approval;
    const paymentIncrease = nextCounts.payment - previousCounts.payment;
    const revisionIncrease = nextCounts.revision - previousCounts.revision;

    if (paymentIncrease > 0 && paymentIncrease >= approvalIncrease && paymentIncrease >= revisionIncrease) return "payment-queue.html";
    if (approvalIncrease > 0) return "approval-center.html";
    if (revisionIncrease > 0) return "approval-center.html";
    return "portal.html";
  }

  function showBrowserNotification(summary, options) {
    const role = currentRole();
    const visibleGroups = visibleActiveGroups(summary, role);
    const visibleTotal = visibleTotalForRole(summary, role);
    const previousTotal = options.previousSummary ? visibleTotalForRole(options.previousSummary, role) : 0;
    const lastNotifiedCount = readNumber(LAST_NOTIFIED_COUNT_KEY);
    const lastNotificationAt = readNumber(LAST_NOTIFICATION_AT_KEY);
    const now = Date.now();
    const countIncreased = visibleTotal > previousTotal;
    const manualFirstNotice = options.manual && visibleTotal > 0 && lastNotifiedCount < visibleTotal;

    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!options.manual && !options.previousSummary) return;
    if (!countIncreased && !manualFirstNotice) return;
    if (visibleTotal <= lastNotifiedCount) return;
    if (lastNotificationAt && now - lastNotificationAt < NOTIFICATION_COOLDOWN_MS) return;

    const increase = Math.max(1, visibleTotal - Math.max(previousTotal, lastNotifiedCount));
    const notification = new Notification("VNS Portal", {
      body: notificationBody(visibleGroups, increase),
      tag: "vns-portal-notifications",
      renotify: false
    });
    const targetUrl = new URL(targetForIncrease(options.previousSummary, summary, role), window.location.href).href;
    notification.onclick = () => {
      window.focus();
      if (window.location.href !== targetUrl) window.location.href = targetUrl;
      notification.close();
    };

    writeStorageValue(LAST_NOTIFIED_COUNT_KEY, visibleTotal);
    writeStorageValue(LAST_NOTIFICATION_AT_KEY, now);
  }

  async function enableBrowserAlerts() {
    const state = browserAlertState();
    if (!state.supported) {
      renderBrowserAlertStatus(state.message);
      return;
    }
    if (state.permission === "granted" || state.permission === "denied") {
      renderBrowserAlertStatus(state.message);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        renderBrowserAlertStatus("Browser alerts enabled.");
      } else if (permission === "denied") {
        renderBrowserAlertStatus("Browser alerts are blocked. Please enable notifications in browser settings.");
      } else {
        renderBrowserAlertStatus("Browser alerts are not enabled.");
      }
    } catch (error) {
      console.warn("VNS notifications: browser alert permission failed.", error);
      renderBrowserAlertStatus("Browser alerts are not supported on this device.");
    }
  }

  async function subscribeToPushAlerts() {
    if (!pushSupported()) {
      pushState.status = "Not supported";
      pushState.message = "Background push is not supported on this device.";
      renderBackgroundPushStatus();
      return;
    }
    if (!hasConfiguredPushKey()) {
      pushState.message = "Background push needs server setup first.";
      renderBackgroundPushStatus(pushState.message);
      return;
    }

    const registration = serviceWorkerRegistration || await registerServiceWorker();
    if (!registration) return;

    try {
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          pushState.message = permission === "denied"
            ? "Browser alerts are blocked. Please enable notifications in browser settings."
            : "Background alerts were not enabled.";
          renderBackgroundPushStatus();
          renderBrowserAlertStatus();
          return;
        }
        renderBrowserAlertStatus();
      }
      if (Notification.permission !== "granted") {
        pushState.message = "Browser alerts must be enabled before background alerts can subscribe.";
        renderBackgroundPushStatus();
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY)
      });
      const serializedSubscription = subscription.toJSON ? subscription.toJSON() : subscription;
      const response = await postPushApi("/subscribe", {
        subscription: serializedSubscription,
        role: currentRole(),
        userAgent: navigator.userAgent || ""
      });
      writeJsonValue(PUSH_SUBSCRIPTION_KEY, serializedSubscription);
      if (response.endpointHash) writeStorageValue(PUSH_ENDPOINT_HASH_KEY, response.endpointHash);
      pushState.subscribed = true;
      pushState.status = "Registered";
      pushState.message = "Background alerts subscribed.";
      renderBackgroundPushStatus();
    } catch (error) {
      console.warn("VNS notifications: push subscription failed.", error);
      pushState.message = "Background alerts could not subscribe yet.";
      renderBackgroundPushStatus();
    }
  }

  async function unsubscribeFromPushAlerts() {
    const registration = serviceWorkerRegistration || await registerServiceWorker();
    if (!registration) return;

    try {
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || "";
      if (subscription) await subscription.unsubscribe();
      if (endpoint) await postPushApi("/unsubscribe", { endpoint });
      removeStorageValue(PUSH_SUBSCRIPTION_KEY);
      removeStorageValue(PUSH_ENDPOINT_HASH_KEY);
      pushState.subscribed = false;
      pushState.status = "Registered";
      pushState.message = hasConfiguredPushKey() ? "Background alerts unsubscribed." : "Background push needs server setup first.";
      renderBackgroundPushStatus();
    } catch (error) {
      console.warn("VNS notifications: push unsubscribe failed.", error);
      pushState.message = "Background alerts could not unsubscribe.";
      renderBackgroundPushStatus();
    }
  }

  async function sendTestPush() {
    const registration = serviceWorkerRegistration || await registerServiceWorker();
    if (!registration) return;

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription?.endpoint) {
        pushState.subscribed = false;
        pushState.message = "Background alerts are not subscribed.";
        renderBackgroundPushStatus();
        return;
      }
      await postPushApi("/test", {
        endpoint: subscription.endpoint,
        title: "VNS Portal",
        body: "Test background alert from VNS.",
        url: "/portal.html"
      });
      pushState.message = "Test push sent.";
      renderBackgroundPushStatus();
    } catch (error) {
      console.warn("VNS notifications: test push failed.", error);
      pushState.message = error.message || "Test push failed.";
      renderBackgroundPushStatus();
    }
  }

  async function refreshNotifications(options = {}) {
    if (isRefreshing) return latestSummary;
    const previousSummary = latestSummary;
    isRefreshing = true;
    document.querySelector("[data-vns-notification-refresh]")?.setAttribute("disabled", "disabled");
    try {
      const summary = await collectNotificationSummary();
      renderNotifications(summary);
      showBrowserNotification(summary, {
        manual: options.manual === true,
        previousSummary
      });
      window.dispatchEvent(new CustomEvent("vns-notifications-refresh", { detail: summary }));
      return summary;
    } catch (error) {
      console.warn("VNS notifications: refresh failed.", error);
      return latestSummary;
    } finally {
      isRefreshing = false;
      document.querySelector("[data-vns-notification-refresh]")?.removeAttribute("disabled");
    }
  }

  function bindDropdown() {
    const center = document.querySelector("[data-vns-notification-bell]");
    const button = center?.querySelector(".notification-bell");
    const dropdown = document.getElementById("vns-notification-dropdown");
    if (!center || !button || !dropdown) return;

    button.addEventListener("click", event => {
      event.stopPropagation();
      const open = dropdown.hidden;
      dropdown.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });

    dropdown.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("click", () => {
      dropdown.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      dropdown.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function initNotifications() {
    bindDropdown();
    renderBrowserAlertStatus();
    renderBackgroundPushStatus();
    document.querySelector("[data-vns-notification-refresh]")?.addEventListener("click", () => refreshNotifications({ manual: true }));
    document.querySelector("[data-vns-enable-browser-alerts]")?.addEventListener("click", enableBrowserAlerts);
    document.querySelector("[data-vns-subscribe-push]")?.addEventListener("click", subscribeToPushAlerts);
    document.querySelector("[data-vns-unsubscribe-push]")?.addEventListener("click", unsubscribeFromPushAlerts);
    document.querySelector("[data-vns-test-push]")?.addEventListener("click", sendTestPush);
    window.addEventListener("vns-role-change", () => {
      if (latestSummary) renderNotifications(latestSummary);
    });
    registerServiceWorker();
    refreshNotifications();
    window.setInterval(refreshNotifications, REFRESH_INTERVAL_MS);
  }

  window.VNSNotificationCenter = {
    refresh: refreshNotifications,
    getLatestSummary: () => latestSummary,
    getPushState: () => ({ ...pushState })
  };

  document.addEventListener("DOMContentLoaded", initNotifications);
})();
