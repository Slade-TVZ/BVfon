(function () {
  if (globalThis.__invoiceHelperSourceInitialized) {
    return;
  }
  globalThis.__invoiceHelperSourceInitialized = true;

  const STORAGE_KEYS = {
    extractedRows: "extractedRows",
    extractionMeta: "extractionMeta",
    pendingExtraction: "pendingExtraction"
  };

  const SOURCE_CONFIG = {
    formSelector: 'form[action="/PrisonLevelInvoiceReport/Generate"]',
    financialPeriodSelect: "#financialPeriod",
    organizationPresentationInput: "#ouGroup",
    organizationHiddenInput: 'input[name="ouGroup"]',
    htmlModeLabel: "#select2-w5j6-container",
    generateButton: ".report-generate input[type='button']",
    reportTable: "table.reportTable",
    skipFirstBodyRow: true,
    skipLastBodyRow: true
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTRACT_DATA" && message?.type !== "AUTO_EXTRACT_IF_PENDING") {
      return false;
    }

    handleMessage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(async (error) => {
        await InvoiceLogger.logEvent("error", "source-content", "extract-flow-failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        InvoiceLogger.showStatusOverlay("Extract failed", "error");

        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  });

  async function handleMessage(message) {
    switch (message.type) {
      case "EXTRACT_DATA":
        await InvoiceLogger.logEvent("info", "source-content", "extract-started", "");
        return extractDataFlow();
      case "AUTO_EXTRACT_IF_PENDING":
        return autoExtractIfPending();
      default:
        return { message: "No source action performed." };
    }
  }

  async function extractDataFlow() {
    if (document.querySelector(SOURCE_CONFIG.reportTable)) {
      await InvoiceLogger.logEvent("info", "source-content", "source-table-found", "");
      InvoiceLogger.showStatusOverlay("Source table found", "success");
      return extractRowsFromReportPage();
    }

    if (document.querySelector(SOURCE_CONFIG.formSelector)) {
      await prepareGenerationForm();
      return {
        message: "Financial period set to previous month. Extraction will run after report loads."
      };
    }

    await InvoiceLogger.logEvent("warn", "source-content", "source-structure-not-recognized", {
      url: location.href
    });
    throw new Error("Source page structure not recognized.");
  }

  async function autoExtractIfPending() {
    const storage = await safeGet([STORAGE_KEYS.pendingExtraction]);
    if (!storage[STORAGE_KEYS.pendingExtraction]) {
      return { message: "No pending extraction." };
    }

    if (!document.querySelector(SOURCE_CONFIG.reportTable)) {
      await InvoiceLogger.logEvent("warn", "source-content", "auto-extract-table-missing", "");
      return { message: "Report table not found on this page." };
    }

    await InvoiceLogger.logEvent("info", "source-content", "auto-extract-triggered", "");
    return extractRowsFromReportPage();
  }

  async function prepareGenerationForm() {
    const periodSelect = mustQuery(SOURCE_CONFIG.financialPeriodSelect);
    const orgPresentationInput = mustQuery(SOURCE_CONFIG.organizationPresentationInput);
    const orgHiddenInput = mustQuery(SOURCE_CONFIG.organizationHiddenInput);
    const htmlModeLabel = mustQuery(SOURCE_CONFIG.htmlModeLabel);
    const generateButton = mustQuery(SOURCE_CONFIG.generateButton);

    const previousMonthOption = findPreviousMonthOption(periodSelect);
    if (!previousMonthOption) {
      await InvoiceLogger.logEvent("error", "source-content", "previous-month-option-missing", "");
      throw new Error("Previous month option was not found in financialPeriod.");
    }

    setElementValue(periodSelect, previousMonthOption.value);
    periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await InvoiceLogger.logEvent("info", "source-content", "financial-period-set", {
      value: previousMonthOption.textContent.trim()
    });

    if (!orgPresentationInput.value.trim() || !orgHiddenInput.value.trim()) {
      await InvoiceLogger.logEvent("warn", "source-content", "organization-missing", "");
      InvoiceLogger.showStatusOverlay("Organization missing", "warn");
      throw new Error("Organizational unit must be selected by the user.");
    }

    if (htmlModeLabel.textContent.trim().toUpperCase() !== "HTML") {
      await InvoiceLogger.logEvent("warn", "source-content", "html-mode-not-selected", {
        currentValue: htmlModeLabel.textContent.trim()
      });
      throw new Error("HTML mode is not currently selected for report generation.");
    }

    await safeSet({
      [STORAGE_KEYS.pendingExtraction]: {
        startedAt: new Date().toISOString(),
        organizationName: orgPresentationInput.value.trim()
      }
    });

    await InvoiceLogger.logEvent("info", "source-content", "pending-extraction-saved", {
      organizationName: orgPresentationInput.value.trim()
    });

    InvoiceLogger.showStatusOverlay("Generating source report", "info");
    generateButton.click();
    await InvoiceLogger.logEvent("info", "source-content", "generate-clicked", "");
  }

  async function extractRowsFromReportPage() {
    const table = mustQuery(SOURCE_CONFIG.reportTable);
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) =>
      normalizeCellText(cell.textContent)
    );

    let bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    if (SOURCE_CONFIG.skipFirstBodyRow && bodyRows.length > 0) {
      bodyRows = bodyRows.slice(1);
    }
    if (SOURCE_CONFIG.skipLastBodyRow && bodyRows.length > 0) {
      bodyRows = bodyRows.slice(0, -1);
    }

    const extractedRows = bodyRows
      .map((row) => rowToObject(row, headers))
      .filter((row) => Object.values(row).some((value) => value !== ""));

    await InvoiceLogger.logEvent("info", "source-content", "rows-read", {
      rowCount: extractedRows.length,
      headers
    });

    const extractionMeta = extractMetaFromReport();
    await InvoiceLogger.logEvent("info", "source-content", "saving-extracted-data", {
      rowCount: extractedRows.length,
      extractionMeta
    });

    await safeSet({
      [STORAGE_KEYS.extractedRows]: extractedRows,
      [STORAGE_KEYS.extractionMeta]: extractionMeta
    });
    await safeRemove([STORAGE_KEYS.pendingExtraction]);

    InvoiceLogger.showStatusOverlay(`${extractedRows.length} rows extracted`, "success");
    await InvoiceLogger.logEvent("info", "source-content", "data-saved", {
      rowCount: extractedRows.length
    });

    return {
      message: `Extracted ${extractedRows.length} rows.`,
      rows: extractedRows,
      meta: extractionMeta
    };
  }

  function rowToObject(row, headers) {
    const cells = Array.from(row.querySelectorAll("td"));
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = normalizeCellText(cells[index]?.textContent || "");
      return accumulator;
    }, {});
  }

  function extractMetaFromReport() {
    const filters = Array.from(document.querySelectorAll(".filterDisplay")).reduce(
      (accumulator, filterNode) => {
        const label = normalizeCellText(
          filterNode.querySelector(".filterLabel")?.textContent || ""
        );
        const value = normalizeCellText(
          filterNode.querySelector(".filterValue")?.textContent || ""
        );

        if (label) {
          accumulator[label] = value;
        }
        return accumulator;
      },
      {}
    );

    const organization = filters["Organizacija"] || "";

    return {
      extractedAt: new Date().toISOString(),
      organization,
      organizationSearchName: normalizeOrganizationName(organization),
      financialPeriod: filters["Financijsko razdoblje"] || ""
    };
  }

  function findPreviousMonthOption(select) {
    const target = formatPreviousMonthRange();
    return Array.from(select.options).find(
      (option) => normalizeCellText(option.textContent) === normalizeCellText(target)
    );
  }

  function formatPreviousMonthRange() {
    const now = new Date();
    const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayPreviousMonth = new Date(
      firstDayCurrentMonth.getFullYear(),
      firstDayCurrentMonth.getMonth() - 1,
      1
    );
    const lastDayPreviousMonth = new Date(
      firstDayCurrentMonth.getFullYear(),
      firstDayCurrentMonth.getMonth(),
      0
    );

    return [
      `${firstDayPreviousMonth.getDate()}.${firstDayPreviousMonth.getMonth() + 1}.${firstDayPreviousMonth.getFullYear()}.`,
      `${lastDayPreviousMonth.getDate()}.${lastDayPreviousMonth.getMonth() + 1}.${lastDayPreviousMonth.getFullYear()}.`
    ].join(" - ");
  }

  function normalizeOrganizationName(value) {
    return normalizeCellText(value)
      .replace(/\(\d+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCellText(value) {
    return (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setElementValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function mustQuery(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Missing required element: ${selector}`);
    }
    return element;
  }

  async function safeGet(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      await InvoiceLogger.logEvent("error", "source-content", "storage-get-failed", {
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async function safeSet(payload) {
    try {
      await chrome.storage.local.set(payload);
    } catch (error) {
      await InvoiceLogger.logEvent("error", "source-content", "storage-set-failed", {
        keys: Object.keys(payload),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async function safeRemove(keys) {
    try {
      await chrome.storage.local.remove(keys);
    } catch (error) {
      await InvoiceLogger.logEvent("error", "source-content", "storage-remove-failed", {
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
})();
