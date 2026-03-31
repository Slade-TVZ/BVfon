(function () {
  const PANEL_VERSION = "2026-03-31-floating-panel-v6";
  const PANEL_ID = "__invoice_helper_floating_panel";
  const LAUNCHER_ID = "__invoice_helper_floating_launcher";
  const SOURCE_ORGANIZATION_KEY = "sourceOrganizationName";
  const PANEL_STATE_KEY = "floatingPanelState";

  if (globalThis.__invoiceHelperFloatingPanelInitialized === PANEL_VERSION) {
    return;
  }
  globalThis.__invoiceHelperFloatingPanelInitialized = PANEL_VERSION;

  if (!document.body || document.getElementById(PANEL_ID)) {
    return;
  }

  let panelState = {
    left: 16,
    top: 16
  };

  const panel = document.createElement("div");
  const header = document.createElement("div");
  const title = document.createElement("div");
  const closeBtn = document.createElement("button");
  const actions = document.createElement("div");
  const advancedSection = document.createElement("div");
  const extractBtn = createButton("Ucitaj");
  const fillBtn = createButton("Upisi");
  const toggleAdvancedBtn = createButton("Opcije", true);
  const status = document.createElement("div");
  const sourceOrganizationInput = document.createElement("input");
  const debugToggle = document.createElement("input");
  const previewBtn = createButton("Preview", true, true);
  const clearDataBtn = createButton("Data", true, true);
  const refreshLogsBtn = createButton("Logovi", true, true);
  const clearLogsBtn = createButton("Clear", true, true);
  const exportLogsBtn = createButton("Export", true, true);
  const preview = document.createElement("div");
  const logs = document.createElement("div");

  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "Invoice Helper floating window");
  panel.style.position = "fixed";
  panel.style.left = "16px";
  panel.style.top = "16px";
  panel.style.zIndex = "2147483646";
  panel.style.width = "186px";
  panel.style.padding = "10px";
  panel.style.borderRadius = "14px";
  panel.style.background = "rgba(255, 255, 255, 0.96)";
  panel.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  panel.style.boxShadow = "0 12px 28px rgba(20, 44, 74, 0.16)";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.fontFamily = "Segoe UI, Arial, sans-serif";
  panel.style.display = "grid";
  panel.style.gap = "8px";
  panel.style.userSelect = "none";

  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "8px";
  header.style.cursor = "move";
  header.style.padding = "2px 0 4px";

  title.textContent = "Invoice Helper";
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.color = "#17324d";

  closeBtn.type = "button";
  closeBtn.textContent = "X";
  closeBtn.style.border = "0";
  closeBtn.style.borderRadius = "8px";
  closeBtn.style.padding = "4px 7px";
  closeBtn.style.background = "#e9f1fb";
  closeBtn.style.color = "#17324d";
  closeBtn.style.fontSize = "11px";
  closeBtn.style.fontWeight = "700";
  closeBtn.style.cursor = "pointer";

  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "1fr 1fr auto";
  actions.style.gap = "8px";
  actions.style.alignItems = "center";

  status.style.minHeight = "14px";
  status.style.fontSize = "10px";
  status.style.lineHeight = "1.35";
  status.style.color = "#5f7389";
  status.style.textAlign = "center";
  status.style.wordBreak = "break-word";

  advancedSection.style.display = "none";
  advancedSection.style.marginTop = "2px";
  advancedSection.style.paddingTop = "10px";
  advancedSection.style.borderTop = "1px solid rgba(216, 226, 238, 0.95)";
  advancedSection.style.gap = "8px";

  sourceOrganizationInput.type = "text";
  sourceOrganizationInput.placeholder = "Source organization";
  sourceOrganizationInput.style.width = "100%";
  sourceOrganizationInput.style.boxSizing = "border-box";
  sourceOrganizationInput.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  sourceOrganizationInput.style.borderRadius = "10px";
  sourceOrganizationInput.style.padding = "8px 10px";
  sourceOrganizationInput.style.fontSize = "12px";
  sourceOrganizationInput.style.userSelect = "text";

  const sourceLabel = createLabel("Source organization", sourceOrganizationInput);
  const debugRow = document.createElement("label");
  const debugText = document.createElement("span");
  debugText.textContent = "Debug mode";
  debugToggle.type = "checkbox";
  debugRow.style.display = "flex";
  debugRow.style.alignItems = "center";
  debugRow.style.justifyContent = "space-between";
  debugRow.style.gap = "10px";
  debugRow.style.padding = "8px 10px";
  debugRow.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  debugRow.style.borderRadius = "10px";
  debugRow.style.background = "#f8fbff";
  debugRow.style.fontSize = "12px";
  debugRow.appendChild(debugText);
  debugRow.appendChild(debugToggle);

  const dataToolbar = document.createElement("div");
  dataToolbar.style.display = "grid";
  dataToolbar.style.gridTemplateColumns = "1fr 1fr";
  dataToolbar.style.gap = "8px";
  dataToolbar.appendChild(previewBtn);
  dataToolbar.appendChild(clearDataBtn);

  const logsToolbar = document.createElement("div");
  logsToolbar.style.display = "grid";
  logsToolbar.style.gridTemplateColumns = "1fr 1fr 1fr";
  logsToolbar.style.gap = "8px";
  logsToolbar.appendChild(refreshLogsBtn);
  logsToolbar.appendChild(clearLogsBtn);
  logsToolbar.appendChild(exportLogsBtn);

  preview.style.maxHeight = "150px";
  preview.style.overflow = "auto";
  preview.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  preview.style.borderRadius = "10px";
  preview.style.padding = "8px";
  preview.style.fontSize = "10px";
  preview.style.whiteSpace = "pre-wrap";
  preview.style.wordBreak = "break-word";
  preview.style.background = "#fbfdff";
  preview.style.userSelect = "text";

  logs.style.maxHeight = "150px";
  logs.style.overflow = "auto";
  logs.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  logs.style.borderRadius = "10px";
  logs.style.padding = "8px";
  logs.style.fontSize = "10px";
  logs.style.whiteSpace = "pre-wrap";
  logs.style.wordBreak = "break-word";
  logs.style.background = "#fbfdff";
  logs.style.userSelect = "text";

  extractBtn.addEventListener("click", () => runAction("extract"));
  fillBtn.addEventListener("click", () => runAction("fill"));
  toggleAdvancedBtn.addEventListener("click", toggleAdvancedSection);
  previewBtn.addEventListener("click", previewStoredData);
  clearDataBtn.addEventListener("click", clearStoredData);
  refreshLogsBtn.addEventListener("click", refreshLogs);
  clearLogsBtn.addEventListener("click", clearLogsView);
  exportLogsBtn.addEventListener("click", exportLogsFile);
  debugToggle.addEventListener("change", updateDebugMode);
  closeBtn.addEventListener("click", closePanel);

  header.appendChild(title);
  header.appendChild(closeBtn);
  actions.appendChild(extractBtn);
  actions.appendChild(fillBtn);
  actions.appendChild(toggleAdvancedBtn);
  panel.appendChild(header);
  panel.appendChild(actions);
  panel.appendChild(status);
  advancedSection.appendChild(sourceLabel);
  advancedSection.appendChild(sourceOrganizationInput);
  advancedSection.appendChild(debugRow);
  advancedSection.appendChild(dataToolbar);
  advancedSection.appendChild(logsToolbar);
  advancedSection.appendChild(preview);
  advancedSection.appendChild(logs);
  panel.appendChild(advancedSection);
  document.body.appendChild(panel);

  initializePanel().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error), true);
  });

  async function initializePanel() {
    const stored = await chrome.storage.local.get([SOURCE_ORGANIZATION_KEY, PANEL_STATE_KEY]);
    sourceOrganizationInput.value = stored[SOURCE_ORGANIZATION_KEY] || "";
    const debugMode = await requestAction("getDebugMode");
    debugToggle.checked = Boolean(debugMode.enabled);

    const savedState = stored[PANEL_STATE_KEY];
    if (savedState && typeof savedState === "object") {
      panelState = {
        left: Number.isFinite(savedState.left) ? savedState.left : 16,
        top: Number.isFinite(savedState.top) ? savedState.top : 16
      };
    }

    clampAndApplyPosition(panelState.left, panelState.top);
    attachDragging();
  }

  async function runAction(action) {
    setStatus("Radim...");
    setDisabled(true);

    try {
      await persistSourceOrganization();
      const response = await requestAction(action);
      setStatus(response.message || "Gotovo.");
    } catch (error) {
      handlePanelError(error);
    } finally {
      setDisabled(false);
      window.setTimeout(() => {
        status.textContent = "";
      }, 3200);
    }
  }

  async function previewStoredData() {
    setStatus("Ucitam preview...");

    try {
      await persistSourceOrganization();
      const response = await requestAction("preview");
      preview.textContent = JSON.stringify(
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
      handlePanelError(error);
    }
  }

  async function clearStoredData() {
    setStatus("Brisem spremljene podatke...");

    try {
      const response = await requestAction("clearData");
      preview.textContent = "";
      setStatus(response.message || "Podaci obrisani.");
    } catch (error) {
      handlePanelError(error);
    }
  }

  async function refreshLogs() {
    setStatus("Ucitam logove...");

    try {
      const response = await requestAction("getLogs");
      logs.textContent = (response.logs || [])
        .map((entry) =>
          [
            `[${String(entry.level || "").toUpperCase()}] ${entry.timestamp || ""}`,
            `${entry.source || ""} :: ${entry.event || ""}`,
            formatDetails(entry.details || ""),
            ""
          ].join("\n")
        )
        .join("\n");
      setStatus(response.message || "Logovi ucitani.");
    } catch (error) {
      handlePanelError(error);
    }
  }

  async function clearLogsView() {
    setStatus("Brisem logove...");

    try {
      const response = await requestAction("clearLogs");
      logs.textContent = "";
      setStatus(response.message || "Logovi obrisani.");
    } catch (error) {
      handlePanelError(error);
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
      handlePanelError(error);
    }
  }

  async function updateDebugMode() {
    try {
      const response = await requestAction("setDebugMode", {
        enabled: debugToggle.checked
      });
      setStatus(response.message || "Debug mode azuriran.");
    } catch (error) {
      handlePanelError(error);
    }
  }

  function toggleAdvancedSection() {
    const isOpen = advancedSection.style.display === "grid";
    advancedSection.style.display = isOpen ? "none" : "grid";
    toggleAdvancedBtn.textContent = isOpen ? "Opcije" : "Sakrij";
  }

  async function persistSourceOrganization() {
    await chrome.storage.local.set({
      [SOURCE_ORGANIZATION_KEY]: sourceOrganizationInput.value.trim()
    });
  }

  async function persistPanelState() {
    await chrome.storage.local.set({
      [PANEL_STATE_KEY]: {
        left: panelState.left,
        top: panelState.top
      }
    });
  }

  function closePanel() {
    persistPanelState().catch(() => {});
    document.getElementById(LAUNCHER_ID)?.remove();
    panel.remove();
    try {
      delete globalThis.__invoiceHelperFloatingPanelInitialized;
    } catch (_error) {
      globalThis.__invoiceHelperFloatingPanelInitialized = undefined;
    }
  }

  function attachDragging() {
    let dragState = null;

    panel.addEventListener("pointerdown", (event) => {
      if (isInteractiveElement(event.target)) {
        return;
      }

      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: panelState.left,
        top: panelState.top
      };

      panel.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    panel.addEventListener("pointermove", (event) => {
      if (!dragState) {
        return;
      }

      const nextLeft = dragState.left + (event.clientX - dragState.startX);
      const nextTop = dragState.top + (event.clientY - dragState.startY);
      clampAndApplyPosition(nextLeft, nextTop);
    });

    panel.addEventListener("pointerup", async () => {
      dragState = null;
      await persistPanelState().catch(() => {});
    });

    panel.addEventListener("pointercancel", async () => {
      dragState = null;
      await persistPanelState().catch(() => {});
    });
  }

  function clampAndApplyPosition(left, top) {
    const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - 48);

    panelState.left = Math.min(Math.max(8, Math.round(left)), maxLeft);
    panelState.top = Math.min(Math.max(8, Math.round(top)), maxTop);

    panel.style.left = `${panelState.left}px`;
    panel.style.top = `${panelState.top}px`;
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

  function handlePanelError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Extension context invalidated")) {
      setStatus("Reloadaj tab nakon reloada ekstenzije.", true);
      setDisabled(true);
      return;
    }

    setStatus(message, true);
  }

  function isInteractiveElement(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("button, input, textarea, select, label, a"));
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

  function setDisabled(disabled) {
    extractBtn.disabled = disabled;
    fillBtn.disabled = disabled;
    toggleAdvancedBtn.disabled = disabled;
    const opacity = disabled ? "0.65" : "1";
    extractBtn.style.opacity = opacity;
    fillBtn.style.opacity = opacity;
    toggleAdvancedBtn.style.opacity = opacity;
  }

  function setStatus(message, isError = false) {
    status.textContent = message || "";
    status.style.color = isError ? "#c62828" : "#5f7389";
  }

  function createLabel(text, target) {
    const label = document.createElement("label");
    label.textContent = text;
    label.style.display = "block";
    label.style.marginBottom = "6px";
    label.style.fontSize = "11px";
    label.style.fontWeight = "700";
    if (target) {
      target.id = `${PANEL_ID}_${text.replace(/\s+/g, "_").toLowerCase()}`;
      label.htmlFor = target.id;
    }
    return label;
  }

  function createButton(label, secondary = false, compact = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.border = "0";
    button.style.borderRadius = "10px";
    button.style.padding = compact ? "8px 10px" : "10px 12px";
    button.style.background = secondary ? "#e9f1fb" : "#155eef";
    button.style.color = secondary ? "#17324d" : "#ffffff";
    button.style.fontSize = compact ? "11px" : "13px";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";
    button.style.fontFamily = "inherit";
    button.style.lineHeight = "1.2";
    return button;
  }
})();
