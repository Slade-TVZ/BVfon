(function () {
  const LOGS_KEY = "extensionLogs";
  const DEBUG_MODE_KEY = "debugMode";
  const DEFAULT_MAX_AGE_DAYS = 5;
  const DEFAULT_MAX_LOGS = 2000;

  function toSerializable(details) {
    if (details instanceof Error) {
      return {
        name: details.name,
        message: details.message,
        stack: details.stack || ""
      };
    }

    if (details == null) {
      return "";
    }

    if (typeof details === "string") {
      return details;
    }

    try {
      return JSON.parse(JSON.stringify(details));
    } catch (_error) {
      return String(details);
    }
  }

  function createLogId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function getStorageValue(key, fallbackValue) {
    try {
      const stored = await chrome.storage.local.get(key);
      return stored[key] ?? fallbackValue;
    } catch (_error) {
      return fallbackValue;
    }
  }

  async function setStorageValue(objectToStore) {
    try {
      await chrome.storage.local.set(objectToStore);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function getDebugMode() {
    return Boolean(await getStorageValue(DEBUG_MODE_KEY, false));
  }

  async function setDebugMode(enabled) {
    await setStorageValue({ [DEBUG_MODE_KEY]: Boolean(enabled) });
    return Boolean(enabled);
  }

  async function pruneOldLogs(maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    const logs = await getStorageValue(LOGS_KEY, []);

    const prunedLogs = logs
      .filter((log) => Number(log?.epochMs || 0) >= cutoff)
      .sort((left, right) => Number(left.epochMs || 0) - Number(right.epochMs || 0))
      .slice(-DEFAULT_MAX_LOGS);

    await setStorageValue({ [LOGS_KEY]: prunedLogs });
    return prunedLogs;
  }

  async function logEvent(level, source, event, details) {
    const normalizedLevel = String(level || "info").toLowerCase();
    const debugMode = await getDebugMode();

    if (normalizedLevel === "info" && !debugMode) {
      return { skipped: true, reason: "debug-mode-disabled" };
    }

    const now = new Date();
    const logRecord = {
      id: createLogId(),
      timestamp: now.toISOString(),
      epochMs: now.getTime(),
      level: normalizedLevel,
      source: source || "unknown",
      event: event || "unknown-event",
      details: toSerializable(details)
    };

    const cleanedLogs = await pruneOldLogs();
    const nextLogs = cleanedLogs.concat(logRecord).slice(-DEFAULT_MAX_LOGS);
    await setStorageValue({ [LOGS_KEY]: nextLogs });

    return logRecord;
  }

  async function getLogs(limit = 100) {
    const logs = await getStorageValue(LOGS_KEY, []);
    return logs
      .slice()
      .sort((left, right) => Number(right.epochMs || 0) - Number(left.epochMs || 0))
      .slice(0, Math.max(0, Number(limit) || 100));
  }

  async function clearLogs() {
    await setStorageValue({ [LOGS_KEY]: [] });
    return true;
  }

  async function exportLogs() {
    const logs = await getStorageValue(LOGS_KEY, []);
    return JSON.stringify(logs, null, 2);
  }

  function showStatusOverlay(message, level = "info", durationMs = 3500, options = {}) {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    const overlayId = "__invoice_helper_status_overlay";
    const overlayStyleId = "__invoice_helper_status_overlay_style";
    let overlay = document.getElementById(overlayId);

    if (!document.getElementById(overlayStyleId)) {
      const style = document.createElement("style");
      style.id = overlayStyleId;
      style.textContent = `
        @keyframes invoice-helper-overlay-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.18; }
        }
      `;
      document.head.appendChild(style);
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = overlayId;
      overlay.style.position = "fixed";
      overlay.style.top = "16px";
      overlay.style.right = "16px";
      overlay.style.zIndex = "2147483647";
      overlay.style.maxWidth = "360px";
      overlay.style.padding = "12px 14px";
      overlay.style.borderRadius = "12px";
      overlay.style.boxShadow = "0 14px 32px rgba(0, 0, 0, 0.24)";
      overlay.style.fontFamily = "Segoe UI, Arial, sans-serif";
      overlay.style.fontSize = "13px";
      overlay.style.lineHeight = "1.4";
      overlay.style.color = "#ffffff";
      overlay.style.textAlign = "center";
      document.body.appendChild(overlay);
    }

    const colors = {
      info: "#1f5eff",
      warn: "#d97706",
      error: "#c62828",
      success: "#0f8a5f"
    };

    overlay.textContent = message;
    overlay.style.background = options.customBackground || colors[level] || colors.info;
    overlay.style.color = options.customTextColor || "#ffffff";
    overlay.style.top = options.position === "center" ? "50%" : "16px";
    overlay.style.right = options.position === "center" ? "auto" : "16px";
    overlay.style.left = options.position === "center" ? "50%" : "auto";
    overlay.style.transform = options.position === "center" ? "translate(-50%, -50%)" : "none";
    overlay.style.maxWidth = options.position === "center" ? "520px" : "360px";
    overlay.style.fontSize = options.position === "center" ? "16px" : "13px";
    overlay.style.padding = options.position === "center" ? "18px 22px" : "12px 14px";
    overlay.style.animation = options.blink ? "invoice-helper-overlay-blink 0.7s step-end infinite" : "none";

    clearTimeout(showStatusOverlay.timeoutId);
    showStatusOverlay.timeoutId = setTimeout(() => {
      overlay.style.animation = "none";
      overlay.remove();
    }, Math.max(250, Number(durationMs) || 3500));
  }

  function showConfirmDialog(message, options = {}) {
    if (typeof document === "undefined" || !document.body) {
      return Promise.resolve(window.confirm(String(message || "")));
    }

    const backdropId = "__invoice_helper_confirm_backdrop";
    const dialogStyleId = "__invoice_helper_confirm_style";
    const existingBackdrop = document.getElementById(backdropId);
    if (existingBackdrop) {
      existingBackdrop.remove();
    }

    if (!document.getElementById(dialogStyleId)) {
      const style = document.createElement("style");
      style.id = dialogStyleId;
      style.textContent = `
        @keyframes invoice-helper-confirm-pop {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    const tone = String(options.tone || "warn").toLowerCase();
    const palette = {
      warn: {
        badgeBg: "#fff4ce",
        badgeText: "#9a6700",
        border: "#f0b429",
        confirmBg: "#c97a00"
      },
      error: {
        badgeBg: "#ffe2e0",
        badgeText: "#b42318",
        border: "#f97066",
        confirmBg: "#c62828"
      },
      info: {
        badgeBg: "#dbeafe",
        badgeText: "#1d4ed8",
        border: "#60a5fa",
        confirmBg: "#1f5eff"
      }
    };
    const colors = palette[tone] || palette.warn;

    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.id = backdropId;
      backdrop.style.position = "fixed";
      backdrop.style.inset = "0";
      backdrop.style.zIndex = "2147483647";
      backdrop.style.display = "flex";
      backdrop.style.alignItems = "center";
      backdrop.style.justifyContent = "center";
      backdrop.style.padding = "20px";
      backdrop.style.background = "rgba(15, 23, 42, 0.45)";
      backdrop.style.backdropFilter = "blur(2px)";

      const dialog = document.createElement("div");
      dialog.style.width = "min(520px, calc(100vw - 32px))";
      dialog.style.background = "#ffffff";
      dialog.style.border = `2px solid ${colors.border}`;
      dialog.style.borderRadius = "18px";
      dialog.style.boxShadow = "0 28px 60px rgba(15, 23, 42, 0.28)";
      dialog.style.padding = "20px";
      dialog.style.fontFamily = "Segoe UI, Arial, sans-serif";
      dialog.style.color = "#0f172a";
      dialog.style.animation = "invoice-helper-confirm-pop 0.18s ease-out";

      const badge = document.createElement("div");
      badge.textContent = options.badgeText || "Invoice Helper potvrda";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.padding = "6px 10px";
      badge.style.borderRadius = "999px";
      badge.style.background = colors.badgeBg;
      badge.style.color = colors.badgeText;
      badge.style.fontSize = "12px";
      badge.style.fontWeight = "700";
      badge.style.letterSpacing = "0.02em";
      badge.style.marginBottom = "12px";

      const title = document.createElement("div");
      title.textContent = options.title || "Potvrdi nastavak";
      title.style.fontSize = "22px";
      title.style.fontWeight = "700";
      title.style.lineHeight = "1.2";
      title.style.marginBottom = "10px";

      const body = document.createElement("div");
      body.textContent = String(message || "");
      body.style.fontSize = "18px";
      body.style.lineHeight = "1.5";
      body.style.marginBottom = "12px";
      body.style.whiteSpace = "pre-wrap";

      const note = document.createElement("div");
      note.textContent =
        options.note || "Ovu poruku prikazuje ekstenzija Invoice Helper, ne FINA servis.";
      note.style.fontSize = "13px";
      note.style.lineHeight = "1.45";
      note.style.color = "#475569";
      note.style.marginBottom = "18px";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "12px";
      actions.style.flexWrap = "wrap";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = options.cancelLabel || "Odustani";
      cancelButton.style.border = "1px solid #cbd5e1";
      cancelButton.style.background = "#f8fafc";
      cancelButton.style.color = "#0f172a";
      cancelButton.style.borderRadius = "12px";
      cancelButton.style.padding = "10px 18px";
      cancelButton.style.fontSize = "15px";
      cancelButton.style.fontWeight = "700";
      cancelButton.style.cursor = "pointer";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.textContent = options.confirmLabel || "Nastavi";
      confirmButton.style.border = "none";
      confirmButton.style.background = colors.confirmBg;
      confirmButton.style.color = "#ffffff";
      confirmButton.style.borderRadius = "12px";
      confirmButton.style.padding = "10px 18px";
      confirmButton.style.fontSize = "15px";
      confirmButton.style.fontWeight = "700";
      confirmButton.style.cursor = "pointer";

      let settled = false;
      const cleanup = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        backdrop.remove();
      };

      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(Boolean(value));
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
      };

      dialog.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      cancelButton.addEventListener("click", () => finish(false));
      confirmButton.addEventListener("click", () => finish(true));

      actions.append(cancelButton, confirmButton);
      dialog.append(badge, title, body, note, actions);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      document.addEventListener("keydown", onKeyDown, true);
      requestAnimationFrame(() => confirmButton.focus());
    });
  }

  globalThis.InvoiceLogger = {
    LOGS_KEY,
    DEBUG_MODE_KEY,
    logEvent,
    getLogs,
    clearLogs,
    pruneOldLogs,
    exportLogs,
    getDebugMode,
    setDebugMode,
    showStatusOverlay,
    showConfirmDialog
  };
})();
