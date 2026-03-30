const statusEl = document.getElementById("status");
const advancedSectionEl = document.getElementById("advancedSection");
const toggleAdvancedBtnEl = document.getElementById("toggleAdvancedBtn");
const previewEl = document.getElementById("preview");
const logsListEl = document.getElementById("logsList");
const debugModeToggleEl = document.getElementById("debugModeToggle");
const sourceOrganizationInputEl = document.getElementById("sourceOrganizationInput");
const SOURCE_ORGANIZATION_KEY = "sourceOrganizationName";

document.getElementById("extractBtn").addEventListener("click", () => runAction("extract"));
document.getElementById("fillBtn").addEventListener("click", () => runAction("fill"));
document.getElementById("previewBtn").addEventListener("click", previewStoredData);
document.getElementById("clearDataBtn").addEventListener("click", clearStoredData);
document.getElementById("refreshLogsBtn").addEventListener("click", refreshLogs);
document.getElementById("clearLogsBtn").addEventListener("click", clearLogsView);
document.getElementById("exportLogsBtn").addEventListener("click", exportLogsFile);
debugModeToggleEl.addEventListener("change", updateDebugMode);
toggleAdvancedBtnEl.addEventListener("click", toggleAdvancedSection);

initializePopup();

async function initializePopup() {
  try {
    const stored = await chrome.storage.local.get([SOURCE_ORGANIZATION_KEY]);
    sourceOrganizationInputEl.value = stored[SOURCE_ORGANIZATION_KEY] || "";

    const debugMode = await requestAction("getDebugMode");
    debugModeToggleEl.checked = Boolean(debugMode.enabled);

    previewEl.textContent = "";
    logsListEl.textContent = "";
  } catch (error) {
    handlePopupError(error);
  }
}

function toggleAdvancedSection() {
  const isOpen = advancedSectionEl.classList.toggle("open");
  toggleAdvancedBtnEl.textContent = isOpen ? "Sakrij" : "Opcije";
}

async function runAction(action) {
  setStatus("Radim...");

  try {
    await persistSourceOrganization();
    const response = await requestAction(action);
    setStatus(response.message || "Gotovo.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function previewStoredData() {
  setStatus("Ucitam preview...");

  try {
    await persistSourceOrganization();
    const response = await requestAction("preview");
    previewEl.textContent = JSON.stringify(
      {
        meta: response.meta || null,
        count: (response.rows || []).length,
        rows: response.rows || []
      },
      null,
      2
    );
    setStatus(response.message || "Preview ucitan.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function clearStoredData() {
  setStatus("Brisem spremljene podatke...");

  try {
    const response = await requestAction("clearData");
    previewEl.textContent = "";
    setStatus(response.message || "Podaci obrisani.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function refreshLogs() {
  setStatus("Ucitam logove...");

  try {
    const response = await requestAction("getLogs");
    logsListEl.textContent = (response.logs || [])
      .map((log) => {
        return [
          `[${String(log.level || "").toUpperCase()}] ${log.timestamp || ""}`,
          `${log.source || ""} :: ${log.event || ""}`,
          formatDetails(log.details || ""),
          ""
        ].join("\n");
      })
      .join("\n");
    setStatus(response.message || "Logovi ucitani.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function clearLogsView() {
  setStatus("Brisem logove...");

  try {
    const response = await requestAction("clearLogs");
    logsListEl.textContent = "";
    setStatus(response.message || "Logovi obrisani.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function exportLogsFile() {
  setStatus("Pripremam export...");

  try {
    const response = await requestAction("exportLogs");
    const blob = new Blob([response.content || "[]"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    link.href = url;
    link.download = `invoice-helper-logs-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setStatus(response.message || "Logovi exportirani.");
  } catch (error) {
    handlePopupError(error);
  }
}

async function updateDebugMode() {
  try {
    const response = await requestAction("setDebugMode", {
      enabled: debugModeToggleEl.checked
    });
    setStatus(response.message || "Debug mode azuriran.");
  } catch (error) {
    handlePopupError(error);
  }
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

async function persistSourceOrganization() {
  await chrome.storage.local.set({
    [SOURCE_ORGANIZATION_KEY]: sourceOrganizationInputEl.value.trim()
  });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#c62828" : "#5f7389";
}

async function requestAction(action, extra = {}) {
  let response;

  try {
    response = await chrome.runtime.sendMessage({
      type: "POPUP_ACTION",
      action,
      ...extra
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Unknown error");
  }

  return response;
}

function handlePopupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Extension context invalidated")) {
    setStatus("Reloadaj tab nakon reloada ekstenzije.", true);
    return;
  }

  setStatus(message, true);
}
