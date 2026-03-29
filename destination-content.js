(function () {
  if (globalThis.__invoiceHelperDestinationInitialized) {
    return;
  }
  globalThis.__invoiceHelperDestinationInitialized = true;

  const STORAGE_KEYS = {
    extractedRows: "extractedRows",
    extractionMeta: "extractionMeta",
    pendingDestinationInvoiceNumber: "pendingDestinationInvoiceNumber"
  };

  const DESTINATION_CONFIG = {
    searchPagePath: "/eRacunB2B/dokument/pretraga",
    resultsRows: ".ant-table-tbody tr.ant-table-row.row-link",
    resultsCustomerCellIndex: 2,
    nextPageButton: ".ant-pagination-next button",
    createFromDocumentSelectors: [
      ".nav-action-button",
      'button[data-action="copy-document"]',
      'button[data-testid="create-from-document"]'
    ],
    detailInvoiceNumberField: "#formaPodaciDokument_iD",
    editableDocumentSelectors: {
      invoiceNumber: "#formaPodaciDokument_iD",
      dueDate: "#formaPodaciDokument_dueDate input",
      issueDate: "#formaPodaciDokument_issueDate input",
      issueTime: "#formaPodaciDokument_issueTime input",
      invoicePeriodInputs: "#formaPodaciDokument .ant-picker-range input",
      paymentNote: "#formaPodaciPlacanje_instructionNote",
      paymentModel: "#formaPodaciPlacanje_modelPaymentID",
      paymentReferenceNumber: "#formaPodaciPlacanje_pozivNaBrojPaymentID"
    },
    lineItems: {
      rows: "#specifikacijaStavke .ant-table-tbody tr.ant-table-row",
      nameCell: "td.naziv_artikla"
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FILL_DESTINATION_PAGE") {
      return false;
    }

    fillDestinationFlow()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(async (error) => {
        await InvoiceLogger.logEvent("error", "destination-content", "fill-flow-failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        InvoiceLogger.showStatusOverlay("Fill failed", "error");

        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  });

  async function fillDestinationFlow() {
    await InvoiceLogger.logEvent("info", "destination-content", "fill-started", {
      path: location.pathname
    });

    const storage = await safeGet([STORAGE_KEYS.extractedRows, STORAGE_KEYS.extractionMeta]);
    const extractedRows = storage[STORAGE_KEYS.extractedRows] || [];
    const extractionMeta = storage[STORAGE_KEYS.extractionMeta] || {};

    if (!extractedRows.length) {
      await InvoiceLogger.logEvent("warn", "destination-content", "fill-without-data", "");
      throw new Error("No extractedRows found in storage.");
    }

    if (location.pathname === DESTINATION_CONFIG.searchPagePath) {
      return findAndOpenMatchingDocument(extractionMeta);
    }

    return fillCurrentForm(extractedRows, extractionMeta);
  }

  async function findAndOpenMatchingDocument(extractionMeta) {
    const targetName = normalizeText(extractionMeta.organizationSearchName || "");
    if (!targetName) {
      throw new Error("Organization name metadata is missing.");
    }

    InvoiceLogger.showStatusOverlay("Searching matching document", "info");
    await InvoiceLogger.logEvent("info", "destination-content", "destination-search-started", {
      targetName
    });

    const matchingRow = await findMatchingRowAcrossPages(targetName);
    if (!matchingRow) {
      await InvoiceLogger.logEvent("warn", "destination-content", "matching-document-not-found", {
        targetName
      });
      InvoiceLogger.showStatusOverlay("Destination document missing", "warn");
      throw new Error(`Document row not found for "${targetName}".`);
    }

    matchingRow.click();
    await InvoiceLogger.logEvent("info", "destination-content", "matching-document-opened", {
      targetName
    });
    InvoiceLogger.showStatusOverlay("Matching document opened", "success");

    return { message: `Matching document opened for ${targetName}.` };
  }

  async function fillCurrentForm(extractedRows, extractionMeta) {
    const createButton = DESTINATION_CONFIG.createFromDocumentSelectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);

    if (createButton) {
      const currentInvoiceField = document.querySelector(DESTINATION_CONFIG.detailInvoiceNumberField);
      const currentInvoiceNumber = currentInvoiceField?.value?.trim() || "";
      const nextInvoiceNumber = incrementInvoiceNumber(currentInvoiceNumber, 22);

      if (nextInvoiceNumber) {
        await safeSet({
          [STORAGE_KEYS.pendingDestinationInvoiceNumber]: nextInvoiceNumber
        });
      }

      await InvoiceLogger.logEvent("info", "destination-content", "create-from-document-triggered", {
        currentInvoiceNumber,
        nextInvoiceNumber
      });

      InvoiceLogger.showStatusOverlay("Creating new document", "info");
      createButton.click();

      return {
        message: nextInvoiceNumber
          ? `Create-from-document triggered. Planned invoice number: ${nextInvoiceNumber}.`
          : "Create-from-document triggered."
      };
    }

    const pendingInvoiceNumber = await applyPendingInvoiceNumber();
    const fieldResults = await seedKnownDocumentFields(pendingInvoiceNumber);
    const lineItemMatch = await findMatchingLineItem(extractedRows);

    await InvoiceLogger.logEvent("info", "destination-content", "fill-completed", {
      fieldResults,
      lineItemMatch
    });
    InvoiceLogger.showStatusOverlay("Fill completed", "success");

    return {
      message: "Destination form updated.",
      extractionMeta,
      fieldResults,
      lineItemMatch
    };
  }

  async function findMatchingRowAcrossPages(targetName) {
    let pageGuard = 0;

    while (pageGuard < 10) {
      await waitForRows();

      const matchingRow = Array.from(document.querySelectorAll(DESTINATION_CONFIG.resultsRows)).find(
        (row) => {
          const cells = row.querySelectorAll("td");
          const customerCell = cells[DESTINATION_CONFIG.resultsCustomerCellIndex];
          const customerName = normalizeText(customerCell?.textContent || "");
          return customerName.includes(targetName);
        }
      );

      if (matchingRow) {
        return matchingRow;
      }

      const nextButton = document.querySelector(DESTINATION_CONFIG.nextPageButton);
      const disabled = nextButton?.disabled || nextButton?.closest(".ant-pagination-disabled");
      if (!nextButton || disabled) {
        break;
      }

      nextButton.click();
      pageGuard += 1;
      await sleep(700);
    }

    return null;
  }

  async function applyPendingInvoiceNumber() {
    const storage = await safeGet([STORAGE_KEYS.pendingDestinationInvoiceNumber]);
    const pendingInvoiceNumber = storage[STORAGE_KEYS.pendingDestinationInvoiceNumber];

    if (!pendingInvoiceNumber) {
      return null;
    }

    const targetField = document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber);
    if (!targetField || targetField.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "invoice-number-field-missing", "");
      InvoiceLogger.showStatusOverlay("Destination field missing", "warn");
      return pendingInvoiceNumber;
    }

    writeValue(targetField, pendingInvoiceNumber);
    await safeRemove([STORAGE_KEYS.pendingDestinationInvoiceNumber]);
    await InvoiceLogger.logEvent("info", "destination-content", "invoice-number-updated", {
      value: pendingInvoiceNumber
    });

    return pendingInvoiceNumber;
  }

  async function seedKnownDocumentFields(pendingInvoiceNumber) {
    const selectors = DESTINATION_CONFIG.editableDocumentSelectors;
    const updates = [];
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 17);
    const shortReference = buildShortReference(pendingInvoiceNumber);

    updates.push(await setField(selectors.issueDate, formatCroatianDate(now, true), "issue-date"));
    updates.push(await setField(selectors.issueTime, formatTime(now), "issue-time"));
    updates.push(await setField(selectors.dueDate, formatCroatianDate(dueDate, true), "due-date"));
    updates.push(await setField(selectors.paymentModel, "HR", "payment-model"));

    if (shortReference) {
      updates.push(await setField(selectors.paymentNote, shortReference, "payment-note"));
      updates.push(
        await setField(selectors.paymentReferenceNumber, shortReference, "payment-reference-number")
      );
    }

    updates.push(await setInvoicePeriodRange(selectors.invoicePeriodInputs, now));

    return updates.filter(Boolean);
  }

  async function setField(selector, value, eventName) {
    const element = document.querySelector(selector);
    if (!element || element.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-field-missing", {
        selector,
        eventName
      });
      InvoiceLogger.showStatusOverlay("Destination field missing", "warn");
      return null;
    }

    writeValue(element, value);
    await InvoiceLogger.logEvent("info", "destination-content", "destination-field-updated", {
      selector,
      eventName,
      value
    });
    return { selector, value };
  }

  async function setInvoicePeriodRange(selector, referenceDate) {
    const inputs = Array.from(document.querySelectorAll(selector));
    if (inputs.length < 2) {
      await InvoiceLogger.logEvent("warn", "destination-content", "invoice-period-inputs-missing", {
        selector
      });
      return null;
    }

    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

    writeValue(inputs[0], formatCroatianDate(startDate, false));
    writeValue(inputs[1], formatCroatianDate(endDate, false));

    await InvoiceLogger.logEvent("info", "destination-content", "invoice-period-updated", {
      from: formatCroatianDate(startDate, false),
      to: formatCroatianDate(endDate, false)
    });

    return {
      selector,
      from: formatCroatianDate(startDate, false),
      to: formatCroatianDate(endDate, false)
    };
  }

  async function findMatchingLineItem(extractedRows) {
    const sourceRow = extractedRows.find((row) => getSourceLineItemName(row));
    if (!sourceRow) {
      await InvoiceLogger.logEvent("warn", "destination-content", "source-line-item-name-missing", "");
      return null;
    }

    const sourceName = normalizeText(getSourceLineItemName(sourceRow));
    const matchingRow = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find(
      (row) => normalizeText(row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || "") === sourceName
    );

    if (!matchingRow) {
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-line-item-missing", {
        sourceName
      });
      return null;
    }

    await InvoiceLogger.logEvent("info", "destination-content", "destination-line-item-found", {
      sourceName
    });
    return {
      sourceName,
      destinationName: matchingRow.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent?.trim() || ""
    };
  }

  function getSourceLineItemName(row) {
    const candidateHeaders = [
      "Ime/Destinacija tarife",
      "Naziv artikla",
      "Naziv",
      "Opis",
      "Tarifa"
    ];

    return candidateHeaders.map((header) => row?.[header]).find((value) => value && String(value).trim()) || "";
  }

  function writeValue(element, value) {
    if (element.matches("input, textarea")) {
      setReactInputValue(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    element.textContent = value;
  }

  function setReactInputValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  async function waitForRows(timeoutMs = 8000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const rows = document.querySelectorAll(DESTINATION_CONFIG.resultsRows);
      if (rows.length > 0) {
        return;
      }
      await sleep(250);
    }

    throw new Error("Search results did not load in time.");
  }

  function incrementInvoiceNumber(invoiceNumber, increment) {
    const match = /^(\d+)(\/.*)$/.exec(invoiceNumber || "");
    if (!match) {
      return null;
    }

    const numericPart = String(Number.parseInt(match[1], 10) + increment).padStart(match[1].length, "0");
    return `${numericPart}${match[2]}`;
  }

  function buildShortReference(invoiceNumber) {
    if (!invoiceNumber) {
      return "";
    }

    const match = /^(\d+).*-([0-9]{2})$/.exec(invoiceNumber);
    if (!match) {
      return invoiceNumber;
    }

    return `${match[1]}-${match[2]}`;
  }

  function formatCroatianDate(date, spaced) {
    const separator = spaced ? ". " : ".";
    return `${String(date.getDate()).padStart(2, "0")}${separator}${String(
      date.getMonth() + 1
    ).padStart(2, "0")}${separator}${date.getFullYear()}.`;
  }

  function formatTime(date) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  function normalizeText(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(\d+\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function safeGet(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      await InvoiceLogger.logEvent("error", "destination-content", "storage-get-failed", {
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
      await InvoiceLogger.logEvent("error", "destination-content", "storage-set-failed", {
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
      await InvoiceLogger.logEvent("error", "destination-content", "storage-remove-failed", {
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
})();
