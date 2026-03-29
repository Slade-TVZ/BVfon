(function () {
  const PANEL_VERSION = "2026-03-29-floating-panel-v1";
  const PANEL_ID = "__invoice_helper_floating_panel";

  if (globalThis.__invoiceHelperFloatingPanelInitialized === PANEL_VERSION) {
    return;
  }
  globalThis.__invoiceHelperFloatingPanelInitialized = PANEL_VERSION;

  if (!document.body || document.getElementById(PANEL_ID)) {
    return;
  }

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "Invoice Helper controls");
  panel.style.position = "fixed";
  panel.style.top = "16px";
  panel.style.left = "16px";
  panel.style.zIndex = "2147483646";
  panel.style.width = "148px";
  panel.style.padding = "10px";
  panel.style.borderRadius = "14px";
  panel.style.background = "rgba(255, 255, 255, 0.96)";
  panel.style.border = "1px solid rgba(216, 226, 238, 0.95)";
  panel.style.boxShadow = "0 12px 28px rgba(20, 44, 74, 0.16)";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.fontFamily = "Segoe UI, Arial, sans-serif";
  panel.style.display = "grid";
  panel.style.gap = "8px";

  const extractBtn = createButton("Ucitaj");
  const fillBtn = createButton("Upisi");
  const status = document.createElement("div");

  status.style.minHeight = "14px";
  status.style.fontSize = "10px";
  status.style.lineHeight = "1.35";
  status.style.color = "#5f7389";
  status.style.textAlign = "center";
  status.style.wordBreak = "break-word";

  extractBtn.addEventListener("click", () => runAction("extract"));
  fillBtn.addEventListener("click", () => runAction("fill"));

  panel.appendChild(extractBtn);
  panel.appendChild(fillBtn);
  panel.appendChild(status);
  document.body.appendChild(panel);

  async function runAction(action) {
    setStatus("Radim...");
    setDisabled(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "POPUP_ACTION",
        action
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Unknown error");
      }

      setStatus(response.message || "Gotovo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      setDisabled(false);
      window.setTimeout(() => {
        status.textContent = "";
      }, 3200);
    }
  }

  function setDisabled(disabled) {
    extractBtn.disabled = disabled;
    fillBtn.disabled = disabled;
    const opacity = disabled ? "0.65" : "1";
    extractBtn.style.opacity = opacity;
    fillBtn.style.opacity = opacity;
  }

  function setStatus(message, isError = false) {
    status.textContent = message || "";
    status.style.color = isError ? "#c62828" : "#5f7389";
  }

  function createButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.border = "0";
    button.style.borderRadius = "10px";
    button.style.padding = "10px 12px";
    button.style.background = "#155eef";
    button.style.color = "#ffffff";
    button.style.fontSize = "13px";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";
    button.style.fontFamily = "inherit";
    button.style.lineHeight = "1.2";
    return button;
  }
})();
