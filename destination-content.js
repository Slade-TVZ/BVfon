(function () {
  const DESTINATION_SCRIPT_VERSION = "2026-03-29-destination-v4";

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
      nameCell: "td.naziv_artikla",
      editButton: 'button .anticon-edit, button[aria-label="edit"]',
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
      const pendingInvoiceNumber = await applyPendingInvoiceNumber();
      const fieldResults = await seedKnownDocumentFields(pendingInvoiceNumber, extractionMeta);
      const lineItemResults = await applyLineItemRules(extractedRows);
      const lineItemMatch = await findMatchingLineItem(extractedRows);

      await InvoiceLogger.logEvent("info", "destination-content", "fill-completed", {
        fieldResults,
        lineItemResults,
        lineItemMatch
      });
      InvoiceLogger.showStatusOverlay("Fill completed", "success");

      return {
        message: "Destination form updated.",
        extractionMeta,
        fieldResults,
        lineItemResults,
        lineItemMatch
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
    const targetField = document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.invoiceNumber);
    const currentInvoiceNumber = targetField?.value?.trim() || "";

    if (!targetField || targetField.disabled) {
      await InvoiceLogger.logEvent("warn", "destination-content", "invoice-number-field-missing", "");
      InvoiceLogger.showStatusOverlay("Destination field missing", "warn");
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

  async function seedKnownDocumentFields(pendingInvoiceNumber, extractionMeta) {
    const selectors = DESTINATION_CONFIG.editableDocumentSelectors;
    const updates = [];
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 17);
    const shortReference = buildShortReference(pendingInvoiceNumber);
    const invoicePeriod = parseFinancialPeriod(extractionMeta?.financialPeriod || "");

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

    updates.push(await setInvoicePeriodRange(selectors.invoicePeriodInputs, invoicePeriod || now));

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

    const startDate =
      referenceDate?.from ||
      new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const endDate =
      referenceDate?.to ||
      new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

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

  async function applyLineItemRules(extractedRows) {
    const sourceRowsByName = new Map(
      extractedRows
        .map((row) => {
          const name = normalizeText(getSourceLineItemName(row));
          return name ? [name, row] : null;
        })
        .filter(Boolean)
    );
    const destinationNames = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows))
      .map((row) => row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent?.trim() || "")
      .filter(Boolean);
    const results = [];

    for (const destinationName of destinationNames) {
      const normalizedDestinationName = normalizeText(destinationName);
      if (!normalizedDestinationName) {
        continue;
      }

      const row = findDestinationRowByNormalizedName(normalizedDestinationName);
      if (!row) {
        results.push({
          type: "destination-row-missing",
          destinationName
        });
        continue;
      }

      if (sourceRowsByName.has(normalizedDestinationName)) {
        const updateResult = await updateDestinationLineItem(
          row,
          destinationName,
          sourceRowsByName.get(normalizedDestinationName)
        );
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

  async function zeroOutDestinationLineItem(row, destinationName, previousQuantity) {
    emphasizeElement(row, "rgba(217, 119, 6, 0.24)");
    const editContext = await openLineItemEditor(row, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const { editorRoot, saveButton } = editContext;
    const quantityUpdated = setLabeledFieldValue(editorRoot, ["Kolicina"], "0");
    const unitPriceUpdated = setLabeledFieldValue(
      editorRoot,
      ["Jedinicna cijena artikla", "Neto cijena artikla"],
      "0"
    );
    const netAmountUpdated = setLabeledFieldValue(editorRoot, ["Neto iznos stavke"], "0");

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

    await saveLineItemEditor(saveButton);

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

    emphasizeElement(row, "rgba(21, 94, 239, 0.22)");
    const editContext = await openLineItemEditor(row, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const { editorRoot, saveButton } = editContext;
    const quantityUpdated = sourceQuantityRaw
      ? setLabeledFieldValue(editorRoot, ["Kolicina"], normalizeNumericInput(sourceQuantityRaw))
      : false;
    const unitPriceUpdated = sourceUnitPriceRaw
      ? setLabeledFieldValue(
          editorRoot,
          ["Jedinicna cijena artikla", "Neto cijena artikla"],
          normalizeNumericInput(sourceUnitPriceRaw)
        )
      : false;
    const netAmountUpdated = sourceNetAmountRaw
      ? setLabeledFieldValue(
          editorRoot,
          ["Neto iznos stavke"],
          normalizeNumericInput(sourceNetAmountRaw)
        )
      : false;

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

    await saveLineItemEditor(saveButton);
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
        return editorRoot;
      }
      await sleep(150);
    }

    return null;
  }

  async function openLineItemEditor(row, destinationName) {
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

    editButton.click();
    await sleep(300);

    const editorRoot = await waitForLineItemEditor();
    if (!editorRoot) {
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

    const saveButton = findActionButton(editorRoot, ["Spremi", "Save", "OK", "Potvrdi"]);
    if (!saveButton) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-save-missing", {
        destinationName
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
      editorRoot,
      saveButton
    };
  }

  async function saveLineItemEditor(saveButton) {
    emphasizeElement(saveButton, "rgba(34, 197, 94, 0.24)");
    saveButton.click();
    await waitForEditorToClose();
    await sleep(250);
  }

  async function waitForEditorToClose(timeoutMs = 4000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (!document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot)) {
        return true;
      }
      await sleep(150);
    }

    return false;
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

      writeValue(field, value);
      return true;
    }

    return false;
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
