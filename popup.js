const statusEl = document.getElementById("status");

document.getElementById("extractBtn").addEventListener("click", () => runAction("extract"));
document.getElementById("fillBtn").addEventListener("click", () => runAction("fill"));

async function runAction(action) {
  setStatus("Radim...");

  try {
    const response = await requestAction(action);
    setStatus(response.message || "Gotovo.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
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
