# Current Project Status

Last starter memory update: 2026-05-11.

## Stack

- Plain HTML, CSS, and JavaScript
- Flat project structure
- Shared global stylesheet: `styles.css`
- Shared general script: `script.js`
- Module-specific scripts such as `cash.js`, `parts-inventory.js`, and `payroll.js`
- Temporary storage via `localStorage`
- Planned Google Apps Script / Google Sheets backend

## Existing Pages

### `index.html`

Public landing page for VNS Logistics. Includes hero section, scroll animation, services, fleet information, clients, about, and contact form.

Known note: contact/quote form is currently demo-level unless connected later.

### `portal.html`

Internal portal or hub page linking to modules.

### `repair.html`

Repair and maintenance request module. Expected to track truck issues, repair status, cost, parts, mechanic/shop, and completion details.

### `payroll.html`

Payroll module. New or active module. Should be treated carefully because payroll data is sensitive.

### `cash.html`

Cash / PO / Bali parser module for turning Viber-style messages into structured records.

### `expenses.html`

Expense tracking module.

### `parts-inventory.html`

Parts inventory module with inventory master, parts in, parts out, and movement history.

## Existing Data Pattern

The project currently favors browser-side data and `localStorage`. This makes prototypes fast, but it is not a reliable permanent database.

When adding new fields, keep them easy to map into Google Sheets later.

## Known Needs

- Stable Google Sheet column definitions
- Apps Script endpoint planning
- CSV export/import per module
- Validation for required fields
- Consistent date, amount, and plate-number formatting
- Clear print/export views for payroll and reports
- Better persistence beyond `localStorage`

## Current Git Caution

Before committing or pushing, check `git status`. The project may contain multiple changed files at once. Do not include unrelated changes in a commit unless the user explicitly asks.

## Memory Folder Status

The `vns_memory` folder is meant to capture rules, context, and future AI instructions. Keep it updated when workflows or business rules change.
