# BVfon Chrome Extension

Manifest V3 Chrome extension for:

- reading invoice rows from the Telio source table
- storing extracted data in `chrome.storage.local`
- opening and preparing matching documents on the FINA destination side
- local debug logging with retention of 5 days

## Files

- `manifest.json`
- `logger.js`
- `service-worker.js`
- `popup.html`
- `popup.js`
- `source-content.js`
- `destination-content.js`

## Current workflow

1. Open the Telio source page.
2. Click `Extract data` in the extension popup.
3. The extension reads the source table and stores rows in `chrome.storage.local`.
4. Open the FINA destination page.
5. Click `Fill destination`.
6. The extension searches for the matching document, prepares a new document, and fills known fields.

## Logging

Logs are stored locally in `chrome.storage.local`.

Each log contains:

- `id`
- `timestamp`
- `epochMs`
- `level`
- `source`
- `event`
- `details`

Retention rules:

- currently unlimited retention by age
- currently no hard cap on log count
- cleanup still runs on every new log write
- cleanup still runs on service worker startup
- cleanup still runs every 12 hours via `chrome.alarms`
- retention policy can be restored later when needed

## Debug mode

- `off`: stores only `warn` and `error`
- `on`: stores `info`, `warn`, and `error`

Debug mode can be toggled in the popup.

## Load unpacked

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder

## DevTools

Service worker logs:

1. Open `chrome://extensions`
2. Find this extension
3. Open `Service worker`

Content script logs:

1. Open the target page
2. Press `F12`
3. Check the tab console

## Current assumptions

- Source URL:
  `https://www.telioservices.hr/PrisonLevelInvoiceReport/Generate`
- Destination URL:
  `https://digitalneusluge.fina.hr/eRacunB2B/dokument/pretraga`
- Source table selector:
  `table.reportTable`
- Current confirmed mapping:
  - source item name -> matching FINA row by name
  - `Ukupna potrošnja` -> destination quantity field
