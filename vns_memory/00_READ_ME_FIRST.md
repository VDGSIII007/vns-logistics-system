# VNS Memory: Read Me First

This folder is the long-term memory pack for the VNS Logistics website and internal operations tools. Future AI tools should read this file first before editing code, planning features, or generating automation.

## Project

VNS Logistics Services Phils. Corp. is a Philippine trucking and cargo company operating since 1995. This project is a flat-file website and internal operations system built with plain HTML, CSS, and JavaScript.

The current project folder is expected to contain pages such as:

- `index.html` - public landing page
- `portal.html` - internal module hub
- `repair.html` - repair and maintenance module
- `payroll.html` - payroll module
- `cash.html` - cash / PO / bali parser
- `expenses.html` - expenses module
- `parts-inventory.html` - parts inventory module
- `styles.css` - shared styling
- `script.js` and module-specific JavaScript files

## How Future AI Tools Should Use This Folder

Read these files in order:

1. `00_READ_ME_FIRST.md` - main instruction file
2. `01_VNS_BUSINESS_CONTEXT.md` - business and user context
3. `02_CURRENT_PROJECT_STATUS.md` - current app status and known gaps
4. `03_REPAIR_SYSTEM_RULES.md` - repair workflow rules
5. `04_REPAIR_PRICING_REFERENCE.md` - starter pricing and cost references
6. `05_GPS_ITRACKCARE_RULES.md` - GPS / iTrackCare tracking rules
7. `06_GOOGLE_SHEET_COLUMNS.md` - planned spreadsheet structure
8. `07_AI_CODING_INSTRUCTIONS.md` - coding rules for Codex, VS Code, Antigravity, and local LLMs

## Prime Directive

Do not damage the existing website. Make small, deliberate changes. Preserve the current flat HTML/CSS/JS structure unless the user explicitly asks for a bigger migration.

## Editing Rules

- Do not delete or rename existing files without explicit user approval.
- Do not rewrite unrelated modules while working on one module.
- Do not move the project to a framework unless requested.
- Keep module logic in its matching JavaScript file when possible.
- Reuse the existing design system in `styles.css`.
- Keep internal tools practical and fast for VNS staff.
- Prefer readable code over clever code.
- Before major edits, inspect the current file and nearby related files.

## Data Safety

VNS tools may involve payroll, repair costs, driver names, plate numbers, phone numbers, and operational records. Treat all real company data as sensitive.

Do not expose private data in public pages, screenshots, commits, examples, or test fixtures. Use fake sample data when needed.

## Local Storage Status

Many modules currently use `localStorage` for temporary records. This is acceptable for prototypes, but long-term storage should move to Google Sheets, Apps Script, Supabase, Firebase, or another approved backend.

## Preferred Build Direction

Short term:

- Stabilize each internal module.
- Add clean forms, validation, summaries, and CSV export where useful.
- Keep data structures consistent with Google Sheet columns.

Medium term:

- Connect forms to Google Apps Script.
- Save records into Google Sheets.
- Add import/export and backups.
- Add simple dashboards for managers.

Long term:

- Add user roles, authentication, audit logs, and cloud database storage if needed.

## Before Pushing Changes

Run through this checklist:

- Confirm only intended files are changed.
- Confirm no real private data is committed.
- Open the edited page in a browser if possible.
- Check mobile and desktop layout.
- Test add/edit/delete flows for internal modules.
- Update this memory folder when business rules change.

## Current Human Preference

The owner wants practical tools for real VNS operations, not over-engineered demos. Build useful screens that save time for dispatch, repair, payroll, cash requests, inventory, and management reporting.
