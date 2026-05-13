# AI Coding Instructions

These instructions are for Codex, VS Code AI tools, Antigravity, local LLMs, and any future coding agent working on the VNS Logistics project.

## Core Rule

Make the smallest useful change that solves the user's request. Do not refactor the whole site unless the user asks.

## Project Style

This project is plain HTML, CSS, and JavaScript. Keep it that way unless the user explicitly approves a framework migration.

Use:

- Semantic HTML
- Shared styles in `styles.css`
- Module-specific JavaScript files
- Browser APIs and simple local data structures
- Clear field names that can map to Google Sheets later

Avoid:

- Unnecessary build tools
- Hidden dependencies
- Large rewrites
- Framework code mixed into the flat site
- Fake private data in committed files

## Before Editing

Always inspect:

- The target HTML file
- The related JavaScript file
- Relevant styles in `styles.css`
- This `vns_memory` folder if business rules matter

## File Ownership

Suggested ownership:

- Public landing page: `index.html`, `styles.css`, `script.js`, `parallax.js`, `video-scroll.js`
- Portal: `portal.html`, shared styles/scripts
- Repair module: `repair.html`, likely `script.js` or future `repair.js`
- Payroll module: `payroll.html`, `payroll.js`
- Cash parser: `cash.html`, `cash.js`
- Inventory: `parts-inventory.html`, `parts-inventory.js`
- Expenses: `expenses.html`, matching JS if present
- Long-term AI notes: `vns_memory/*.md`

## UI Guidelines

Internal tools should be practical:

- Clear page title
- Fast search/filter
- Table with important columns
- Summary cards for totals and pending items
- Required fields clearly marked
- Status badges with consistent colors
- Export or copy options where useful
- Mobile should not break, but desktop operations can be primary

## Agent Workflow

When planning or changing user-facing screens, include a dedicated **UI/UX Agent** in the workflow before implementation.

### UI/UX Agent

Purpose:

- Review existing pages as practical VNS operations tools, not decorative demos.
- Make the interface look more professional while preserving the flat HTML/CSS/JS structure.
- Fix headers, module titles, navigation, cards, tables, forms, and buttons when they no longer fit their containers.
- Check desktop and mobile layouts for wrapping, overflow, cramped spacing, and overlapping text.
- Improve visual hierarchy, spacing, typography, alignment, status badges, and action placement.
- Keep screens fast for dispatch, repair, payroll, cash, expenses, inventory, and management workflows.

Required checks:

- Header text and module titles must fit without clipping or awkward overflow.
- Primary actions should be obvious and reachable.
- Tables and forms should remain readable on smaller screens.
- Shared styling should live in `styles.css` unless a page truly needs a local exception.
- UI polish must not break existing JavaScript behavior, storage keys, exports, or Apps Script integration points.

Handoff expectation:

- The UI/UX Agent should identify affected files, summarize the visual fixes, and request browser verification after implementation.
## Data Guidelines

Use consistent naming:

- `plateNumber`
- `driverName`
- `helperName`
- `recordId`
- `createdAt`
- `updatedAt`
- `status`
- `remarks`

Use numbers for money internally. Format as PHP only for display.

## Local Storage Guidelines

If using `localStorage`:

- Use clear keys, such as `vnsPayrollRecords`.
- Always handle missing or corrupted data safely.
- Add sample seed data only if the user asks.
- Do not store real sensitive data in examples.

## Validation Guidelines

Validate:

- Required fields
- Amounts are valid numbers
- Dates are present when needed
- Plate number is present for truck-related records
- Status values are known

## Git Guidelines

Before committing:

- Run `git status --short`.
- Confirm which files belong in the commit.
- Do not include unrelated user changes.
- Do not commit secrets, real payroll data, credentials, or private screenshots.

## Communication Guidelines

When handing off work:

- State which files changed.
- State what was not touched.
- Mention any tests or manual checks performed.
- Mention blockers clearly.

## Future Backend Direction

Preferred simple backend path:

1. Keep current frontend modules working with `localStorage`.
2. Define Google Sheet columns.
3. Add Apps Script endpoints.
4. POST module records to Apps Script.
5. Add CSV export as backup.
6. Later consider authentication and a real database if needed.

