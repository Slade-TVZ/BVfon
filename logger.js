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
    let overlay = document.getElementById(overlayId);

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
    overlay.style.background = colors[level] || colors.info;
    overlay.style.top = options.position === "center" ? "50%" : "16px";
    overlay.style.right = options.position === "center" ? "auto" : "16px";
    overlay.style.left = options.position === "center" ? "50%" : "auto";
    overlay.style.transform = options.position === "center" ? "translate(-50%, -50%)" : "none";
    overlay.style.maxWidth = options.position === "center" ? "520px" : "360px";
    overlay.style.fontSize = options.position === "center" ? "16px" : "13px";
    overlay.style.padding = options.position === "center" ? "18px 22px" : "12px 14px";

    clearTimeout(showStatusOverlay.timeoutId);
    showStatusOverlay.timeoutId = setTimeout(() => {
      overlay.remove();
    }, Math.max(250, Number(durationMs) || 3500));
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
    showStatusOverlay
  };
})();
