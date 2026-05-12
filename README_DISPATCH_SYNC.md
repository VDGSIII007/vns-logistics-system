# VNS Dispatch Google Sheets Sync

This setup is for the Dispatch / Trip Monitoring module.

The table is controlled by:

- `dispatch.html`
- `dispatch.js`

## Central Spreadsheet

Use the existing central spreadsheet:

```text
VNS Central Dispatch API
1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0
```

Main dispatch tabs:

- `Bottle`
- `Sugar`
- `PreformResin`
- `CapsCrown`

Report tabs:

- `Bottle_Report`
- `Sugar_Report`
- `PreformResin_Report`
- `CapsCrown_Report`

Shared lookup/API tabs:

- `Suppliers`
- `IMEI_Map`
- `Warehouse_Plants`
- `Commodity`
- `Material_Description`
- `Status_List`
- `Geofences Area`
- `Settings`

Sugar has 28 columns. Bottle, PreformResin, and CapsCrown have 37 columns. The Apps Script reads each tab's row 1 headers and writes only into matching columns, so it does not force one shared layout.

## Commodity Mapping

- `Bottle` -> `Bottle`
- `Sugar` -> `Sugar`
- `Preform / Resin` -> `PreformResin`
- `Caps / Crown` -> `CapsCrown`
- `All` is display only and does not write to a sheet

Report mapping:

- `Bottle` -> `Bottle_Report`
- `Sugar` -> `Sugar_Report`
- `Preform / Resin` -> `PreformResin_Report`
- `Caps / Crown` -> `CapsCrown_Report`

## Source Audit

Before copying headers or importing old data, run:

```js
auditSourceTabs()
```

The audit inspects:

- Bottle source: `1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4`
- Sugar source: `1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE`
- PreformResin source: `1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw`
- CapsCrown source: `1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw`

It writes results to `Source_Audit` in the central file:

- spreadsheet name
- source spreadsheet ID
- tab name
- column count
- row 1 headers as JSON
- first 3 sample rows as JSON

It does not import old source data, does not overwrite old source files, and does not write to VNS TRUCK MONITORING DISPATCH.

## Apps Script Setup

1. Open `VNS Central Dispatch API`.
2. Go to **Extensions -> Apps Script**.
3. Paste the contents of `GOOGLE_APPS_SCRIPT_DISPATCH_SYNC.js`.
4. Set a private shared key:

```js
const VNS_SYNC_KEY = "CHANGE_THIS_SECRET_KEY";
```

The central spreadsheet ID is already set in the script:

```js
const SPREADSHEET_ID = "1qO4G8XUmQpMo60Ju5MhLvKBWTxwsIpU2oOFOYOnqwS0";
```

## Deploy

1. Click **Deploy -> New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone with the link**.
5. Copy the Web App URL.

## Frontend Setup

In `dispatch.js`, set:

```js
const GOOGLE_SCRIPT_URL = "PASTE_WEB_APP_URL_HERE";
const VNS_SYNC_KEY = "CHANGE_THIS_SECRET_KEY";
```

Use the same `VNS_SYNC_KEY` value in Apps Script and `dispatch.js`.

## Test

Health endpoint:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=health
```

Audit endpoint:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=auditSourceTabs&syncKey=CHANGE_THIS_SECRET_KEY
```

Fetch all trips:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=getAllTrips&syncKey=CHANGE_THIS_SECRET_KEY
```

Expected frontend behavior:

- Placeholder URL/key shows `Local only`.
- Add Trip saves locally first, then saves to the correct commodity tab.
- Cell edits debounce for 800ms, then save to the correct commodity tab.
- Mark Delivered sets delivered/log timestamps and appends or updates the matching report tab.
- Add to Logs sets `Logged_At` and appends or updates the matching report tab.
- CSV export still works from local data.
- Failed save shows `Save failed` and does not delete local data.

