(function () {
  "use strict";

  const ROLE_KEY = "vnsCurrentUserRole";
  const DEFAULT_ROLE = "Admin";
  const ROLE_ALIASES = {
    approver: "Mother",
    mother: "Mother",
    payment: "Sister",
    sister: "Sister",
    admin: "Admin",
    encoder: "Encoder",
    viewer: "Viewer"
  };
  const ROLE_PERMISSIONS = {
    Admin: ["*"],
    Mother: ["payroll:approve", "repair:approve", "cash:approve", "approval:center"],
    Sister: ["payroll:pay", "repair:pay", "cash:pay", "payment:queue"],
    Encoder: ["payroll:entry", "repair:entry", "cash:entry"],
    Viewer: []
  };

  function normalizeRole(role) {
    const key = String(role || "").trim().toLowerCase();
    return ROLE_ALIASES[key] || DEFAULT_ROLE;
  }

  function getRole() {
    try {
      return normalizeRole(localStorage.getItem(ROLE_KEY) || DEFAULT_ROLE);
    } catch (error) {
      return DEFAULT_ROLE;
    }
  }

  function setRole(role) {
    const normalized = normalizeRole(role);
    try {
      localStorage.setItem(ROLE_KEY, normalized);
    } catch (error) {
      console.warn("Unable to save VNS role preview.", error);
    }
    applyVisibility(document);
    window.dispatchEvent(new CustomEvent("vns-role-change", { detail: { role: normalized } }));
    return normalized;
  }

  function splitList(value) {
    return String(value || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  function hasRole(role) {
    const current = getRole();
    const requested = normalizeRole(role);
    return current === "Admin" || current === requested;
  }

  function can(permission) {
    const role = getRole();
    if (role === "Admin") return true;
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
  }

  function elementAllowed(element) {
    const roles = splitList(element.dataset.vnsRole);
    const permissions = splitList(element.dataset.vnsPermission);
    const roleAllowed = !roles.length || roles.some(hasRole);
    const permissionAllowed = !permissions.length || permissions.some(can);
    return roleAllowed && permissionAllowed;
  }

  function setVisible(element, visible) {
    if (visible) {
      if (element.dataset.vnsAuthHidden === "true") {
        element.hidden = false;
        delete element.dataset.vnsAuthHidden;
      }
      return;
    }
    element.hidden = true;
    element.dataset.vnsAuthHidden = "true";
  }

  function fixTabGroups(root) {
    root.querySelectorAll("[role='tablist']").forEach(tablist => {
      const buttons = Array.from(tablist.querySelectorAll("button")).filter(button => !button.hidden);
      if (!buttons.length) return;
      const active = buttons.find(button => button.classList.contains("active") || button.getAttribute("aria-selected") === "true");
      if (!active) buttons[0].click();
    });
  }

  function applyVisibility(root = document) {
    const scopedRoot = root.nodeType === 1 && root.matches("[data-vns-permission], [data-vns-role]") ? [root] : [];
    const targets = scopedRoot.concat(Array.from(root.querySelectorAll("[data-vns-permission], [data-vns-role]")));
    targets.forEach(element => {
      if (element === document.body || element === document.documentElement) return;
      setVisible(element, elementAllowed(element));
    });
    fixTabGroups(root);
  }

  function bindRoleSelector() {
    const selector = document.getElementById("vns-dev-role-select");
    if (!selector) return;
    selector.value = getRole();
    selector.addEventListener("change", () => setRole(selector.value));
  }

  window.VNSAuth = {
    getRole,
    setRole,
    hasRole,
    can,
    normalizeRole,
    applyVisibility
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindRoleSelector();
    applyVisibility(document);
  });
})();
