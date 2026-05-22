(function () {
  "use strict";

  const TOAST_ROOT_ID = "app-toast-root";
  const TYPE_LABELS = {
    success: "Success",
    error: "Error",
    warning: "Warning",
    info: "Info"
  };

  function ensureToastRoot() {
    let root = document.getElementById(TOAST_ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    root.className = "app-toast-root";
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-relevant", "additions");
    document.body.appendChild(root);
    return root;
  }

  function clean(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeType(type) {
    return ["success", "error", "warning", "info"].includes(type) ? type : "info";
  }

  function looksInternalId(value) {
    const text = clean(value);
    if (!text) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
    if (/^(diesel|budget|bali|cash|repair|payroll|line|manual|equipment)_\d{10,}/i.test(text)) return true;
    return false;
  }

  function removeToast(toast) {
    if (!toast || toast.dataset.closing === "true") return;
    toast.dataset.closing = "true";
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  }

  function showAppToast(options = {}) {
    const type = normalizeType(options.type || "info");
    const title = clean(options.title, TYPE_LABELS[type]);
    const message = clean(options.message);
    const refLabel = clean(options.refLabel);
    const refValue = clean(options.refValue);
    const extra = clean(options.extra);
    const duration = Number(options.duration) > 0 ? Number(options.duration) : 4500;
    const root = ensureToastRoot();
    const toast = document.createElement("article");
    toast.className = `app-toast app-toast-${type}`;
    toast.innerHTML = `
      <div class="app-toast-accent" aria-hidden="true"></div>
      <div class="app-toast-content">
        <div class="app-toast-title-row">
          <strong>${escapeHtml(title)}</strong>
          <button class="app-toast-close" type="button" aria-label="Close notification">&times;</button>
        </div>
        ${message ? `<p>${escapeHtml(message)}</p>` : ""}
        ${refLabel || refValue ? `<div class="app-toast-ref"><span>${escapeHtml(refLabel || "Ref ID")}</span><b>${escapeHtml(refValue || "Pending Ref")}</b></div>` : ""}
        ${extra ? `<small>${escapeHtml(extra)}</small>` : ""}
      </div>
    `;
    root.appendChild(toast);
    toast.querySelector(".app-toast-close")?.addEventListener("click", () => removeToast(toast));
    window.setTimeout(() => removeToast(toast), duration);
    return toast;
  }

  function friendlyRef(record = {}, keys = []) {
    for (const key of keys) {
      const value = clean(record?.[key]);
      if (value && !looksInternalId(value)) return value;
    }
    return "Pending Ref";
  }

  window.showAppToast = showAppToast;
  window.getAppFriendlyRef = friendlyRef;
})();
