(function () {
  const SOURCE_SCRIPT_VERSION = "2026-04-01-source-v11";
  const RESTRICTED_ORGANIZATION_NAME = "Zatvor u Sisku (314)";

  if (globalThis.__invoiceHelperSourceInitialized === SOURCE_SCRIPT_VERSION) {
    return;
  }
  globalThis.__invoiceHelperSourceInitialized = SOURCE_SCRIPT_VERSION;

  const STORAGE_KEYS = {
    extractedRows: "extractedRows",
    extractionMeta: "extractionMeta",
    pendingExtraction: "pendingExtraction",
    sourceOrganizationName: "sourceOrganizationName"
  };

  const SOURCE_CONFIG = {
    formSelector: 'form[action="/PrisonLevelInvoiceReport/Generate"]',
    financialPeriodSelect: "#financialPeriod",
    organizationPresentationInput: "#ouGroup",
    organizationHiddenInput: 'input[name="ouGroup"]',
    htmlModeLabel: "#select2-w5j6-container",
    htmlModeSelect: ".report-generate select",
    htmlModeSelectors: [
      "#select2-w5j6-container",
      ".report-generate .select2-selection__rendered",
      ".report-generate .dropdown-toggle",
      ".report-generate .btn.dropdown-toggle",
      ".report-generate [data-toggle='dropdown']",
      ".report-generate button",
      ".report-generate .btn",
      ".report-generate span"
    ],
    generateButton: ".report-generate input[type='button']",
    reportTable: "table.reportTable"
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
      const prepareResult = await prepareGenerationForm();
      if (prepareResult?.cancelled) {
        return prepareResult;
      }
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
    const pendingExtraction = storage[STORAGE_KEYS.pendingExtraction];
    if (!pendingExtraction) {
      return { message: "No pending extraction." };
    }

    if (!document.querySelector(SOURCE_CONFIG.reportTable)) {
      await InvoiceLogger.logEvent("warn", "source-content", "auto-extract-table-missing", "");
      return { message: "Report table not found on this page." };
    }

    await InvoiceLogger.logEvent("info", "source-content", "auto-extract-triggered", "");
    return extractRowsFromReportPage(pendingExtraction);
  }

  async function prepareGenerationForm() {
    const periodSelect = mustQuery(SOURCE_CONFIG.financialPeriodSelect);
    const orgPresentationInput = mustQuery(SOURCE_CONFIG.organizationPresentationInput);
    const orgHiddenInput = mustQuery(SOURCE_CONFIG.organizationHiddenInput);
    const generateButton = mustQuery(SOURCE_CONFIG.generateButton);
    const storage = await safeGet([STORAGE_KEYS.sourceOrganizationName]);

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

    const desiredOrganization = normalizeCellText(storage[STORAGE_KEYS.sourceOrganizationName] || "");
    if (desiredOrganization) {
      await ensureOrganizationSelected(desiredOrganization, orgPresentationInput, orgHiddenInput);
    }

    if (!orgPresentationInput.value.trim() || !orgHiddenInput.value.trim()) {
      await InvoiceLogger.logEvent("warn", "source-content", "organization-missing", "");
      InvoiceLogger.showStatusOverlay("Organization missing", "warn");
      throw new Error("Organizational unit must be selected by the user.");
    }

    const restrictedCheck = await confirmRestrictedOrganizationAction(
      orgPresentationInput.value.trim() || orgPresentationInput.getAttribute("title") || "",
      "generiranje izvjestaja"
    );
    if (!restrictedCheck.allowed) {
      return {
        message: restrictedCheck.message,
        cancelled: true,
        restrictedCheck
      };
    }

    await ensureHtmlModeSelected();

    if (!isHtmlModeSelected()) {
      await InvoiceLogger.logEvent("warn", "source-content", "html-mode-not-selected", {
        currentValue: getDetectedHtmlModeLabel()
      });
      throw new Error("HTML mode is not currently selected for report generation.");
    }

    await safeRemove([STORAGE_KEYS.extractedRows, STORAGE_KEYS.extractionMeta]);
    await InvoiceLogger.logEvent("info", "source-content", "stale-extraction-cleared", "");

    await safeSet({
      [STORAGE_KEYS.pendingExtraction]: {
        startedAt: new Date().toISOString(),
        organizationName: orgPresentationInput.value.trim(),
        expectedFinancialPeriod: normalizeCellText(previousMonthOption.textContent),
        restrictedOrganizationConfirmed: restrictedCheck.confirmed
      }
    });

    await InvoiceLogger.logEvent("info", "source-content", "pending-extraction-saved", {
      organizationName: orgPresentationInput.value.trim()
    });

    InvoiceLogger.showStatusOverlay("Generating source report", "info");
    generateButton.click();
    await InvoiceLogger.logEvent("info", "source-content", "generate-clicked", "");
  }

  async function extractRowsFromReportPage(pendingExtraction = null) {
    const table = mustQuery(SOURCE_CONFIG.reportTable);
    const { headers, dataRows, totalTableRows } = getReportTableStructure(table);

    const extractedRows = dataRows
      .map((row) => rowToObject(row, headers))
      .filter((row) => Object.values(row).some((value) => value !== ""));

    await InvoiceLogger.logEvent("info", "source-content", "rows-read", {
      rowCount: extractedRows.length,
      headers,
      bodyRowCount: dataRows.length,
      totalTableRows
    });

    if (!extractedRows.length) {
      await InvoiceLogger.logEvent("warn", "source-content", "no-data-rows-found", {
        headers,
        totalTableRows
      });
      InvoiceLogger.showStatusOverlay("Nema redova za ekstrakciju", "warn");
      throw new Error("No data rows found in source report table.");
    }

    const extractionMeta = extractMetaFromReport(extractedRows, pendingExtraction);
    const restrictedCheck = await confirmRestrictedOrganizationAction(
      extractionMeta.organization || extractionMeta.organizationSearchName || "",
      "ekstrakciju izvjestaja",
      pendingExtraction?.restrictedOrganizationConfirmed === true
    );
    if (!restrictedCheck.allowed) {
      return {
        message: restrictedCheck.message,
        rows: [],
        meta: extractionMeta,
        cancelled: true,
        restrictedCheck
      };
    }
    await validateExtractedFinancialPeriod(extractionMeta);
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

  async function confirmRestrictedOrganizationAction(organizationName, actionLabel, alreadyConfirmed = false) {
    if (!isRestrictedOrganization(organizationName)) {
      return {
        allowed: true,
        confirmed: false
      };
    }

    if (alreadyConfirmed) {
      return {
        allowed: true,
        confirmed: true
      };
    }

    const message = `Upozorenje: organizacija je ${RESTRICTED_ORGANIZATION_NAME}. Zelis li zaista nastaviti za ${actionLabel}?`;
    const confirmed = await showExtensionConfirm(message, {
      title: "Posebna potvrda",
      tone: "warn",
      confirmLabel: "Nastavi",
      cancelLabel: "Ne nastavljaj"
    });

    await InvoiceLogger.logEvent("warn", "source-content", "restricted-organization-confirmation", {
      organizationName,
      actionLabel,
      confirmed
    });

    if (!confirmed) {
      const cancelMessage = `Akcija je otkazana za ${RESTRICTED_ORGANIZATION_NAME}.`;
      InvoiceLogger.showStatusOverlay(cancelMessage, "warn", 7000, { position: "center" });
      return {
        allowed: false,
        confirmed: false,
        message: cancelMessage
      };
    }

    return {
      allowed: true,
      confirmed: true
    };
  }

  function isRestrictedOrganization(value) {
    const normalized = canonicalizeOrganizationValue(value);
    return (
      normalized === canonicalizeOrganizationValue(RESTRICTED_ORGANIZATION_NAME) ||
      normalized === canonicalizeOrganizationValue("Zatvor u Sisku")
    );
  }

  async function showExtensionConfirm(message, options = {}) {
    if (typeof InvoiceLogger?.showConfirmDialog === "function") {
      return InvoiceLogger.showConfirmDialog(message, options);
    }

    return window.confirm(String(message || ""));
  }

  async function validateExtractedFinancialPeriod(extractionMeta) {
    const expectedFinancialPeriod = normalizeCellText(formatPreviousMonthRange());
    const actualFinancialPeriod = normalizeCellText(extractionMeta.financialPeriod || "");
    const expectedPeriodRange = getExpectedBillingPeriodRange();
    const actualPeriodRange = parseFinancialPeriod(extractionMeta.financialPeriod || "");

    if (!actualFinancialPeriod) {
      await InvoiceLogger.logEvent("warn", "source-content", "financial-period-missing-in-report", "");
      return;
    }

    const matches =
      actualPeriodRange != null
        ? arePeriodRangesEqual(actualPeriodRange, expectedPeriodRange)
        : actualFinancialPeriod === expectedFinancialPeriod;

    if (!matches) {
      await InvoiceLogger.logEvent("error", "source-content", "financial-period-mismatch", {
        expectedFinancialPeriod,
        actualFinancialPeriod
      });
      InvoiceLogger.showStatusOverlay("Wrong financial period on report", "error");
      throw new Error(
        `Financial period mismatch. Expected "${expectedFinancialPeriod}", got "${actualFinancialPeriod}".`
      );
    }
  }

  function rowToObject(row, headers) {
    const cells = getRowCells(row);
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = normalizeCellText(cells[index]?.textContent || "");
      return accumulator;
    }, {});
  }

  function shouldExtractBodyRow(row, headers) {
    const cells = getRowCells(row);
    if (!cells.length) {
      return false;
    }

    const values = cells.map((cell) => normalizeCellText(cell.textContent || ""));
    if (!values.some(Boolean)) {
      return false;
    }

    const firstValue = values[0].toUpperCase();
    if (firstValue === "UKUPNO" || firstValue.startsWith("UKUPNO ")) {
      return false;
    }

    if (looksLikeHeaderRow(values, headers)) {
      return false;
    }

    return true;
  }

  function getReportTableStructure(table) {
    const allRows = Array.from(table.querySelectorAll("tr"));
    const theadHeaderRow = Array.from(table.querySelectorAll("thead tr"))
      .map((row) => ({ row, score: scoreHeaderRow(row) }))
      .sort((left, right) => right.score - left.score)[0]?.row || null;

    let headerRow = theadHeaderRow;
    if (!headerRow) {
      headerRow =
        allRows
          .map((row) => ({ row, score: scoreHeaderRow(row) }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)[0]?.row || null;
    }

    const headers = getRowCells(headerRow).map((cell) => normalizeCellText(cell.textContent));
    const bodyRows =
      Array.from(table.querySelectorAll("tbody tr")).filter((row) => row !== headerRow) ||
      [];
    const candidateRows = bodyRows.length
      ? bodyRows
      : allRows.filter((row) => row !== headerRow);

    const dataRows = candidateRows.filter((row) => shouldExtractBodyRow(row, headers));

    return {
      headers,
      dataRows,
      totalTableRows: allRows.length
    };
  }

  function scoreHeaderRow(row) {
    const cells = getRowCells(row);
    if (!cells.length) {
      return 0;
    }

    const thCount = Array.from(row.children).filter((cell) => cell.tagName === "TH").length;
    const values = cells.map((cell) => normalizeCellText(cell.textContent));
    const textHeavyCount = values.filter((value) => {
      return /[A-Za-z\u00C0-\u017F]/.test(value) && !/\d,\d/.test(value);
    }).length;

    return thCount * 3 + textHeavyCount;
  }

  function getRowCells(row) {
    return row ? Array.from(row.querySelectorAll(":scope > th, :scope > td")) : [];
  }

  function looksLikeHeaderRow(values, headers) {
    if (!headers.length) {
      return false;
    }

    const comparableHeaders = headers.slice(0, values.length).map((header) =>
      canonicalizeHeader(header)
    );
    const comparableValues = values.slice(0, comparableHeaders.length).map((value) =>
      canonicalizeHeader(value)
    );
    const matchingHeaderCells = comparableValues.filter((value, index) => {
      return value && value === comparableHeaders[index];
    }).length;

    return matchingHeaderCells >= Math.min(3, comparableHeaders.length);
  }

  function extractMetaFromReport(extractedRows = [], pendingExtraction = null) {
    const filters = readReportFilters();
    const organization = pickFirstNonEmpty(
      getFilterValue(filters, ["Organizacija", "Organization unit", "Organization"]),
      getCurrentOrganizationValue(),
      pendingExtraction?.organizationName || ""
    );
    const financialPeriod = pickFirstNonEmpty(
      getFilterValue(filters, ["Financijsko razdoblje", "Financial period"]),
      getCurrentFinancialPeriodValue(),
      pendingExtraction?.expectedFinancialPeriod || ""
    );
    const sourceTotalNet = calculateSourceTotalNet(extractedRows);

    return {
      extractedAt: new Date().toISOString(),
      organization,
      organizationSearchName: normalizeOrganizationName(organization),
      financialPeriod,
      sourceTotalNet,
      sourceTotalNetDisplay: formatLocaleAmount(sourceTotalNet)
    };
  }

  function calculateSourceTotalNet(extractedRows) {
    return extractedRows.reduce((sum, row) => {
      return (
        sum +
        parseLocaleNumber(
          getRowFieldValue(row, [
            "Potrosnja zatvorenika",
            "Prisoners' spendings",
            "Prisoners\u2019 spendings",
            "Neto iznos stavke",
            "Total spendings",
            "Iznos",
            "Ukupno"
          ])
        )
      );
    }, 0);
  }

  function readReportFilters() {
    return Array.from(document.querySelectorAll(".filterDisplay, .filter-display")).reduce(
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
  }

  function getFilterValue(filters, candidateLabels) {
    return (
      candidateLabels
        .map((label) => filters[label])
        .find((value) => value != null && String(value).trim()) || ""
    );
  }

  function getCurrentOrganizationValue() {
    const orgPresentationInput = document.querySelector(SOURCE_CONFIG.organizationPresentationInput);
    return normalizeCellText(
      orgPresentationInput?.value || orgPresentationInput?.getAttribute("title") || ""
    );
  }

  function getCurrentFinancialPeriodValue() {
    const periodSelect = document.querySelector(SOURCE_CONFIG.financialPeriodSelect);
    if (periodSelect?.selectedIndex >= 0 && periodSelect.options?.length) {
      return normalizeCellText(periodSelect.options[periodSelect.selectedIndex]?.textContent || "");
    }

    return normalizeCellText(periodSelect?.value || "");
  }

  function pickFirstNonEmpty(...values) {
    return values.find((value) => value != null && String(value).trim()) || "";
  }

  function getRowFieldValue(row, candidateHeaders) {
    return (
      candidateHeaders
        .map((header) => {
          const directValue = row?.[header];
          if (directValue != null && String(directValue).trim()) {
            return directValue;
          }

          const normalizedHeader = canonicalizeHeader(header);
          return Object.entries(row || {}).find(([key, value]) => {
            return canonicalizeHeader(key) === normalizedHeader && String(value || "").trim();
          })?.[1];
        })
        .find((value) => value != null && String(value).trim()) || ""
    );
  }

  function parseLocaleNumber(value) {
    const normalized = normalizeNumericString(value);

    return Number.parseFloat(normalized) || 0;
  }

  function normalizeNumericString(value) {
    let normalized = String(value || "")
      .replace(/\s+/g, "")
      .replace(/EUR/gi, "")
      .replace(/[^\d,.-]/g, "");

    if (!normalized) {
      return "";
    }

    const lastCommaIndex = normalized.lastIndexOf(",");
    const lastDotIndex = normalized.lastIndexOf(".");

    if (lastCommaIndex !== -1 && lastDotIndex !== -1) {
      if (lastCommaIndex > lastDotIndex) {
        normalized = normalized.split(".").join("");
        normalized = keepLastSeparatorAsDecimal(normalized, ",");
      } else {
        normalized = normalized.split(",").join("");
        normalized = keepLastSeparatorAsDecimal(normalized, ".");
      }
    } else if (lastCommaIndex !== -1) {
      normalized = keepLastSeparatorAsDecimal(normalized, ",");
    } else if (lastDotIndex !== -1) {
      normalized = keepLastSeparatorAsDecimal(normalized, ".");
    }

    return normalized.replace(/[^\d.-]/g, "");
  }

  function keepLastSeparatorAsDecimal(value, separator) {
    const lastIndex = value.lastIndexOf(separator);
    if (lastIndex === -1) {
      return value;
    }

    const before = value
      .slice(0, lastIndex)
      .split(separator)
      .join("");
    const after = value
      .slice(lastIndex + 1)
      .split(separator)
      .join("");

    return `${before}.${after}`;
  }

  function formatLocaleAmount(value) {
    return (Number(value) || 0).toFixed(2).replace(".", ",");
  }

  function findPreviousMonthOption(select) {
    const target = formatPreviousMonthRange();
    const expectedPeriodRange = getExpectedBillingPeriodRange();

    return (
      Array.from(select.options).find((option) => {
        const optionRange = parseFinancialPeriod(option.textContent || "");
        return optionRange && arePeriodRangesEqual(optionRange, expectedPeriodRange);
      }) ||
      Array.from(select.options).find(
        (option) => normalizeCellText(option.textContent) === normalizeCellText(target)
      )
    );
  }

  function formatPreviousMonthRange() {
    const { from, to } = getExpectedBillingPeriodRange();

    return [
      `${from.getDate()}.${from.getMonth() + 1}.${from.getFullYear()}.`,
      `${to.getDate()}.${to.getMonth() + 1}.${to.getFullYear()}.`
    ].join(" - ");
  }

  function getExpectedBillingPeriodRange(referenceDate = new Date()) {
    const firstDayCurrentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
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

    return {
      from: firstDayPreviousMonth,
      to: lastDayPreviousMonth
    };
  }

  function parseFinancialPeriod(value) {
    const tokens = String(value || "").match(/\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4}\.?/g);
    if (!tokens || tokens.length < 2) {
      return null;
    }

    const [from, to] = tokens.map(parseFlexibleDateToken);
    if (!from || !to) {
      return null;
    }

    return { from, to };
  }

  function parseFlexibleDateToken(token) {
    const normalized = String(token || "")
      .replace(/\s+/g, "")
      .trim();
    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
    if (slashMatch) {
      return new Date(Number(slashMatch[3]), Number(slashMatch[1]) - 1, Number(slashMatch[2]));
    }

    const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(normalized);
    if (dotMatch) {
      return new Date(Number(dotMatch[3]), Number(dotMatch[2]) - 1, Number(dotMatch[1]));
    }

    return null;
  }

  function arePeriodRangesEqual(left, right) {
    if (!left?.from || !left?.to || !right?.from || !right?.to) {
      return false;
    }

    return areSameDate(left.from, right.from) && areSameDate(left.to, right.to);
  }

  function areSameDate(left, right) {
    if (!(left instanceof Date) || Number.isNaN(left.getTime())) {
      return false;
    }
    if (!(right instanceof Date) || Number.isNaN(right.getTime())) {
      return false;
    }

    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  function normalizeOrganizationName(value) {
    return normalizeCellText(value)
      .replace(/\(\d+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalizeOrganizationValue(value) {
    return normalizeCellText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  async function ensureOrganizationSelected(desiredOrganization, orgPresentationInput, orgHiddenInput) {
    const currentOrganization = normalizeCellText(
      orgPresentationInput.value || orgPresentationInput.getAttribute("title") || ""
    );

    if (
      currentOrganization &&
      normalizeCellText(currentOrganization).toUpperCase() === desiredOrganization.toUpperCase() &&
      orgHiddenInput.value.trim()
    ) {
      await InvoiceLogger.logEvent("info", "source-content", "organization-already-selected", {
        desiredOrganization,
        currentOrganization
      });
      return;
    }

    setElementValue(orgPresentationInput, desiredOrganization);
    orgPresentationInput.dispatchEvent(new Event("input", { bubbles: true }));
    orgPresentationInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "c" }));
    orgPresentationInput.dispatchEvent(new Event("change", { bubbles: true }));

    await delay(250);

    const suggestion = findOrganizationSuggestion(desiredOrganization);
    if (!suggestion) {
      await InvoiceLogger.logEvent("warn", "source-content", "organization-suggestion-missing", {
        desiredOrganization
      });
      return;
    }

    suggestion.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    suggestion.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    suggestion.click();

    await delay(250);

    const selectedOrganization = normalizeCellText(
      orgPresentationInput.value || orgPresentationInput.getAttribute("title") || ""
    );

    await InvoiceLogger.logEvent("info", "source-content", "organization-selection-attempted", {
      desiredOrganization,
      selectedOrganization,
      hiddenValue: orgHiddenInput.value.trim()
    });
  }

  function findOrganizationSuggestion(desiredOrganization) {
    const desiredUpper = desiredOrganization.toUpperCase();
    const suggestions = Array.from(document.querySelectorAll(".autocomplete-suggestion"));

    return (
      suggestions.find((suggestion) => {
        const text = normalizeCellText(suggestion.textContent).toUpperCase();
        return text === desiredUpper;
      }) ||
      suggestions.find((suggestion) => {
        const text = normalizeCellText(suggestion.textContent).toUpperCase();
        return text.includes(desiredUpper);
      }) ||
      null
    );
  }

  function normalizeCellText(value) {
    return (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalizeHeader(value) {
    return normalizeCellText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function isHtmlModeSelected() {
    const htmlModeSelect = findHtmlModeSelect();
    const selectValue = normalizeCellText(htmlModeSelect?.value || "").toUpperCase();
    if (selectValue === "PDFHTML") {
      return true;
    }

    const detectedLabel = normalizeCellText(getDetectedHtmlModeLabel()).toUpperCase();
    return detectedLabel === "HTML";
  }

  async function ensureHtmlModeSelected() {
    if (isHtmlModeSelected()) {
      return;
    }

    const htmlModeSelect = findHtmlModeSelect();
    const htmlModeOption = htmlModeSelect
      ? Array.from(htmlModeSelect.options).find((option) =>
          normalizeCellText(option.textContent).toUpperCase() === "HTML" ||
          normalizeCellText(option.value).toUpperCase() === "PDFHTML"
        )
      : null;

    if (!htmlModeSelect || !htmlModeOption) {
      await InvoiceLogger.logEvent("warn", "source-content", "html-mode-select-missing", {
        currentValue: getDetectedHtmlModeLabel()
      });
      return;
    }

    Array.from(htmlModeSelect.options).forEach((option) => {
      option.selected = option.value === htmlModeOption.value;
    });
    htmlModeSelect.selectedIndex = Array.from(htmlModeSelect.options).findIndex(
      (option) => option.value === htmlModeOption.value
    );
    setElementValue(htmlModeSelect, htmlModeOption.value);
    htmlModeSelect.dispatchEvent(new Event("input", { bubbles: true }));
    htmlModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    htmlModeSelect.dispatchEvent(new Event("blur", { bubbles: true }));
    htmlModeSelect.dispatchEvent(new Event("click", { bubbles: true }));

    const jquery = globalThis.jQuery || globalThis.$;
    if (typeof jquery === "function") {
      try {
        jquery(htmlModeSelect).val(htmlModeOption.value).trigger("change");
      } catch (_error) {
        // Ignore jQuery wiring issues and keep native events as fallback.
      }
    }

    syncRenderedHtmlModeLabel(htmlModeSelect, htmlModeOption.textContent.trim());
    await delay(75);

    if (isHtmlModeSelected()) {
      await InvoiceLogger.logEvent("info", "source-content", "html-mode-set", {
        value: htmlModeOption.textContent.trim(),
        strategy: "native-select"
      });
      return;
    }

    const htmlModeSelectedViaUi = await selectHtmlModeThroughUi(htmlModeSelect, htmlModeOption);
    if (htmlModeSelectedViaUi && isHtmlModeSelected()) {
      await InvoiceLogger.logEvent("info", "source-content", "html-mode-set", {
        value: htmlModeOption.textContent.trim(),
        strategy: "select2-ui"
      });
      return;
    }

    await InvoiceLogger.logEvent("warn", "source-content", "html-mode-set-unsure", {
      detectedLabel: getDetectedHtmlModeLabel(),
      selectValue: htmlModeSelect.value
    });
  }

  function syncRenderedHtmlModeLabel(htmlModeSelect, labelText) {
    const renderedLabel = htmlModeSelect
      .closest(".report-generate")
      ?.querySelector(".select2-selection__rendered");

    if (!renderedLabel) {
      return;
    }

    renderedLabel.textContent = labelText;
    renderedLabel.setAttribute("title", labelText);
  }

  async function selectHtmlModeThroughUi(htmlModeSelect, htmlModeOption) {
    const selectContainer = htmlModeSelect.closest(".report-generate");
    const selection = selectContainer?.querySelector(".select2-selection");
    const arrow = selectContainer?.querySelector(".select2-selection__arrow");
    if (!selection) {
      return false;
    }

    for (const candidate of [selection, arrow].filter(Boolean)) {
      candidate.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      candidate.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      candidate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    await delay(150);

    const activeDescendantId = selection.getAttribute("aria-activedescendant") || "";
    const activeDescendant = activeDescendantId
      ? document.getElementById(activeDescendantId)
      : null;

    if (activeDescendant) {
      const activeText = normalizeCellText(activeDescendant.textContent).toUpperCase();
      const expectedText = normalizeCellText(htmlModeOption.textContent).toUpperCase();

      if (activeText === expectedText) {
        for (const candidate of [selection, activeDescendant]) {
          candidate.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" })
          );
          candidate.dispatchEvent(
            new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" })
          );
        }

        await delay(150);
      }
    }

    const optionElements = Array.from(
      document.querySelectorAll(".select2-results__option, .select2-dropdown .select2-results li")
    );
    const htmlOptionElement = optionElements.find((element) => {
      const text = normalizeCellText(element.textContent).toUpperCase();
      return text === normalizeCellText(htmlModeOption.textContent).toUpperCase();
    });

    if (!htmlOptionElement) {
      return false;
    }

    htmlOptionElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    htmlOptionElement.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    htmlOptionElement.click();

    htmlModeSelect.value = htmlModeOption.value;
    htmlModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    syncRenderedHtmlModeLabel(htmlModeSelect, htmlModeOption.textContent.trim());

    await delay(150);
    return true;
  }

  function findHtmlModeSelect() {
    const selects = Array.from(document.querySelectorAll(SOURCE_CONFIG.htmlModeSelect));
    return (
      selects.find((select) =>
        Array.from(select.options).some((option) => {
          const text = normalizeCellText(option.textContent).toUpperCase();
          const value = normalizeCellText(option.value).toUpperCase();
          return text === "HTML" || value === "PDFHTML";
        })
      ) || null
    );
  }

  function getDetectedHtmlModeLabel() {
    for (const selector of SOURCE_CONFIG.htmlModeSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));

      for (const element of elements) {
        const text = normalizeCellText(element?.textContent || "");
        if (text.toUpperCase() === "HTML") {
          return text;
        }
      }
    }

    for (const selector of SOURCE_CONFIG.htmlModeSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));

      for (const element of elements) {
        const text = normalizeCellText(element?.textContent || "");
        if (text) {
          return text;
        }
      }
    }

    return "";
  }

  function setElementValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
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
