importScripts("logger.js");

const CLEANUP_ALARM_NAME = "log-cleanup";
const CLEANUP_PERIOD_MINUTES = 12 * 60;
const STORAGE_KEYS = {
  extractedRows: "extractedRows",
  extractionMeta: "extractionMeta",
  pendingExtraction: "pendingExtraction",
  pendingDestinationInvoiceNumber: "pendingDestinationInvoiceNumber"
};
const TELIO_REPORT_PATH_FRAGMENT = "/PrisonLevelInvoiceReport/";

initializeServiceWorker();

chrome.runtime.onInstalled.addListener(() => {
  initializeServiceWorker();
});

chrome.runtime.onStartup.addListener(() => {
  initializeServiceWorker();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url?.includes(TELIO_REPORT_PATH_FRAGMENT)) {
    return;
  }

  resumePendingSourceExtraction(tabId).catch(async (error) => {
    await InvoiceLogger.logEvent("error", "service-worker", "resume-pending-extraction-failed", {
      tabId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CLEANUP_ALARM_NAME) {
    return;
  }

  await InvoiceLogger.pruneOldLogs(5);
  await InvoiceLogger.logEvent("info", "service-worker", "alarm-prune-complete", {
    alarmName: alarm.name
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "POPUP_ACTION") {
    return false;
  }

  handlePopupAction(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch(async (error) => {
      await InvoiceLogger.logEvent("error", "service-worker", "popup-action-failed", {
        action: message?.action || "",
        error: error instanceof Error ? error.message : String(error)
      });

      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function initializeServiceWorker() {
  await InvoiceLogger.pruneOldLogs(5);

  await chrome.alarms.create(CLEANUP_ALARM_NAME, {
    periodInMinutes: CLEANUP_PERIOD_MINUTES
  });

  await InvoiceLogger.logEvent("info", "service-worker", "startup-complete", {
    cleanupEveryMinutes: CLEANUP_PERIOD_MINUTES
  });
}

async function resumePendingSourceExtraction(tabId) {
  const storage = await chrome.storage.local.get([STORAGE_KEYS.pendingExtraction]);
  if (!storage[STORAGE_KEYS.pendingExtraction]) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["logger.js", "source-content.js"]
  });

  await InvoiceLogger.logEvent("info", "service-worker", "pending-extraction-scripts-injected", {
    tabId
  });

  const response = await chrome.tabs.sendMessage(tabId, { type: "AUTO_EXTRACT_IF_PENDING" });
  await InvoiceLogger.logEvent("info", "service-worker", "pending-extraction-resume-sent", {
    tabId,
    response
  });
}

async function handlePopupAction(message) {
  const action = message?.action || "";
  const origin = message?.origin || "";
  await InvoiceLogger.logEvent("info", "service-worker", "popup-action-received", { action });

  switch (action) {
    case "syncFloatingPanel":
      return syncFloatingPanelOnActiveTab();
    case "extract":
      return sendActionToActiveTab("EXTRACT_DATA", ["logger.js", "source-content.js"], {
        skipFloatingRefresh: origin === "floating-panel"
      });
    case "fill":
      return sendActionToActiveTab("FILL_DESTINATION_PAGE", ["logger.js", "destination-content.js"], {
        skipFloatingRefresh: origin === "floating-panel"
      });
    case "preview":
      return previewStoredData();
    case "getLogs":
      return { logs: await InvoiceLogger.getLogs(100), message: "Loaded logs." };
    case "clearLogs":
      await InvoiceLogger.clearLogs();
      return { message: "Logs cleared." };
    case "exportLogs":
      return { content: await InvoiceLogger.exportLogs(), message: "Logs exported." };
    case "setDebugMode":
      await InvoiceLogger.setDebugMode(Boolean(message.enabled));
      await InvoiceLogger.logEvent("warn", "service-worker", "debug-mode-changed", {
        enabled: Boolean(message.enabled)
      });
      return { enabled: Boolean(message.enabled), message: "Debug mode updated." };
    case "getDebugMode":
      return { enabled: await InvoiceLogger.getDebugMode(), message: "Debug mode loaded." };
    case "clearData":
      await chrome.storage.local.remove([
        STORAGE_KEYS.extractedRows,
        STORAGE_KEYS.extractionMeta,
        STORAGE_KEYS.pendingExtraction,
        STORAGE_KEYS.pendingDestinationInvoiceNumber
      ]);
      await InvoiceLogger.logEvent("warn", "service-worker", "workflow-data-cleared", "");
      return { message: "Stored workflow data cleared." };
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

async function sendActionToActiveTab(type, filesToInject, options = {}) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  if (!options.skipFloatingRefresh) {
    await refreshFloatingPanelInTab(tab.id).catch(() => {});
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: filesToInject
  });

  await InvoiceLogger.logEvent("info", "service-worker", "scripts-injected", {
    type,
    filesToInject
  });

  const response = await chrome.tabs.sendMessage(tab.id, { type });
  return response || { message: "Action sent." };
}

async function syncFloatingPanelOnActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return { message: "No active tab found for floating panel sync." };
  }

  await refreshFloatingPanelInTab(tab.id);
  await InvoiceLogger.logEvent("info", "service-worker", "floating-panel-synced", {
    tabId: tab.id
  });

  return { message: "Floating panel synced." };
}

async function refreshFloatingPanelInTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      document.getElementById("__invoice_helper_floating_panel")?.remove();
      document.getElementById("__invoice_helper_floating_launcher")?.remove();
      try {
        delete globalThis.__invoiceHelperFloatingPanelInitialized;
      } catch (_error) {
        globalThis.__invoiceHelperFloatingPanelInitialized = undefined;
      }
    }
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["floating-panel.js"]
  });
}

function isInjectableUrl(url) {
  return /^https?:/i.test(String(url || ""));
}

async function previewStoredData() {
  const storage = await chrome.storage.local.get([
    STORAGE_KEYS.extractedRows,
    STORAGE_KEYS.extractionMeta
  ]);

  const rows = storage[STORAGE_KEYS.extractedRows] || [];
  const meta = storage[STORAGE_KEYS.extractionMeta] || null;

  await InvoiceLogger.logEvent("info", "service-worker", "preview-requested", {
    rowCount: rows.length
  });

  return {
    rows,
    meta,
    message: rows.length ? `Loaded ${rows.length} stored rows.` : "No stored rows found."
  };
}
