(function () {
  const DESTINATION_SCRIPT_VERSION = "2026-04-01-destination-v21";
  const RESTRICTED_ORGANIZATION_NAME = "Zatvor u Sisku (314)";
  const VISUAL_SCROLL_DELAY_MS = 550;
  const VISUAL_FIELD_DELAY_MS = 300;
  const TOTAL_OVERLAY_DURATION_MS = 8000;
  const TOTAL_MISMATCH_OVERLAY_DURATION_MS = 5000;
  const SAVE_DELAY_AFTER_TOTALS_MS = 5500;
  const LINE_ITEM_NAME_ALIASES = {
    "VIDEO CALL": "Videopoziv",
    "MEDUNARODNI EU,EEA": "Međunarodni EU,EEA",
    "MEÐUNARODNI EU,EEA": "Međunarodni EU,EEA",
    "MEDUNARODNI EUROPA-1": "Međunarodni EUROPA-1",
    "MEÐUNARODNI EUROPA-1": "Međunarodni EUROPA-1",
    "MEDUNARODNI EUROPA-2": "Međunarodni EUROPA-2",
    "MEÐUNARODNI EUROPA-2": "Međunarodni EUROPA-2",
    "MEDUNARODNI SVIJET-1": "Međunarodni SVIJET-1",
    "MEÐUNARODNI SVIJET-1": "Međunarodni SVIJET-1",
    "MEDUNARODNI SVIJET-2": "Međunarodni SVIJET-2",
    "MEÐUNARODNI SVIJET-2": "Međunarodni SVIJET-2"
  };
  const CANONICAL_LINE_ITEM_NAME_ALIASES = {
    "VIDEO CALL": "VIDEOPOZIV",
    "VIDEOPoziv": "VIDEOPOZIV",
    "VIDEOPOZIV": "VIDEOPOZIV",
    "MEDUNARODNI EU,EEA": "MEDUNARODNI EU,EEA",
    "ME\u00D0UNARODNI EU,EEA": "MEDUNARODNI EU,EEA",
    "ME\u0110UNARODNI EU,EEA": "MEDUNARODNI EU,EEA",
    "MEDUNARODNI EUROPA-1": "MEDUNARODNI EUROPA-1",
    "ME\u00D0UNARODNI EUROPA-1": "MEDUNARODNI EUROPA-1",
    "ME\u0110UNARODNI EUROPA-1": "MEDUNARODNI EUROPA-1",
    "MEDUNARODNI EUROPA-2": "MEDUNARODNI EUROPA-2",
    "ME\u00D0UNARODNI EUROPA-2": "MEDUNARODNI EUROPA-2",
    "ME\u0110UNARODNI EUROPA-2": "MEDUNARODNI EUROPA-2",
    "MEDUNARODNI SVIJET-1": "MEDUNARODNI SVIJET-1",
    "ME\u00D0UNARODNI SVIJET-1": "MEDUNARODNI SVIJET-1",
    "ME\u0110UNARODNI SVIJET-1": "MEDUNARODNI SVIJET-1",
    "MEDUNARODNI SVIJET-2": "MEDUNARODNI SVIJET-2",
    "ME\u00D0UNARODNI SVIJET-2": "MEDUNARODNI SVIJET-2",
    "ME\u0110UNARODNI SVIJET-2": "MEDUNARODNI SVIJET-2"
  };
  const ORGANIZATION_IDENTITIES = [
    {
      sourceAliases: ["Zatvor u Zagrebu (300)", "Zatvor u Zagrebu"],
      finaCustomerName:
        "MINISTARSTVO PRAVOSUĐA I UPRAVE UPRAVA ZA ZATVORSKI SUSTAV I PROBACIJU ZATVOR U ZAGREBU",
      buyerTaxId: "92668153620",
      buyerEndpointId: "92668153620",
      buyerStreetName: "DR. LUJE NALETILIĆA 1"
    }
  ];

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
      buyerRegistrationName: "#formaSudioniciKupacHr_registrationName",
      buyerTaxId: "#formaSudioniciKupacHr_taxSchemeCompanyID",
      buyerEndpointId: "#formaSudioniciKupacHr_endpointID",
      buyerStreetName: "#formaSudioniciKupacHr_address_streetName",
      dueDate: "#formaPodaciDokument_dueDate input",
      issueDate: "#formaPodaciDokument_issueDate input",
      issueTime: "#formaPodaciDokument_issueTime input",
      invoicePeriodInputs: "#formaPodaciDokument .ant-picker-range input",
      paymentNote: "#formaPodaciPlacanje_instructionNote",
      paymentModel: "#formaPodaciPlacanje_modelPaymentID",
      paymentReferenceNumber: "#formaPodaciPlacanje_pozivNaBrojPaymentID"
    },
    editableDocumentLabels: {
      buyerRegistrationName: ["Naziv", "Pretrazi kupca"],
      buyerTaxId: ["OIB ili porezni broj"],
      buyerEndpointId: ["Elektronicka adresa"],
      buyerStreetName: ["Ulica i kucni broj"],
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

    const restrictedCheck = await confirmRestrictedOrganizationAction(
      extractionMeta,
      "upis u FINA racun"
    );
    if (!restrictedCheck.allowed) {
      return {
        message: restrictedCheck.message,
        cancelled: true,
        restrictedCheck
      };
    }

    if (location.pathname === DESTINATION_CONFIG.searchPagePath) {
      return findAndOpenMatchingDocument(extractionMeta);
    }

    return fillCurrentForm(extractedRows, extractionMeta);
  }

  async function findAndOpenMatchingDocument(extractionMeta) {
    const targetIdentity = resolveOrganizationIdentity(extractionMeta);
    if (!targetIdentity.matchCandidates.length) {
      throw new Error("Organization name metadata is missing.");
    }

    InvoiceLogger.showStatusOverlay("Searching matching document", "info");
    await InvoiceLogger.logEvent("info", "destination-content", "destination-search-started", {
      targetIdentity
    });

    const matchingRow = await findMatchingRowAcrossPages(targetIdentity);
    if (!matchingRow) {
      await InvoiceLogger.logEvent("warn", "destination-content", "matching-document-not-found", {
        targetIdentity
      });
      InvoiceLogger.showStatusOverlay("Destination document missing", "warn");
      throw new Error(`Document row not found for "${targetIdentity.displayName}".`);
    }

    emphasizeElement(matchingRow, "rgba(21, 94, 239, 0.22)");
    matchingRow.click();
    await InvoiceLogger.logEvent("info", "destination-content", "matching-document-opened", {
      targetIdentity,
      rowSummary: summarizeSearchRow(matchingRow)
    });
    InvoiceLogger.showStatusOverlay("Matching document opened", "success");

    return { message: `Matching document opened for ${targetIdentity.displayName}.` };
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
      const documentTargetCheck = await ensureEditableDocumentMatchesTarget(extractionMeta);
      const pendingInvoiceNumber = await applyPendingInvoiceNumber();
      const fieldResults = await seedKnownDocumentFields(pendingInvoiceNumber, extractionMeta);
      const lineItemResults = await applyLineItemRules(extractedRows);
      await ensureNoPendingLineItemEditor("after-line-item-rules");
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
        documentTargetCheck,
        fieldResults,
        lineItemResults,
        lineItemMatch,
        totalDifferenceResult,
        saveResult
      };
    }

    const createButton = findCreateFromDocumentButton();

    if (createButton) {
      const duplicationGuardResult = await ensureDocumentOldEnoughForDuplication();
      if (!duplicationGuardResult.allowed) {
        return {
          message: duplicationGuardResult.message,
          duplicationGuardResult
        };
      }

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
          : "Create-from-document triggered.",
        duplicationGuardResult
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

    const storage = await safeGet([
      STORAGE_KEYS.pendingDestinationInvoiceNumber,
      STORAGE_KEYS.extractionMeta
    ]);
    if (!storage[STORAGE_KEYS.pendingDestinationInvoiceNumber]) {
      return;
    }

    await waitForEditableDocumentReady();
    try {
      await ensureEditableDocumentMatchesTarget(storage[STORAGE_KEYS.extractionMeta] || {});
    } catch (error) {
      await InvoiceLogger.logEvent("warn", "destination-content", "auto-repair-target-mismatch", {
        error: error instanceof Error ? error.message : String(error)
      });
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

  async function findMatchingRowAcrossPages(targetIdentity) {
    let pageGuard = 0;

    while (pageGuard < 10) {
      await waitForRows();

      const matchingRows = Array.from(document.querySelectorAll(DESTINATION_CONFIG.resultsRows))
        .filter((row) => {
          const cells = row.querySelectorAll("td");
          const customerCell = cells[DESTINATION_CONFIG.resultsCustomerCellIndex];
          const customerName = normalizeText(customerCell?.textContent || "");
          return targetIdentity.matchCandidates.some(
            (candidate) => customerName.includes(candidate) || candidate.includes(customerName)
          );
        })
        .sort((left, right) => {
          const rightScore = scoreSearchRow(right, targetIdentity);
          const leftScore = scoreSearchRow(left, targetIdentity);
          if (rightScore !== leftScore) {
            return rightScore - leftScore;
          }
          return getRowNumericId(right) - getRowNumericId(left);
        });

      const matchingRow = matchingRows[0] || null;

      if (matchingRow) {
        await InvoiceLogger.logEvent("info", "destination-content", "matching-document-found", {
          targetIdentity,
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
    const activeInlineEditor = findActiveInlineEditorRow();
    const modalEditor = document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot);
    if (activeInlineEditor || modalEditor) {
      await InvoiceLogger.logEvent("warn", "destination-content", "save-document-blocked-editor-open", {
        activeInlineEditor: Boolean(activeInlineEditor),
        modalEditor: Boolean(modalEditor)
      });
      InvoiceLogger.showStatusOverlay("Save current line item first", "warn");
      return {
        type: "line-item-editor-still-open"
      };
    }

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
    const matches = areNumbersClose(difference, 0);
    const level = matches ? "success" : "warn";

    InvoiceLogger.showStatusOverlay(
      message,
      level,
      matches ? TOTAL_OVERLAY_DURATION_MS : TOTAL_MISMATCH_OVERLAY_DURATION_MS,
      {
        position: "center",
        customBackground: matches ? undefined : "#7c3aed",
        blink: !matches
      }
    );
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
    const existingInvoicePeriod = getCurrentInvoicePeriodRange(
      selectors.invoicePeriodInputs,
      labels.invoicePeriod
    );
    const extractedInvoicePeriod = parseFinancialPeriod(extractionMeta?.financialPeriod || "");
    const invoicePeriod = existingInvoicePeriod || extractedInvoicePeriod;

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

  async function ensureEditableDocumentMatchesTarget(extractionMeta) {
    const targetIdentity = resolveOrganizationIdentity(extractionMeta);
    const expectedCustomerRaw = targetIdentity.expectedCustomerRaw;
    const expectedCustomer = normalizeText(expectedCustomerRaw);

    if (!expectedCustomer) {
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-target-missing", "");
      throw new Error("Ne mogu potvrditi kupca jer nedostaje izvorna organizacija.");
    }

    const customerField = await waitForEditableField(
      DESTINATION_CONFIG.editableDocumentSelectors.buyerRegistrationName,
      DESTINATION_CONFIG.editableDocumentLabels.buyerRegistrationName,
      2000
    );
    const taxIdField = await waitForEditableField(
      DESTINATION_CONFIG.editableDocumentSelectors.buyerTaxId,
      DESTINATION_CONFIG.editableDocumentLabels.buyerTaxId,
      800
    );
    const endpointIdField = await waitForEditableField(
      DESTINATION_CONFIG.editableDocumentSelectors.buyerEndpointId,
      DESTINATION_CONFIG.editableDocumentLabels.buyerEndpointId,
      800
    );
    const streetField = await waitForEditableField(
      DESTINATION_CONFIG.editableDocumentSelectors.buyerStreetName,
      DESTINATION_CONFIG.editableDocumentLabels.buyerStreetName,
      800
    );
    const currentCustomerRaw = customerField?.value || customerField?.textContent || "";
    const currentCustomer = normalizeText(currentCustomerRaw);
    const currentTaxIdRaw = taxIdField?.value || taxIdField?.textContent || "";
    const currentEndpointIdRaw = endpointIdField?.value || endpointIdField?.textContent || "";
    const currentStreetRaw = streetField?.value || streetField?.textContent || "";

    if (customerField) {
      await revealElement(customerField, "Kupac");
    }

    if (!currentCustomer) {
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-customer-missing", {
        expectedCustomerRaw
      });
      throw new Error("Ne mogu potvrditi kupca na otvorenom FINA dokumentu.");
    }

    const customerMatches = targetIdentity.matchCandidates.some(
      (candidate) => currentCustomer.includes(candidate) || candidate.includes(currentCustomer)
    );
    const taxIdMatches = !targetIdentity.buyerTaxId || normalizeIdentifier(currentTaxIdRaw) === targetIdentity.buyerTaxId;
    const endpointMatches =
      !targetIdentity.buyerEndpointId ||
      normalizeIdentifier(currentEndpointIdRaw) === targetIdentity.buyerEndpointId;
    const streetMatches =
      !targetIdentity.buyerStreetName ||
      normalizeText(currentStreetRaw).includes(normalizeText(targetIdentity.buyerStreetName));
    const matches = customerMatches && taxIdMatches && endpointMatches && streetMatches;

    if (!matches) {
      const message =
        `Pogresan otvoreni racun. Ocekivani kupac: ${expectedCustomerRaw}. ` +
        `Ocekivani OIB: ${targetIdentity.buyerTaxId || "-"}. ` +
        `Trenutno otvoren: ${currentCustomerRaw}. ` +
        `Trenutni OIB: ${normalizeIdentifier(currentTaxIdRaw) || "-"}.`;
      InvoiceLogger.showStatusOverlay(message, "warn", 7000, { position: "center" });
      await InvoiceLogger.logEvent("warn", "destination-content", "destination-customer-mismatch", {
        expectedCustomerRaw,
        currentCustomerRaw,
        currentTaxIdRaw,
        currentEndpointIdRaw,
        currentStreetRaw,
        targetIdentity
      });
      throw new Error(message);
    }

    await InvoiceLogger.logEvent("info", "destination-content", "destination-customer-verified", {
      expectedCustomerRaw,
      currentCustomerRaw
    });

    return {
      expectedCustomer: expectedCustomerRaw,
      currentCustomer: currentCustomerRaw,
      expectedTaxId: targetIdentity.buyerTaxId || "",
      currentTaxId: normalizeIdentifier(currentTaxIdRaw),
      currentEndpointId: normalizeIdentifier(currentEndpointIdRaw)
    };
  }

  async function ensureDocumentOldEnoughForDuplication() {
    const issueDateField = findDocumentIssueDateField();
    if (issueDateField) {
      await revealElement(issueDateField, "Datum izdavanja dokumenta");
    }

    const issueDateValue = issueDateField?.value?.trim() || getDocumentIssueDateValue();
    if (!issueDateValue) {
      const message = "Ne mogu provjeriti starost otvorenog dokumenta. Dupliciranje je zaustavljeno.";
      InvoiceLogger.showStatusOverlay(message, "error", 7000, { position: "center" });
      await InvoiceLogger.logEvent("warn", "destination-content", "duplication-age-check-missing-date", "");
      return {
        allowed: false,
        message,
        issueDate: "",
        ageDays: null
      };
    }

    const issueDate = parseCroatianDateString(issueDateValue);
    if (!issueDate) {
      const message = `Ne mogu procitati datum otvorenog dokumenta (${issueDateValue}). Dupliciranje je zaustavljeno.`;
      InvoiceLogger.showStatusOverlay(message, "error", 7000, { position: "center" });
      await InvoiceLogger.logEvent("warn", "destination-content", "duplication-age-check-invalid-date", {
        issueDateValue
      });
      return {
        allowed: false,
        message,
        issueDate: issueDateValue,
        ageDays: null
      };
    }

    const today = toStartOfDay(new Date());
    const documentDay = toStartOfDay(issueDate);
    const ageDays = Math.floor((today.getTime() - documentDay.getTime()) / (24 * 60 * 60 * 1000));

    if (ageDays < 28) {
      const message = `Taj dokument vec postoji. Otvoreni dokument je izdan ${formatCroatianDate(issueDate, true)} i star je ${ageDays} dana.`;
      const confirmed = await showExtensionConfirm(`${message} Zelis li ipak nastaviti?`, {
        title: "Dokument vec postoji",
        tone: "error",
        confirmLabel: "Ipak nastavi",
        cancelLabel: "Ne nastavljaj"
      });

      await InvoiceLogger.logEvent(
        "warn",
        "destination-content",
        confirmed ? "duplication-age-check-confirmed-override" : "duplication-age-check-blocked",
        {
          issueDateValue,
          ageDays
        }
      );

      if (!confirmed) {
        return {
          allowed: false,
          message,
          issueDate: issueDateValue,
          ageDays,
          confirmed: false
        };
      }

      InvoiceLogger.showStatusOverlay(
        "Nastavljam unatoc upozorenju da dokument vec postoji.",
        "warn",
        3500,
        { position: "center" }
      );
      return {
        allowed: true,
        message: `Nastavljam iako dokument postoji (${ageDays} dana).`,
        issueDate: issueDateValue,
        ageDays,
        confirmed: true,
        override: true
      };
    }

    await InvoiceLogger.logEvent("info", "destination-content", "duplication-age-check-passed", {
      issueDateValue,
      ageDays
    });
    return {
      allowed: true,
      message: `Otvoreni dokument je dovoljno star za dupliciranje (${ageDays} dana).`,
      issueDate: issueDateValue,
      ageDays
    };
  }

  async function confirmRestrictedOrganizationAction(extractionMeta, actionLabel) {
    const organizationName =
      extractionMeta?.organization ||
      extractionMeta?.organizationSearchName ||
      "";

    if (!isRestrictedOrganization(organizationName)) {
      return {
        allowed: true,
        confirmed: false
      };
    }

    const message = `Upozorenje: organizacija je ${RESTRICTED_ORGANIZATION_NAME}. Zelis li zaista nastaviti za ${actionLabel}?`;
    const confirmed = await showExtensionConfirm(message, {
      title: "Posebna potvrda",
      tone: "warn",
      confirmLabel: "Nastavi",
      cancelLabel: "Ne nastavljaj"
    });

    await InvoiceLogger.logEvent("warn", "destination-content", "restricted-organization-confirmation", {
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

  async function showExtensionConfirm(message, options = {}) {
    if (typeof InvoiceLogger?.showConfirmDialog === "function") {
      return InvoiceLogger.showConfirmDialog(message, options);
    }

    return window.confirm(String(message || ""));
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

  function getCurrentInvoicePeriodRange(selector, labelCandidates = []) {
    const inputs = findInvoicePeriodInputs(selector, labelCandidates);
    if (inputs.length < 2) {
      return null;
    }

    const from = parseFlexibleDateToken(inputs[0]?.value || inputs[0]?.textContent || "");
    const to = parseFlexibleDateToken(inputs[1]?.value || inputs[1]?.textContent || "");
    if (!from || !to) {
      return null;
    }

    return { from, to };
  }

  async function findMatchingLineItem(extractedRows) {
    const sourceRow = extractedRows.find((row) => getSourceLineItemName(row));
    if (!sourceRow) {
      await InvoiceLogger.logEvent("warn", "destination-content", "source-line-item-name-missing", "");
      return null;
    }

    const sourceName = normalizeLineItemName(getSourceLineItemName(sourceRow));
    const matchingRow = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find(
      (row) =>
        normalizeLineItemName(
          row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || ""
        ) === sourceName
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
    const destinationRowDescriptors = getDestinationRowDescriptors();
    const results = [];

    for (const descriptor of destinationRowDescriptors) {
      const destinationName = descriptor.destinationName;
      const normalizedDestinationName = descriptor.normalizedDestinationName;
      if (!normalizedDestinationName) {
        continue;
      }

      const row = findDestinationRowByDescriptor(descriptor);
      if (!row) {
        results.push({
          type: "destination-row-missing",
          destinationName
        });
        await InvoiceLogger.logEvent("warn", "destination-content", "destination-row-missing", {
          destinationName,
          occurrence: descriptor.occurrence
        });
        continue;
      }

      const matchingSourceRows = sourceRowsByName.get(normalizedDestinationName) || [];
      if (matchingSourceRows.length > 0) {
        const updateResult = await updateDestinationLineItem(
          row,
          descriptor,
          destinationName,
          matchingSourceRows.shift()
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

      const zeroResult = await zeroOutDestinationLineItem(row, descriptor, destinationName, quantity);
      results.push(zeroResult);
    }

    await InvoiceLogger.logEvent("info", "destination-content", "line-item-rules-applied", results);
    return results;
  }

  function groupSourceRowsByName(extractedRows) {
    const groups = new Map();

    for (const row of extractedRows) {
      const name = normalizeLineItemName(getSourceLineItemName(row));
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

  function getDestinationRowDescriptors() {
    const occurrenceMap = new Map();

    return Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows))
      .map((row) => {
        const destinationName =
          row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent?.trim() || "";
        const normalizedDestinationName = normalizeLineItemName(destinationName);
        const occurrence = occurrenceMap.get(normalizedDestinationName) || 0;
        occurrenceMap.set(normalizedDestinationName, occurrence + 1);

        return {
          destinationName,
          normalizedDestinationName,
          occurrence
        };
      })
      .filter((descriptor) => descriptor.normalizedDestinationName);
  }

  async function zeroOutDestinationLineItem(row, descriptor, destinationName, previousQuantity) {
    await revealElement(row, `Stavka ${destinationName}`);
    emphasizeElement(row, "rgba(217, 119, 6, 0.24)");
    const editContext = await openLineItemEditor(row, descriptor, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const quantityUpdated = setEditorFieldValue(editContext, ["Kolicina"], "0");
    if (quantityUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }

    if (!quantityUpdated) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-zero-fields-missing", {
        destinationName
      });
      return {
        type: "zero-fields-missing",
        destinationName,
        previousQuantity
      };
    }

    const editorClosed = await saveLineItemEditor(editContext);
    if (!editorClosed) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-save-not-confirmed", {
        destinationName,
        action: "zero"
      });
      return {
        type: "save-not-confirmed",
        destinationName,
        previousQuantity
      };
    }

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

  async function updateDestinationLineItem(row, descriptor, destinationName, sourceRow) {
    const sourceQuantityRaw = getSourceFieldValue(sourceRow, ["Naplacene jedinice", "Charged units"]);
    const sourceUnitPriceRaw = getSourceFieldValue(sourceRow, ["Ocijenite", "Rate"]);
    const sourceQuantity = parseLocaleNumber(sourceQuantityRaw);
    const sourceUnitPrice = parseLocaleNumber(sourceUnitPriceRaw);
    const currentQuantity = getDestinationQuantity(row);
    const currentUnitPrice = getDestinationUnitPrice(row);

    if (!sourceQuantityRaw) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-missing-source-quantity", {
        destinationName
      });
      return {
        type: "missing-source-quantity",
        destinationName
      };
    }

    if (!sourceUnitPriceRaw || !areNumbersClose(currentUnitPrice, sourceUnitPrice)) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-rate-mismatch", {
        destinationName,
        currentUnitPrice,
        sourceUnitPrice,
        sourceUnitPriceRaw
      });
      return {
        type: "rate-mismatch",
        destinationName,
        currentUnitPrice,
        sourceUnitPrice
      };
    }

    if (areNumbersClose(currentQuantity, sourceQuantity)) {
      return {
        type: "already-synced",
        destinationName,
        quantity: sourceQuantity,
        unitPrice: sourceUnitPrice
      };
    }

    await revealElement(row, `Stavka ${destinationName}`);
    emphasizeElement(row, "rgba(21, 94, 239, 0.22)");
    const editContext = await openLineItemEditor(row, descriptor, destinationName);
    if (!editContext.ok) {
      return editContext.result;
    }

    const quantityUpdated = sourceQuantityRaw
      ? setEditorFieldValue(editContext, ["Kolicina"], normalizeNumericInput(sourceQuantityRaw))
      : false;
    if (quantityUpdated) {
      await sleep(VISUAL_FIELD_DELAY_MS);
    }

    if (!quantityUpdated) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-update-fields-missing", {
        destinationName,
        sourceQuantityRaw,
        sourceUnitPriceRaw
      });
      return {
        type: "update-fields-missing",
        destinationName,
        quantity: sourceQuantity,
        unitPrice: sourceUnitPrice
      };
    }

    const editorClosed = await saveLineItemEditor(editContext);
    if (!editorClosed) {
      await InvoiceLogger.logEvent("warn", "destination-content", "line-item-save-not-confirmed", {
        destinationName,
        action: "update-quantity"
      });
      return {
        type: "save-not-confirmed",
        destinationName,
        quantity: sourceQuantity,
        unitPrice: sourceUnitPrice
      };
    }

    await InvoiceLogger.logEvent("info", "destination-content", "line-item-updated", {
      destinationName,
      quantity: sourceQuantity,
      unitPrice: sourceUnitPrice
    });

    return {
      type: "updated",
      destinationName,
      quantity: sourceQuantity,
      unitPrice: sourceUnitPrice
    };
  }

  function findLineItemEditButton(row) {
    const editIcon = row.querySelector(DESTINATION_CONFIG.lineItems.editButton);
    return editIcon?.closest("button") || null;
  }

  async function waitForLineItemEditor(_targetDescriptor = null, timeoutMs = 3000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const inlineRow = findActiveInlineEditorRow();
      if (inlineRow) {
        return {
          mode: "inline",
          editorRoot: inlineRow
        };
      }

      const editorRoot = document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot);
      if (editorRoot) {
        return {
          mode: "modal",
          editorRoot
        };
      }

      await sleep(150);
    }

    return null;
  }

  async function openLineItemEditor(row, descriptor, destinationName) {
    if (isInlineEditorOpenForRow(row)) {
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
        descriptor,
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

    const editorState = await waitForLineItemEditor(descriptor);
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
      descriptor,
      saveButton
    };
  }

  async function saveLineItemEditor(editContext) {
    await revealElement(editContext.saveButton, "Spremi stavku");
    emphasizeElement(editContext.saveButton, "rgba(34, 197, 94, 0.24)");
    editContext.saveButton.click();
    const editorClosed = await waitForEditorToClose(editContext, editContext.mode === "inline" ? 2200 : 4000);
    await sleep(editContext.mode === "inline" ? 120 : 250);
    return editorClosed;
  }

  async function waitForEditorToClose(editContext, timeoutMs = 4000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (editContext.mode === "inline") {
        if (!findActiveInlineEditorRow()) {
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

  function isInlineEditorOpenForRow(row) {
    if (!row) {
      return false;
    }

    return Boolean(findInlineSaveButton(row));
  }

  function findActiveInlineEditorRow() {
    return (
      Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find((row) =>
        isInlineEditorOpenForRow(row)
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

  function getDestinationUnitPrice(row) {
    const cells = row.querySelectorAll("td");
    return parseLocaleNumber(cells[5]?.textContent || "");
  }

  function getDestinationNetAmount(row) {
    const cells = row.querySelectorAll("td");
    return parseLocaleNumber(cells[8]?.textContent || "");
  }

  function findDestinationRowByNormalizedName(normalizedDestinationName) {
    return Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).find((row) => {
      const destinationName = row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || "";
      return normalizeLineItemName(destinationName) === normalizedDestinationName;
    }) || null;
  }

  function findDestinationRowByDescriptor(descriptor) {
    const matchingRows = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).filter(
      (row) => {
        const destinationName = row.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || "";
        return normalizeLineItemName(destinationName) === descriptor.normalizedDestinationName;
      }
    );

    return matchingRows[descriptor.occurrence] || null;
  }

  function doesDestinationRowMatchDescriptor(row, descriptor) {
    if (!row || !descriptor) {
      return false;
    }

    const matchingRows = Array.from(document.querySelectorAll(DESTINATION_CONFIG.lineItems.rows)).filter(
      (candidate) => {
        const destinationName = candidate.querySelector(DESTINATION_CONFIG.lineItems.nameCell)?.textContent || "";
        return normalizeLineItemName(destinationName) === descriptor.normalizedDestinationName;
      }
    );

    return matchingRows[descriptor.occurrence] === row;
  }

  function getSourceLineItemName(row) {
    const candidateHeaders = [
      "Ime/Destinacija tarife",
      "Tariff name/destinations",
      "Tariff name / destinations",
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

    return parseCroatianDateToken(normalized);
  }

  function parseCroatianDateToken(token) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(String(token || "").trim());
    if (!match) {
      return null;
    }

    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  function parseCroatianDateString(value) {
    const normalized = String(value || "")
      .replace(/\s+/g, "")
      .trim();
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(normalized);
    if (!match) {
      return null;
    }

    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  function getDocumentIssueDateValue() {
    const directField = findDocumentIssueDateField();
    if (directField?.value?.trim()) {
      return directField.value.trim();
    }

    const formItem = findFormItemByLabels(DESTINATION_CONFIG.editableDocumentLabels.issueDate);
    const fallbackField = formItem?.querySelector("input");
    if (fallbackField?.value?.trim()) {
      return fallbackField.value.trim();
    }

    return "";
  }

  function findDocumentIssueDateField() {
    const directField = document.querySelector(DESTINATION_CONFIG.editableDocumentSelectors.issueDate);
    if (directField) {
      return directField;
    }

    const formItem = findFormItemByLabels(DESTINATION_CONFIG.editableDocumentLabels.issueDate);
    return formItem?.querySelector("input") || null;
  }

  function toStartOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isRestrictedOrganization(value) {
    const normalized = canonicalizeOrganizationValue(value);
    return (
      normalized === canonicalizeOrganizationValue(RESTRICTED_ORGANIZATION_NAME) ||
      normalized === canonicalizeOrganizationValue("Zatvor u Sisku")
    );
  }

  function resolveOrganizationIdentity(extractionMeta = {}) {
    const sourceValues = [
      extractionMeta?.organization || "",
      extractionMeta?.organizationSearchName || ""
    ].filter(Boolean);

    const matchedIdentity = ORGANIZATION_IDENTITIES.find((identity) =>
      identity.sourceAliases.some((alias) =>
        sourceValues.some(
          (value) => canonicalizeOrganizationValue(value) === canonicalizeOrganizationValue(alias)
        )
      )
    );

    const expectedCustomerRaw =
      matchedIdentity?.finaCustomerName ||
      extractionMeta?.organizationSearchName ||
      extractionMeta?.organization ||
      "";

    const matchCandidates = [
      matchedIdentity?.finaCustomerName,
      extractionMeta?.organizationSearchName,
      extractionMeta?.organization
    ]
      .filter(Boolean)
      .map((value) => normalizeText(value))
      .filter(Boolean);

    return {
      displayName: extractionMeta?.organization || extractionMeta?.organizationSearchName || "",
      expectedCustomerRaw,
      buyerTaxId: matchedIdentity?.buyerTaxId || "",
      buyerEndpointId: matchedIdentity?.buyerEndpointId || "",
      buyerStreetName: matchedIdentity?.buyerStreetName || "",
      matchCandidates: Array.from(new Set(matchCandidates))
    };
  }

  function scoreSearchRow(row, targetIdentity) {
    const cells = row.querySelectorAll("td");
    const customerText = normalizeText(
      cells[DESTINATION_CONFIG.resultsCustomerCellIndex]?.textContent || ""
    );

    let score = 0;
    for (const candidate of targetIdentity.matchCandidates || []) {
      if (!candidate) {
        continue;
      }

      if (customerText === candidate) {
        score += 100;
      } else if (customerText.includes(candidate) || candidate.includes(customerText)) {
        score += 40;
      }
    }

    if (targetIdentity.buyerTaxId) {
      const rowText = normalizeIdentifier(row.textContent || "");
      if (rowText.includes(targetIdentity.buyerTaxId)) {
        score += 80;
      }
    }

    return score;
  }

  function canonicalizeOrganizationValue(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
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

  function normalizeIdentifier(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/^HR/, "")
      .replace(/[^\dA-Z]/g, "");
  }

  function normalizeLineItemName(value) {
    const normalized = normalizeText(value);
    const aliased =
      CANONICAL_LINE_ITEM_NAME_ALIASES[normalized] ||
      LINE_ITEM_NAME_ALIASES[normalized] ||
      normalized;
    return normalizeText(aliased);
  }

  function normalizeNumericInput(value) {
    return normalizeNumericString(value).replace(".", ",");
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

  function roundCurrency(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  async function ensureNoPendingLineItemEditor(stage) {
    const activeInlineEditor = findActiveInlineEditorRow();
    const modalEditor = document.querySelector(DESTINATION_CONFIG.lineItems.modalRoot);
    if (!activeInlineEditor && !modalEditor) {
      return;
    }

    await InvoiceLogger.logEvent("warn", "destination-content", "line-item-editor-still-open", {
      stage,
      activeInlineEditor: Boolean(activeInlineEditor),
      modalEditor: Boolean(modalEditor)
    });
    InvoiceLogger.showStatusOverlay("Save current line item first", "warn");
    throw new Error("Line item editor is still open.");
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
