(function () {
  const DESTINATION_SCRIPT_VERSION = "2026-03-30-destination-v7";
  const VISUAL_SCROLL_DELAY_MS = 550;
  const VISUAL_FIELD_DELAY_MS = 300;
  const TOTAL_OVERLAY_DURATION_MS = 8000;
  const SAVE_DELAY_AFTER_TOTALS_MS = 5500;

  if (globalThis.__invoiceHelperDestinationInitialized === DESTINATION_SCRIPT_VERSION) {
    return;
  }
  globalThis.__invoiceHelperDestinationInitialized = DESTINATION_SCRIPT_VERSION;

  const STORAGE_KEYS = {
    extractedRows: "extractedRows",
    extractionMeta: "extractionMeta",
    pendingDestinationInvoiceNumber: "pendingDestinationInvoiceNumber",
    lastAppliedDestinationInvoiceNumber: "lastAppliedDestinationInvoiceNumber"
  };

  const DESTINATION_CONFIG = {
    searchPagePath: "/eRacunB2B/dokument/pretraga",
    resultsRows: ".ant-table-tbody tr.ant-table-row.row-link",
    resultsIdCellIndex: 0,
    resultsInvoiceNumberCellIndex: 1,
    resultsCustomerCellIndex: 2,
    nextPageButton: ".ant-pagination-next button",
    createFromDocumentSelectors: [
      ".nav-action-button",
      'button[data-action="copy-document"]',
      'button[data-testid="create-from-document"]'
    ],
    saveDocumentSelectors: [
      ".nav-action-button",
      'button[data-testid="save-document"]',
      "button.ant-btn.ant-btn-primary"
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
    editableDocumentLabels: {
      dueDate: ["Datum dospijeca placanja"],
      issueDate: ["Datum izdavanja"],
      issueTime: ["Vrijeme izdavanja"],
      invoicePeriod: ["Obracunsko razdoblje"],
      paymentNote: ["Opis placanja"],
      paymentModel: ["Model i poziv na broj"],
      paymentReferenceNumber: ["Model i poziv na broj"]
    },
    totals: {
      taxExclusiveAmount: "#formaUkupniIznosi_taxExclusiveAmount",
      lineExtensionAmount: "#formaUkupniIznosi_lineExtensionAmount",
      payableAmount: "#formaUkupniIznosi_payableAmount"
    },
    lineItems: {
      rows: "#specifikacijaStavke .ant-table-tbody tr.ant-table-row",
      nameCell: "td.naziv_artikla",
      editButton: 'button .anticon-edit, button[aria-label="edit"]',
      saveButton: 'button .anticon-save, button[aria-label="save"]',
      inlineEditableSelector:
        'textarea, input[type="text"], input[inputmode="numeric"], .ant-select, button .anticon-save',
      modalRoot: ".ant-modal-root .ant-modal, .ant-drawer .ant-drawer-content"
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

  queueMicrotask(() => {
    attemptAutoRepairOnEditableDocument().catch(async (error) => {
      await InvoiceLogger.logEvent("warn", "destination-content", "auto-repair-failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
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

    emphasizeElement(matchingRow, "rgba(21, 94, 239, 0.22)");
    matchingRow.click();
    await InvoiceLogger.logEvent("info", "destination-content", "matching-document-opened", {
      targetName,
      rowSummary: summarizeSearchRow(matchingRow)
    });
    InvoiceLogger.showStatusOverlay("Matching document opened", "success");

    return { message: `Matching document opened for ${targetName}.` };
  }

  async function fillCurrentForm(extractedRows, extractionMeta) {
    const editableInvoiceField = document.querySelector(
      DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber
    );
    const isEditableDocument =
      editableInvoiceField &&
      !editableInvoiceField.disabled &&
      !editableInvoiceField.closest("fieldset[disabled]");

    if (isEditableDocument) {
      await waitForEditableDocumentReady();
      const pendingInvoiceNumber = await applyPendingInvoiceNumber();
      const fieldResults = await seedKnownDocumentFields(pendingInvoiceNumber, extractionMeta);
      const lineItemResults = await applyLineItemRules(extractedRows);
      const lineItemMatch = await findMatchingLineItem(extractedRows);
      const totalDifferenceResult = await compareSourceAndDestinationTotals(extractionMeta);
      await sleep(SAVE_DELAY_AFTER_TOTALS_MS);
      const saveResult = await saveCurrentDocument();

      await InvoiceLogger.logEvent("info", "destination-content", "fill-completed", {
        fieldResults,
        lineItemResults,
        lineItemMatch,
        totalDifferenceResult,
        saveResult
      });
      return {
        message: "Destination form updated and saved.",
        extractionMeta,
        fieldResults,
        lineItemResults,
        lineItemMatch,
        totalDifferenceResult,
        saveResult
      };
    }

    const createButton = findCreateFromDocumentButton();

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

    await InvoiceLogger.logEvent("warn", "destination-content", "unsupported-page-state", {
      path: location.pathname
    });
    throw new Error("Current destination page state is not supported yet.");
  }

  async function attemptAutoRepairOnEditableDocument() {
    if (location.pathname === DESTINATION_CONFIG.searchPagePath) {
      return;
    }

    const editableInvoiceField = document.querySelector(
      DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber
    );
    const isEditableDocument =
      editableInvoiceField &&
      !editableInvoiceField.disabled &&
      !editableInvoiceField.closest("fieldset[disabled]");

    if (!isEditableDocument) {
      return;
    }

    await waitForEditableDocumentReady();
    const repairedInvoiceNumber = await applyPendingInvoiceNumber();
    if (!repairedInvoiceNumber) {
      return;
    }

    const shortReference = buildShortReference(repairedInvoiceNumber);
    if (shortReference) {
      writeValue(
        document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.paymentNote),
        shortReference
      );
      writeValue(
        document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.paymentReferenceNumber),
        shortReference
      );
    }

    await InvoiceLogger.logEvent("info", "destination-content", "auto-repair-applied", {
      repairedInvoiceNumber,
      shortReference
    });
  }

  async function findMatchingRowAcrossPages(targetName) {
    let pageGuard = 0;

    while (pageGuard < 10) {
      await waitForRows();

      const matchingRows = Array.from(document.querySelectorAll(DESTINATION_CONFIG.resultsRows))
        .filter((row) => {
          const cells = row.querySelectorAll("td");
          const customerCell = cells[DESTINATION_CONFIG.resultsCustomerCellIndex];
          const customerName = normalizeText(customerCell?.textContent || "");
          return customerName.includes(targetName);
        })
        .sort((left, right) => getRowNumericId(right) - getRowNumericId(left));

      const matchingRow = matchingRows[0] || null;

      if (matchingRow) {
        await InvoiceLogger.logEvent("info", "destination-content", "matching-document-found", {
          targetName,
          rowSummary: summarizeSearchRow(matchingRow)
        });
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
    const storage = await safeGet([
      STORAGE_KEYS.pendingDestinationInvoiceNumber,
      STORAGE_KEYS.lastAppliedDestinationInvoiceNumber
    ]);
    const pendingInvoiceNumber = storage[STORAGE_KEYS.pendingDestinationInvoiceNumber];
    const lastAppliedInvoiceNumber = storage[STORAGE_KEYS.lastAppliedDestinationInvoiceNumber];
    const targetField = await waitForEditableField(
      DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber
    );
    const currentInvoiceNumber = targetField?.value?.trim() || "";

    if (!targetField || targetField.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "invoice-number-field-missing", "");
      InvoiceLogger.showStatusOverlay("Destination field missing: invoice-number", "warn");
      return pendingInvoiceNumber || null;
    }

    if (currentInvoiceNumber && currentInvoiceNumber === lastAppliedInvoiceNumber) {
      await InvoiceLogger.logEvent("info", "destination-content", "invoice-number-already-applied", {
        value: currentInvoiceNumber
      });
      await safeRemove([STORAGE_KEYS.pendingDestinationInvoiceNumber]);
      return currentInvoiceNumber;
    }

    const inferredInvoiceNumber =
      pendingInvoiceNumber || inferNextInvoiceNumberFromCurrentState(currentInvoiceNumber);

    if (!inferredInvoiceNumber) {
      return null;
    }

    writeValue(targetField, inferredInvoiceNumber);
    await safeSet({
      [STORAGE_KEYS.lastAppliedDestinationInvoiceNumber]: inferredInvoiceNumber
    });
    await safeRemove([STORAGE_KEYS.pendingDestinationInvoiceNumber]);
    await InvoiceLogger.logEvent("info", "destination-content", "invoice-number-updated", {
      value: inferredInvoiceNumber,
      previousValue: currentInvoiceNumber
    });

    return inferredInvoiceNumber;
  }

  function inferNextInvoiceNumberFromCurrentState(currentInvoiceNumber) {
    if (!currentInvoiceNumber) {
      return null;
    }

    const paymentNote = document.querySelector(
      DESTINATION_CONFIG.editableDocumentSelectors.paymentNote
    )?.value?.trim();
    const paymentReference = document.querySelector(
      DESTINATION_CONFIG.editableDocumentSelectors.paymentReferenceNumber
    )?.value?.trim();
    const currentShortReference = buildShortReference(currentInvoiceNumber);
    const incrementedInvoiceNumber = incrementInvoiceNumber(currentInvoiceNumber, 22);
    const incrementedShortReference = buildShortReference(incrementedInvoiceNumber);

    if (
      incrementedShortReference &&
      (paymentNote === incrementedShortReference || paymentReference === incrementedShortReference)
    ) {
      return null;
    }

    if (
      !paymentNote &&
      !paymentReference
    ) {
      return incrementedInvoiceNumber;
    }

    if (paymentNote === currentShortReference || paymentReference === currentShortReference) {
      return incrementedInvoiceNumber;
    }

    return null;
  }

  function findCreateFromDocumentButton() {
    const candidates = DESTINATION_CONFIG.createFromDocumentSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );

    return candidates.find((button) => {
      const text = normalizeText(button?.textContent || "");
      return text.includes("IZRADI NOVI DOKUMENT IZ PRIKAZANOG");
    }) || null;
  }

  function findSaveDocumentButton() {
    const candidates = DESTINATION_CONFIG.saveDocumentSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );

    return candidates.find((button) => {
      const text = normalizeText(button?.textContent || "");
      return text.includes("SPREMI DOKUMENT");
    }) || null;
  }

  async function saveCurrentDocument() {
    const saveButton = findSaveDocumentButton();
    if (!saveButton || saveButton.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "save-document-button-missing", "");
      return {
        type: "save-button-missing"
      };
    }

    await revealElement(saveButton, "Spremi dokument");
    emphasizeElement(saveButton, "rgba(34, 197, 94, 0.24)");
    InvoiceLogger.showStatusOverlay("Saving document", "info");
    saveButton.click();
    await InvoiceLogger.logEvent("info", "destination-content", "save-document-clicked", "");

    return {
      type: "save-clicked"
    };
  }

  async function compareSourceAndDestinationTotals(extractionMeta) {
    await sleep(150);

    const sourceTotalNet = Number(extractionMeta?.sourceTotalNet || 0);
    const totalField = await findDestinationNetTotalField();
    await revealElement(totalField, "Ukupni iznos bez PDV-a");
    const destinationTotalNet = parseLocaleNumber(totalField?.value || totalField?.textContent || "");
    const difference = roundCurrency(destinationTotalNet - sourceTotalNet);
    const message = [
      `Razlika iznosa: ocekivano 0, dobiveno ${formatLocaleAmount(difference)}`,
      `Ukupni iznos bez PDV-a: ${formatLocaleAmount(destinationTotalNet)}`
    ].join(" | ");
    const level = areNumbersClose(difference, 0) ? "success" : "warn";

    InvoiceLogger.showStatusOverlay(message, level, TOTAL_OVERLAY_DURATION_MS, {
      position: "center"
    });
    await InvoiceLogger.logEvent("info", "destination-content", "total-difference-checked", {
      sourceTotalNet,
      destinationTotalNet,
      difference
    });

    return {
      sourceTotalNet,
      destinationTotalNet,
      difference,
      message
    };
  }

  async function findDestinationNetTotalField() {
    const directField =
      document.querySelector(DESTINATION_CONFIG.totals.taxExclusiveAmount) ||
      document.querySelector(DESTINATION_CONFIG.totals.lineExtensionAmount);
    if (directField) {
      return directField;
    }

    return (
      (await waitForEditableField(DESTINATION_CONFIG.totals.taxExclusiveAmount, [], 900)) ||
      (await waitForEditableField(DESTINATION_CONFIG.totals.lineExtensionAmount, [], 900))
    );
  }

  async function seedKnownDocumentFields(pendingInvoiceNumber, extractionMeta) {
    const selectors = DESTINATION_CONFIG.editableDocumentSelectors;
    const labels = DESTINATION_CONFIG.editableDocumentLabels;
    const updates = [];
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 17);
    const shortReference = buildShortReference(pendingInvoiceNumber);
    const invoicePeriod = parseFinancialPeriod(extractionMeta?.financialPeriod || "");

    updates.push(
      await setField(selectors.issueDate, formatCroatianDate(now, true), "issue-date", labels.issueDate)
    );
    updates.push(await setField(selectors.issueTime, formatTime(now), "issue-time", labels.issueTime));
    updates.push(
      await setField(
        selectors.dueDate,
        formatCroatianDate(dueDate, true),
        "due-date",
        labels.dueDate
      )
    );
    updates.push(
      await setField(selectors.paymentModel, "HR", "payment-model", labels.paymentModel)
    );

    if (shortReference) {
      updates.push(
        await setField(selectors.paymentNote, shortReference, "payment-note", labels.paymentNote)
      );
      updates.push(
        await setField(
          selectors.paymentReferenceNumber,
          shortReference,
          "payment-reference-number",
          labels.paymentReferenceNumber
        )
      );
    }

    updates.push(
      await setInvoicePeriodRange(
        selectors.invoicePeriodInputs,
        invoicePeriod || now,
        labels.invoicePeriod
      )
    );

    return updates.filter(Boolean);
  }

  async function setField(selector, value, eventName, labelCandidates = []) {
    const element = await waitForEditableField(selector, labelCandidates);
    if (!element || element.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-field-missing", {
        selector,
        eventName,
        labelCandidates
      });
      InvoiceLogger.showStatusOverlay(`Destination field missing: ${eventName}`, "warn");
      return null;
    }

    await revealElement(element, eventName);
    writeValue(element, value);
    await sleep(VISUAL_FIELD_DELAY_MS);
    await InvoiceLogger.logEvent("info", "destination-content", "destination-field-updated", {
      selector,
      eventName,
      value
    });
    return { selector, value };
  }

  async function setInvoicePeriodRange(selector, referenceDate, labelCandidates = []) {
    const inputs = findInvoicePeriodInputs(selector, labelCandidates);
    if (inputs.length < 2) {
      await InvoiceLogger.logEvent("warn", "destination-content", "invoice-period-inputs-missing", {
        selector,
        labelCandidates
      });
      return null;
    }

    const startDate =
      referenceDate?.from ||
      new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const endDate =
      referenceDate?.to ||
      new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

    await revealElement(inputs[0], "Obracunsko razdoblje");
    writeValue(inputs[0], formatCroatianDate(startDate, false));
    await sleep(VISUAL_FIELD_DELAY_MS);
    writeValue(inputs[1], formatCroatianDate(endDate, false));
    await sleep(VISUAL_FIELD_DELAY_MS);

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

  async function applyLineItemRules(extractedRows) {
    const sourceRowsByName = groupSourceRowsByName(extractedRows);
    const destinationRows = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows));
    const results = [];

    for (const row of destinationRows) {
      const destinationName =
        row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent?.trim() || "";
      const normalizedDestinationName = normalizeText(destinationName);
      if (!normalizedDestinationName) {
        continue;
      }

      const matchingSourceRows = sourceRowsByName.get(normalizedDestinationName) || [];
      if (matchingSourceRows.length > 0) {
        const updateResult = await updateDestinationLineItem(row, destinationName, matchingSourceRows.shift());
        results.push(updateResult);
        continue;
      }

      const quantity = getDestinationQuantity(row);
      if (quantity === 0) {
        results.push({
          type: "already-zero",
          destinationName
        });
        continue;
      }

      const zeroResult = await zeroOutDestinationLineItem(row, destinationName, quantity);
      results.push(zeroResult);
    }

    await InvoiceLogger.logEvent("info", "destination-content", "line-item-rules-applied", results);
    return results;
  }

  function groupSourceRowsByName(extractedRows) {
    const groups = new Map();

    for (const row of extractedRows) {
      const name = normalizeText(getSourceLineItemName(row));
      if (!name) {
        continue;
      }

      if (!groups.has(name)) {
        groups.set(name, []);
      }

      groups.get(name).push(row);
    }

    return groups;
  }

  async function zeroOutDestinationLineItem(row, destinationName, previousQuantity) {
    await revealElement(row, `Stavka ${destinationName}`);
    emphasizeElement(row, "rgba(217, 119, 6, 0.24)");
    const editContext = await openLineItemEditor(row, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const quantityUpdated = setEditorFieldValue(editContext, ["Kolicina"], "0");
    if (quantityUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }
    const unitPriceUpdated = setEditorFieldValue(
      editContext,
      ["Jedinicna cijena artikla", "Neto cijena artikla"],
      "0"
    );
    if (unitPriceUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }
    const netAmountUpdated = setEditorFieldValue(editContext, ["Neto iznos stavke"], "0");
    if (netAmountUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }

    if (!quantityUpdated && !unitPriceUpdated && !netAmountUpdated) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-zero-fields-missing", {
        destinationName
      });
      return {
        type: "zero-fields-missing",
        destinationName,
        previousQuantity
      };
    }

    await saveLineItemEditor(editContext);

    await InvoiceLogger.logEvent("info", "destination-content", "line-item-zeroed", {
      destinationName,
      previousQuantity
    });

    return {
      type: "zeroed",
      destinationName,
      previousQuantity
    };
  }

  async function updateDestinationLineItem(row, destinationName, sourceRow) {
    const sourceQuantityRaw = getSourceFieldValue(sourceRow, ["Naplacene jedinice"]);
    const sourceUnitPriceRaw = getSourceFieldValue(sourceRow, ["Ocijenite"]);
    const sourceNetAmountRaw = getSourceFieldValue(sourceRow, ["Potrosnja zatvorenika"]);
    const sourceQuantity = parseLocaleNumber(sourceQuantityRaw);
    const sourceUnitPrice = parseLocaleNumber(sourceUnitPriceRaw);
    const sourceNetAmount = parseLocaleNumber(sourceNetAmountRaw);
    const currentQuantity = getDestinationQuantity(row);
    const currentNetAmount = getDestinationNetAmount(row);

    if (
      areNumbersClose(currentQuantity, sourceQuantity) &&
      areNumbersClose(currentNetAmount, sourceNetAmount)
    ) {
      return {
        type: "already-synced",
        destinationName,
        quantity: sourceQuantity,
        netAmount: sourceNetAmount
      };
    }

    await revealElement(row, `Stavka ${destinationName}`);
    emphasizeElement(row, "rgba(21, 94, 239, 0.22)");
    const editContext = await openLineItemEditor(row, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const quantityUpdated = sourceQuantityRaw
      ? setEditorFieldValue(editContext, ["Kolicina"], normalizeNumericInput(sourceQuantityRaw))
      : false;
    if (quantityUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }
    const unitPriceUpdated = sourceUnitPriceRaw
      ? setEditorFieldValue(
          editContext,
          ["Jedinicna cijena artikla", "Neto cijena artikla"],
          normalizeNumericInput(sourceUnitPriceRaw)
        )
      : false;
    if (unitPriceUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }
    const netAmountUpdated = sourceNetAmountRaw
      ? setEditorFieldValue(
          editContext,
          ["Neto iznos stavke"],
          normalizeNumericInput(sourceNetAmountRaw)
        )
      : false;
    if (netAmountUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }

    if (!quantityUpdated && !unitPriceUpdated && !netAmountUpdated) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-update-fields-missing", {
        destinationName,
        sourceQuantityRaw,
        sourceUnitPriceRaw,
        sourceNetAmountRaw
      });
      return {
        type: "update-fields-missing",
        destinationName,
        quantity: sourceQuantity,
        unitPrice: sourceUnitPrice,
        netAmount: sourceNetAmount
      };
    }

    await saveLineItemEditor(editContext);
    await InvoiceLogger.logEvent("info", "destination-content", "line-item-updated", {
      destinationName,
      quantity: sourceQuantity,
      unitPrice: sourceUnitPrice,
      netAmount: sourceNetAmount
    });

    return {
      type: "updated",
      destinationName,
      quantity: sourceQuantity,
      unitPrice: sourceUnitPrice,
      netAmount: sourceNetAmount
    };
  }

  function findLineItemEditButton(row) {
    const editIcon = row.querySelector(DESTINATION_CONFIG.lineItems.editButton);
    return editIcon?.closest("button") || null;
  }

  async function waitForLineItemEditor(timeoutMs = 3000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const editorRoot = document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot);
      if (editorRoot) {
        return {
          mode: "modal",
          editorRoot
        };
      }

      const inlineRow = findActiveInlineEditorRow();
      if (inlineRow) {
        return {
          mode: "inline",
          editorRoot: inlineRow
        };
      }
      await sleep(150);
    }

    return null;
  }

  async function openLineItemEditor(row, destinationName) {
    if (isInlineEditableRow(row)) {
      const saveButton = findInlineSaveButton(row);
      if (!saveButton) {
        await InvoiceLogger.logEvent("warn", "destination-content", "line-item-save-missing", {
          destinationName,
          mode: "inline"
        });
        return {
          ok: false,
          result: {
            type: "save-button-missing",
            destinationName
          }
        };
      }

      await revealElement(row, `Urednik stavke ${destinationName}`);
      return {
        ok: true,
        mode: "inline",
        editorRoot: row,
        saveButton
      };
    }

    const editButton = findLineItemEditButton(row);
    if (!editButton) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-edit-missing", {
        destinationName
      });
      return {
        ok: false,
        result: {
          type: "missing-edit-button",
          destinationName
        }
      };
    }

    await revealElement(editButton, `Uredi stavku ${destinationName}`);
    editButton.click();
    await sleep(300);

    const editorState = await waitForLineItemEditor();
    if (!editorState?.editorRoot) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-editor-missing", {
        destinationName
      });
      return {
        ok: false,
        result: {
          type: "editor-not-opened",
          destinationName
        }
      };
    }

    const saveButton =
      editorState.mode === "inline"
        ? findInlineSaveButton(editorState.editorRoot)
        : findActionButton(editorState.editorRoot, ["Spremi", "Save", "OK", "Potvrdi"]);
    if (!saveButton) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-save-missing", {
        destinationName,
        mode: editorState.mode
      });
      return {
        ok: false,
        result: {
          type: "save-button-missing",
          destinationName
        }
      };
    }

    return {
      ok: true,
      mode: editorState.mode,
      editorRoot: editorState.editorRoot,
      saveButton
    };
  }

  async function saveLineItemEditor(editContext) {
    await revealElement(editContext.saveButton, "Spremi stavku");
    emphasizeElement(editContext.saveButton, "rgba(34, 197, 94, 0.24)");
    editContext.saveButton.click();
    await waitForEditorToClose(editContext, editContext.mode === "inline" ? 1200 : 4000);
    await sleep(editContext.mode === "inline" ? 120 : 250);
  }

  async function waitForEditorToClose(editContext, timeoutMs = 4000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (editContext.mode === "inline") {
        if (
          !isInlineEditableRow(editContext.editorRoot) ||
          !findInlineSaveButton(editContext.editorRoot)
        ) {
          return true;
        }
      } else if (!document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot)) {
        return true;
      }
      await sleep(150);
    }

    return false;
  }

  function setEditorFieldValue(editContext, labelCandidates, value) {
    if (editContext.mode === "inline") {
      return setInlineLineItemFieldValue(editContext.editorRoot, labelCandidates, value);
    }

    return setLabeledFieldValue(editContext.editorRoot, labelCandidates, value);
  }

  function setInlineLineItemFieldValue(row, labelCandidates, value) {
    const selector = getInlineFieldSelector(labelCandidates);
    if (!selector) {
      return false;
    }

    const field = row.querySelector(selector);
    if (!field || field.disabled) {
      return false;
    }

    revealElementSync(field);
    writeValue(field, value);
    return true;
  }

  function getInlineFieldSelector(labelCandidates) {
    const normalized = labelCandidates.map((label) => normalizeText(label));

    if (normalized.some((label) => label.includes("KOLICINA"))) {
      return 'input#quantity, input[name="quantity"]';
    }

    if (
      normalized.some(
        (label) => label.includes("JEDINICNA CIJENA ARTIKLA") || label.includes("NETO CIJENA ARTIKLA")
      )
    ) {
      return 'input#price_allowanceCharge_baseAmount, input[name="price_allowanceCharge_baseAmount"]';
    }

    if (normalized.some((label) => label.includes("NETO IZNOS STAVKE"))) {
      return 'input#lineExtensionAmount:not([disabled]), input[name="lineExtensionAmount"]:not([disabled])';
    }

    return "";
  }

  function setLabeledFieldValue(root, labelCandidates, value) {
    for (const candidate of labelCandidates) {
      const normalizedCandidate = normalizeText(candidate);
      const labels = Array.from(root.querySelectorAll("label"));
      const label = labels.find(
        (item) => normalizeText(item.textContent || "").includes(normalizedCandidate)
      );

      if (!label) {
        continue;
      }

      const fieldId = label.getAttribute("for");
      const explicitField = fieldId ? root.querySelector(`#${CSS.escape(fieldId)}`) : null;
      const field =
        explicitField ||
        label.closest(".ant-form-item")?.querySelector("input, textarea") ||
        label.parentElement?.parentElement?.querySelector("input, textarea");

      if (!field || field.disabled) {
        continue;
      }

      revealElementSync(field);
      writeValue(field, value);
      return true;
    }

    return false;
  }

  function isInlineEditableRow(row) {
    if (!row) {
      return false;
    }

    return Boolean(row.querySelector(DESTINATION_CONFIG.lineItems.inlineEditableSelector));
  }

  function findActiveInlineEditorRow() {
    return (
      Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find((row) =>
        isInlineEditableRow(row)
      ) || null
    );
  }

  function findInlineSaveButton(row) {
    const saveIcon = row?.querySelector(DESTINATION_CONFIG.lineItems.saveButton);
    return saveIcon?.closest("button") || null;
  }

  function findActionButton(root, labelCandidates) {
    const buttons = Array.from(root.querySelectorAll("button"));
    return (
      buttons.find((button) => {
        const text = normalizeText(button.textContent || "");
        return labelCandidates.some((candidate) => text.includes(normalizeText(candidate)));
      }) || null
    );
  }

  function getDestinationQuantity(row) {
    const cells = row.querySelectorAll("td");
    return parseLocaleNumber(cells[3]?.textContent || "");
  }

  function getDestinationNetAmount(row) {
    const cells = row.querySelectorAll("td");
    return parseLocaleNumber(cells[8]?.textContent || "");
  }

  function findDestinationRowByNormalizedName(normalizedDestinationName) {
    return Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find((row) => {
      const destinationName = row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || "";
      return normalizeText(destinationName) === normalizedDestinationName;
    }) || null;
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

  function getSourceFieldValue(row, candidateHeaders) {
    return (
      candidateHeaders
        .map((header) => {
          const normalizedHeader = normalizeText(header);
          const directValue = row?.[header];
          if (directValue != null && String(directValue).trim()) {
            return directValue;
          }

          return Object.entries(row || {}).find(([key, value]) => {
            return normalizeText(key) === normalizedHeader && String(value || "").trim();
          })?.[1];
        })
        .find((value) => value != null && String(value).trim()) || ""
    );
  }

  function writeValue(element, value) {
    if (!element) {
      return;
    }

    emphasizeElement(element);

    if (element.matches("input, textarea")) {
      setReactInputValue(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      return;
    }

    element.textContent = value;
  }

  async function revealElement(element, label = "") {
    if (!element || typeof element.scrollIntoView !== "function") {
      return;
    }

    revealElementSync(element);
    await InvoiceLogger.logEvent("info", "destination-content", "element-revealed", { label });
    await sleep(VISUAL_SCROLL_DELAY_MS);
  }

  function revealElementSync(element) {
    if (!element || typeof element.scrollIntoView !== "function") {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
    emphasizeElement(element, "rgba(59, 130, 246, 0.22)");
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

  function parseFinancialPeriod(value) {
    const matches = String(value || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\./g);
    if (!matches || matches.length < 2) {
      return null;
    }

    const [from, to] = matches.map(parseCroatianDateToken);
    if (!from || !to) {
      return null;
    }

    return { from, to };
  }

  function parseCroatianDateToken(token) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.$/.exec(String(token || "").trim());
    if (!match) {
      return null;
    }

    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  function normalizeText(value) {
    return (value || "")
      .replace(/[đĐðÐ]/g, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(\d+\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function normalizeNumericInput(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/EUR/gi, "")
      .trim();
  }

  function parseLocaleNumber(value) {
    const normalized = String(value || "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    return Number.parseFloat(normalized) || 0;
  }

  function roundCurrency(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function formatLocaleAmount(value) {
    const numeric = Number(value) || 0;
    const prefix = numeric < 0 ? "-" : "";
    return `${prefix}${Math.abs(numeric).toFixed(2).replace(".", ",")}`;
  }

  function areNumbersClose(left, right) {
    return Math.abs((left || 0) - (right || 0)) < 0.005;
  }

  function getRowNumericId(row) {
    const cells = row.querySelectorAll("td");
    const idText = cells[DESTINATION_CONFIG.resultsIdCellIndex]?.textContent || "";
    return Number.parseInt(idText.replace(/\D+/g, ""), 10) || 0;
  }

  function summarizeSearchRow(row) {
    const cells = row.querySelectorAll("td");
    return {
      id: normalizeText(cells[DESTINATION_CONFIG.resultsIdCellIndex]?.textContent || ""),
      invoiceNumber: normalizeText(
        cells[DESTINATION_CONFIG.resultsInvoiceNumberCellIndex]?.textContent || ""
      ),
      customer: normalizeText(cells[DESTINATION_CONFIG.resultsCustomerCellIndex]?.textContent || "")
    };
  }

  function emphasizeElement(element, color = "rgba(255, 196, 0, 0.32)") {
    if (!element || !element.style) {
      return;
    }

    const previousTransition = element.style.transition;
    const previousBoxShadow = element.style.boxShadow;
    const previousOutline = element.style.outline;
    const previousBackground = element.style.backgroundColor;

    element.style.transition = "box-shadow 0.18s ease, outline 0.18s ease, background-color 0.18s ease";
    element.style.boxShadow = `0 0 0 4px ${color}`;
    element.style.outline = "2px solid rgba(21, 94, 239, 0.75)";
    element.style.backgroundColor = color;

    window.setTimeout(() => {
      element.style.transition = previousTransition;
      element.style.boxShadow = previousBoxShadow;
      element.style.outline = previousOutline;
      element.style.backgroundColor = previousBackground;
    }, 2000);
  }

  function findEditableField(selector, labelCandidates = []) {
    const directHit = selector ? document.querySelector(selector) : null;
    if (directHit) {
      return directHit;
    }

    return findInputByLabels(labelCandidates);
  }

  async function waitForEditableField(selector, labelCandidates = [], timeoutMs = 4000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const element = findEditableField(selector, labelCandidates);
      if (element) {
        return element;
      }
      await sleep(150);
    }

    return findEditableField(selector, labelCandidates);
  }

  async function waitForEditableDocumentReady(timeoutMs = 6000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const invoiceField = document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber);
      const paymentNoteField = findEditableField(
        DESTINATION_CONFIG.editableDocumentSelectors.paymentNote,
        DESTINATION_CONFIG.editableDocumentLabels.paymentNote
      );
      const issueDateField = findEditableField(
        DESTINATION_CONFIG.editableDocumentSelectors.issueDate,
        DESTINATION_CONFIG.editableDocumentLabels.issueDate
      );

      if (invoiceField && paymentNoteField && issueDateField) {
        return true;
      }

      await sleep(200);
    }

    return false;
  }

  function findInvoicePeriodInputs(selector, labelCandidates = []) {
    const directHits = selector ? Array.from(document.querySelectorAll(selector)) : [];
    if (directHits.length >= 2) {
      return directHits;
    }

    const container = findFormItemByLabels(labelCandidates);
    return container ? Array.from(container.querySelectorAll("input")) : [];
  }

  function findInputByLabels(labelCandidates = []) {
    const container = findFormItemByLabels(labelCandidates);
    return container?.querySelector("input, textarea") || null;
  }

  function findFormItemByLabels(labelCandidates = []) {
    const normalizedCandidates = labelCandidates.map((candidate) => normalizeText(candidate));
    if (!normalizedCandidates.length) {
      return null;
    }

    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((label) => {
      const text = normalizeText(label.textContent || "");
      return normalizedCandidates.some((candidate) => text.includes(candidate));
    });

    return match?.closest(".ant-form-item") || null;
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
