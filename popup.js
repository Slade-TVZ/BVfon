const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const logsListEl = document.getElementById("logsList");
const levelFilterEl = document.getElementById("levelFilter");
const debugModeToggleEl = document.getElementById("debugModeToggle");

document.getElementById("extractBtn").addEventListener("click", () => runAction("extract"));
document.getElementById("fillBtn").addEventListener("click", () => runAction("fill"));
document.getElementById("previewBtn").addEventListener("click", () => runAction("preview"));
document.getElementById("clearDataBtn").addEventListener("click", () => runAction("clearData"));
document.getElementById("refreshLogsBtn").addEventListener("click", refreshLogs);
document.getElementById("clearLogsBtn").addEventListener("click", clearLogsView);
document.getElementById("exportLogsBtn").addEventListener("click", exportLogsFile);
levelFilterEl.addEventListener("change", refreshLogs);
debugModeToggleEl.addEventListener("change", updateDebugMode);

initializePopup();

async function initializePopup() {
  try {
    const debugMode = await requestAction("getDebugMode");
    debugModeToggleEl.checked = Boolean(debugMode.enabled);

    await InvoiceLogger.logEvent("info", "popup", "popup-opened", "");
    await refreshLogs();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function runAction(action) {
  setStatus("Working...");

  try {
    await InvoiceLogger.logEvent("info", "popup", "action-clicked", { action });
    const response = await requestAction(action);
    setStatus(response.message || "Done.");

    if (action === "preview") {
      renderPreview(response.rows || [], response.meta || null);
    } else {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }

    await refreshLogs();
  } catch (error) {
    await InvoiceLogger.logEvent("error", "popup", "action-failed", {
      action,
      error: error instanceof Error ? error.message : String(error)
    });
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function refreshLogs() {
  const response = await requestAction("getLogs");
  const selectedLevel = levelFilterEl.value;
  const logs = (response.logs || []).filter((log) => {
    return selectedLevel === "all" ? true : log.level === selectedLevel;
  });

  renderLogs(logs);
}

async function clearLogsView() {
  await requestAction("clearLogs");
  setStatus("Logs cleared.");
  await refreshLogs();
}

async function exportLogsFile() {
  const response = await requestAction("exportLogs");
  const blob = new Blob([response.content || "[]"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  link.href = url;
  link.download = `invoice-helper-logs-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);

  setStatus("Logs exported as JSON.");
}

async function updateDebugMode() {
  await requestAction("setDebugMode", {
    enabled: debugModeToggleEl.checked
  });

  setStatus(debugModeToggleEl.checked ? "Debug mode enabled." : "Debug mode disabled.");
  await refreshLogs();
}

function renderPreview(rows, meta) {
  previewEl.hidden = false;
  previewEl.textContent = JSON.stringify(
    {
      meta,
      count: rows.length,
      rows
    },
    null,
    2
  );
}

function renderLogs(logs) {
  if (!logs.length) {
    logsListEl.innerHTML = '<div class="empty">No logs for selected filter.</div>';
    return;
  }

  logsListEl.innerHTML = logs
    .map((log) => {
      return `
        <div class="log-item">
          <div class="log-meta">
            <span class="badge ${escapeHtml(log.level)}">${escapeHtml(log.level)}</span>
            <span>${escapeHtml(log.source || "")}</span>
            <span>${escapeHtml(log.timestamp || "")}</span>
          </div>
          <div class="log-event">${escapeHtml(log.event || "")}</div>
          <div class="log-details">${escapeHtml(formatDetails(log.details))}</div>
        </div>
      `;
    })
    .join("");
}

function formatDetails(details) {
  if (typeof details === "string") {
    return details;
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch (_error) {
    return String(details);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c62828" : "#5f7389";
}

async function requestAction(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({
    type: "POPUP_ACTION",
    action,
    ...extra
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown error");
  }

  return response;
}
