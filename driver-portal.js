(function () {
  "use strict";

  const WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";
  const SESSION_KEY = "vnsDriverPortalSession";

  const $ = (id) => document.getElementById(id);
  const loginView = $("login-view");
  const dashboardView = $("dashboard-view");
  const statusBox = $("driver-portal-status");
  const loginButton = $("driver-login-button");

  function normalizePlate(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function showStatus(message, kind) {
    statusBox.hidden = false;
    statusBox.textContent = message;
    statusBox.className = `driver-mobile-status ${kind || "info"}`;
  }

  function hideStatus() {
    statusBox.hidden = true;
  }

  function clearDashboard() {
    $("dashboard-plate").textContent = "";
    $("dashboard-driver").textContent = "";
    $("dashboard-helper").textContent = "";
    $("dashboard-group").textContent = "";
  }

  function setLoading(isLoading) {
    loginButton.disabled = isLoading;
    loginButton.textContent = isLoading ? "Logging in..." : "Login";
  }

  function saveSession(driver) {
    const session = {
      username: driver.username || "",
      plate_number: normalizePlate(driver.plate_number || driver.plateNumber),
      driver_name: driver.driver_name || driver.driverName || "",
      helper_name: driver.helper_name || driver.helperName || "",
      group_name: driver.group_name || driver.groupName || "",
      mobile_number: driver.mobile_number || driver.mobileNumber || "",
      logged_at: new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function readSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.plate_number) return parsed;
      } catch (error) {
        console.warn("Unable to read driver portal session.", error);
      }
    }
    return null;
  }

  function demoSessionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") !== "1") return null;
    return saveSession({
      username: "TEST123",
      plate_number: "TEST123",
      driver_name: "Test Driver",
      helper_name: "Test Helper",
      group_name: "2GO"
    });
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function renderDashboard(session) {
    document.body.classList.add("driver-portal-authenticated");
    $("dashboard-plate").textContent = session.plate_number || "-";
    $("dashboard-driver").textContent = session.driver_name || "-";
    $("dashboard-helper").textContent = session.helper_name || "-";
    $("dashboard-group").textContent = session.group_name || "-";
    loginView.hidden = true;
    dashboardView.hidden = false;
    hideStatus();
  }

  function renderLogin() {
    document.body.classList.remove("driver-portal-authenticated");
    loginView.hidden = false;
    dashboardView.hidden = true;
    clearDashboard();
    $("driver-password").value = "";
  }

  async function login(event) {
    event.preventDefault();
    const username = String($("driver-username").value || "").trim();
    const password = String($("driver-password").value || "").trim();
    if (!username || !password) {
      showStatus("Please enter username and password.", "error");
      return;
    }

    setLoading(true);
    showStatus("Checking login...", "info");
    try {
      const response = await fetch(`${WORKER_API_BASE}/api/driver-portal/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Invalid username or password");
      const session = saveSession(data.driver || {});
      renderDashboard(session);
      $("driver-login-form").reset();
    } catch (error) {
      showStatus(error.message || "Invalid username or password", "error");
    } finally {
      setLoading(false);
    }
  }

  function actionUrl(action, session) {
    const plate = encodeURIComponent(session.plate_number || "");
    if (action === "trip") return `driver-trip.html?plate=${plate}`;
    if (action === "requests") return `driver-requests.html?plate=${plate}`;
    return `driver-cash.html?plate=${plate}&type=${encodeURIComponent(action)}`;
  }

  async function enableDriverNotifications() {
    if (!("Notification" in window)) {
      showStatus("Notifications are not supported on this browser. Please check My Requests for updates.", "info");
      return;
    }
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      showStatus("Notifications are enabled on this device. You can also check My Requests for live approval and payment status.", "success");
      return;
    }
    showStatus("Notifications are blocked in this browser. You can enable them in browser settings or check My Requests anytime.", "error");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const existing = demoSessionFromUrl() || readSession();
    if (existing) renderDashboard(existing);
    else renderLogin();

    $("driver-login-form").addEventListener("submit", login);
    $("driver-logout-button").addEventListener("click", () => {
      clearSession();
      renderLogin();
      showStatus("Logged out.", "info");
    });

    document.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.action === "notifications") {
          enableDriverNotifications();
          return;
        }
        const session = readSession();
        if (!session) {
          renderLogin();
          showStatus("Please login through the VNS Driver Portal.", "error");
          return;
        }
        window.location.href = actionUrl(button.dataset.action, session);
      });
    });
  });
})();
