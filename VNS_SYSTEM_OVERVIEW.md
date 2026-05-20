# VNS Logistics System — Full Overview for Codex

> **Purpose:** This document is the authoritative reference for AI coding agents (Codex, GitHub Copilot, local LLMs) working on the VNS Logistics internal system. Read this before touching any file.

---

## 1. Company

**VNS Logistics Services Phils. Corp.** — Philippine trucking and cargo company, operating since 1995. Clients include Coca-Cola, San Miguel, 2GO, Ginebra, CEMEX. The system supports daily fleet and staff operations.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML5, CSS3, JavaScript (ES2020+) — **no frameworks** |
| Fonts | Google Fonts — Inter (400–900) |
| Animations | GSAP + ScrollTrigger (CDN, landing page only) |
| Local storage | `localStorage` (all modules use this for prototype data) |
| Planned backend | Google Apps Script → Google Sheets |
| Active backend | Cloudflare Worker (`workers/push-worker/`) + Supabase |
| Push notifications | Web Push API, service worker (`service-worker.js`) |
| Auth (planned) | Frontend role preview only via `auth.js` |

**Critical rule: Do NOT introduce React, Vue, build tools, or npm-required frontend dependencies.**

---

## 3. File Structure

```
/ (project root — flat structure on desktop)
├── index.html                  Public landing page
├── portal.html                 Internal module hub
├── repair.html                 Repair & Maintenance module
├── payroll.html                Payroll module
├── cash.html                   Cash / PO / Bali log module
├── parts-inventory.html        Parts inventory module
├── tire-monitoring.html        Tire monitoring module
├── expenses.html               Expenses module
├── dispatch.html               Dispatch module
├── budget-balance.html         Budget & Balance Center
├── master-data.html            Master data management
├── approval-center.html        Approval center (Mother/Admin)
├── payment-queue.html          Payment queue (Sister/Admin)
├── incident-report.html        Incident Report module ← NEW
│
├── styles.css                  Global stylesheet (shared across all pages)
├── script.js                   Shared general scripts (nav, mobile menu, etc.)
├── auth.js                     Frontend role-preview auth (not real auth)
├── push-config.js              Push notification config
├── notifications.js            Notification center logic
├── service-worker.js           Web Push service worker
│
├── cash.js                     Cash module JS
├── dispatch.js                 Dispatch module JS
├── expenses.js                 Expenses module JS
├── master-data.js              Master data JS
├── parts-inventory.js          Parts inventory JS
├── payment-queue.js            Payment queue JS
├── approval-center.js          Approval center JS
├── payroll.js                  Payroll module JS
├── tire-monitoring.js          Tire monitoring JS
├── budget-balance.js           Budget & Balance JS
├── incident-report.js          Incident Report JS ← NEW
│
├── parallax.js                 Parallax scroll (landing page)
├── video-scroll.js             Canvas frame animation (landing page)
│
├── workers/push-worker/        Cloudflare Worker (backend service)
│   └── src/
│       ├── index.js            Worker router — all API routes
│       ├── payroll-api.js      Payroll API endpoints
│       ├── repair-api.js       Repair API endpoints
│       ├── cash-api.js         Cash API endpoints
│       └── ...
│
├── supabase/                   SQL migration and seed files
│   ├── payroll-foundation.sql  payroll_records, person_balances, payroll_balance_events
│   ├── payroll-rate-matrix.sql payroll_rate_matrix, payroll_trip_lines
│   └── ...
│
├── tools/                      Node.js utility scripts (not served to browser)
│   └── import-2go-route-matrix-from-active-trucks.mjs
│
├── imports/                    Staging area for imported data files
│   └── 2go-active-truck-history/
│
├── vns_memory/                 AI memory pack — read before editing
│   ├── 00_READ_ME_FIRST.md
│   ├── 01_VNS_BUSINESS_CONTEXT.md
│   ├── 02_CURRENT_PROJECT_STATUS.md
│   ├── 03_REPAIR_SYSTEM_RULES.md
│   ├── 04_REPAIR_PRICING_REFERENCE.md
│   ├── 05_GPS_ITRACKCARE_RULES.md
│   ├── 06_GOOGLE_SHEET_COLUMNS.md
│   └── 07_AI_CODING_INSTRUCTIONS.md
│
├── images/                     Public image assets
├── frames/                     96 .webp frames for canvas animation
└── appscript/                  Google Apps Script files (not deployed yet)
```

---

## 4. Module Reference

### 4.1 `index.html` — Public Landing Page
- Hero with animated dashboard mockup
- Canvas scroll animation (96 .webp frames, `video-scroll.js`)
- Services grid, fleet stats, clients, about, contact form
- GSAP + ScrollTrigger for reveal animations
- **Do not touch unless styling the public site.**

### 4.2 `portal.html` — Internal Module Hub
- Grid of portal cards linking to each internal module
- Notification bell and role preview dropdown
- **Update when adding a new module (add a portal card).**

### 4.3 `repair.html` / `script.js` — Repair & Maintenance
- Parse Viber repair messages into structured records
- Manual entry form with 40+ fields
- Media evidence (photo/video, Google Drive links)
- Status flow: New → Under Review → Approved → In Progress → Done
- Cost breakdown: parts, labor, outside shop, towing, other
- `localStorage` key: `vnsRepairRequests`

### 4.4 `payroll.html` / `payroll.js` — Payroll Module
- Multi-tab: Trip Encoder, Deductions, Review, Records, Rate Matrix, Budget Balance
- Driver/helper salary from rate matrix per route
- Expense deductions (toll, passway, diesel, lagay, mano, allowance)
- Approval flow: Draft → For Approval → Approved → For Deposit → Deposited
- Syncs to Cloudflare Worker → Supabase
- `localStorage` keys: `vnsPayrollRecords`, `vnsPayrollTruckMaster`, `vnsPayrollPersonBalances`
- **Sensitive — do not touch without explicit instruction.**

### 4.5 `cash.html` / `cash.js` — Cash / PO / Bali Log
- Parse Viber messages from truck plate groups
- Extract: Budget, Bali, Diesel PO, Payroll Balance records
- 17-column table with editable fields
- `localStorage` key: `vnsCashRecords`

### 4.6 `parts-inventory.html` / `parts-inventory.js` — Parts Inventory
- 4 tabs: Inventory Master, Parts In, Parts Out, Movement History
- Tracks item name, type, category, make, brand, stock, unit cost
- `localStorage` keys: `vnsInventoryItems`, `vnsInventoryMovements`

### 4.7 `tire-monitoring.html` / `tire-monitoring.js` — Tire Monitoring
- 5 tabs: Current Tires, Install/Replace, Rotation, Disposal, Analytics
- EcoVadis disposal compliance tracking
- `localStorage` key: `vnsTireRecords`

### 4.8 `dispatch.html` / `dispatch.js` — Dispatch Module
- Truck trips and commodity tracking
- Commodities: Bottles, Sugar, Preform, Resin, Caps, Crowns
- `localStorage` key: `vnsDispatchTrips`

### 4.9 `expenses.html` / `expenses.js` — Expenses
- View VNS Master Expenses with route filters
- Diesel, toll, trip counts, totals
- `localStorage` key: `vnsExpenseRecords`

### 4.10 `master-data.html` / `master-data.js` — Master Data
- Truck master, driver/helper master, route master
- Shared across payroll, dispatch, repair modules
- `localStorage` key: `vnsTruckMaster`

### 4.11 `budget-balance.html` / `budget-balance.js` — Budget & Balance Center
- Monitor truck budgets, diesel PO, cash advance balances
- Preview payroll deductions before approval
- Syncs to Supabase via Cloudflare Worker

### 4.12 `approval-center.html` / `approval-center.js` — Approval Center
- Mother/Admin dashboard for pending approvals
- Covers payroll, cash, PO, Bali, repair, labor items

### 4.13 `payment-queue.html` / `payment-queue.js` — Payment Queue
- Sister/Admin queue for approved items waiting for release

### 4.14 `incident-report.html` / `incident-report.js` — Incident Report ← NEW
- Log safety, truck, driver, cargo, workplace, and operational incidents
- Photo/video evidence references (no actual upload — references only)
- Corrective action plan with assigned person, target date, follow-up
- Completion and verification tracking
- `localStorage` key: `vnsIncidentReports`
- See Section 7 for full field reference

---

## 5. CSS Design System (`styles.css`)

All styles are in one shared file. **Do not create per-page CSS files unless unavoidable.**

### CSS Custom Properties
```css
--red: #d71920
--red-dark: (darker red)
--ink: #191919
--muted: #5e6470
--line: #e5e7eb (borders)
--soft: #f8f8f8
--radius: 28px
--shadow: 0 30px 80px rgba(0,0,0,0.1)
```

### Key Utility Classes
| Class | Purpose |
|---|---|
| `.container` | Max-width centered wrapper |
| `.section-pad` | Standard vertical padding (96px, 70px mobile) |
| `.eyebrow` | Red uppercase label above headings |
| `.btn` | Base button |
| `.btn-primary` | Red filled button |
| `.btn-outline` | White outlined button |

### Internal Module Patterns
| Class | Purpose |
|---|---|
| `.payroll-card` | White card with border, shadow, padding |
| `.payroll-card-head` | Card header row (title left, actions right) |
| `.payroll-form-grid` | 4-column responsive form grid |
| `.payroll-form-grid label` | Form label with gap grid |
| `.payroll-form-grid input/select/textarea` | Styled form inputs |
| `.payroll-form-grid .wide-field` | Spans 2 columns |
| `.payroll-actions` | Flex row for form action buttons |
| `.payroll-summary-grid` | 4-column summary card grid |
| `.payroll-stat` | Individual summary card (label + big number) |
| `.payroll-tabs` | Tab button container |
| `.payroll-tab-btn` | Tab button (`.active` for current tab) |
| `.payroll-tab-panel` | Tab content panel (`.active` to show) |
| `.payroll-status-line` | Status message below buttons |
| `.module-table` | Standard data table |
| `.module-table th/td` | Table cells |
| `.table-wrap` | Scrollable table container |
| `.status-badge` | Base badge style |
| `.status-draft/submitted/approved/etc.` | Status badge variants |
| `.warning-badge` | Orange warning badge |
| `.ok-badge` | Green ok badge |
| `.button-group` | Flex row of buttons with gap |
| `.danger-outline` | Red outlined danger button |

### Incident-Specific Classes (added in incident-report.html session)
| Class | Purpose |
|---|---|
| `.incident-page` | Body class for incident module |
| `.incident-intro` | Intro section with title and stats |
| `.inc-form-section` | Form section divider block |
| `.inc-section-heading` | Form section heading (uppercase, muted) |
| `.inc-evidence-note` | Yellow info note for evidence section |
| `.inc-file-input` | File input (visually hidden) |
| `.inc-file-label` | Custom file picker label |
| `.inc-file-name` | Shows selected filename |
| `.inc-sev-low/medium/high/critical` | Severity badge variants |
| `.inc-status-new/under-review/ca-required/ca-progress/for-verification/closed/cancelled` | Incident status badge variants |
| `.inc-ca-not-required/pending/in-progress/for-verification/completed/overdue` | CA status badge variants |

---

## 6. localStorage Keys Reference

| Key | Module | Contents |
|---|---|---|
| `vnsRepairRequests` | Repair | Array of repair request records |
| `vnsPayrollRecords` | Payroll | Array of payroll records |
| `vnsPayrollTruckMaster` | Payroll | Truck master data |
| `vnsPayrollPersonBalances` | Payroll | Person balance cache |
| `vnsCashRecords` | Cash | Array of cash/PO/bali records |
| `vnsInventoryItems` | Parts Inventory | Inventory master array |
| `vnsInventoryMovements` | Parts Inventory | Stock movement array |
| `vnsTireRecords` | Tire Monitoring | Tire record array |
| `vnsDispatchTrips` | Dispatch | Trip record array |
| `vnsExpenseRecords` | Expenses | Expense record array |
| `vnsTruckMaster` | Master Data | Truck/driver master array |
| `vnsIncidentReports` | Incident Report | Array of incident records |

**localStorage pattern for all modules:**
```javascript
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem('vnsXxxRecords') || '[]');
  } catch (e) {
    console.warn('Corrupted localStorage — resetting.', e);
    return [];
  }
}
function saveRecords(arr) {
  localStorage.setItem('vnsXxxRecords', JSON.stringify(arr));
}
```

---

## 7. Incident Report Module — Field Reference

**localStorage key:** `vnsIncidentReports`

**ID format:** `VNS-INC-YYYYMMDD-HHMMSS-XXXX` (XXXX = 4-char random alphanumeric)

### Data Model
```javascript
{
  incidentId,           // VNS-INC-... auto-generated
  dateReported,         // YYYY-MM-DD
  timeReported,         // HH:MM
  loggedBy,             // Required
  departmentRole,
  plateNumber,
  driverName,
  helperName,
  incidentDate,         // Required
  incidentTime,
  location,
  incidentType,         // Required — see dropdown options
  severity,             // Required — Low / Medium / High / Critical
  status,               // Required — see dropdown options
  incidentDescription,  // Required
  immediateActionTaken,
  peopleInvolved,
  witnesses,
  remarks,
  photoReference,       // Filename or Google Drive link
  videoReference,       // Filename or Google Drive link
  evidenceNotes,
  correctiveActionRequired,  // Yes / No
  rootCause,            // Required if CA required
  correctiveActionPlan, // Required if CA required
  assignedTo,           // Required if CA required
  targetCompletionDate, // Required if CA required
  followUpDate,
  correctiveActionStatus, // Required if CA required
  completionDate,       // Required if CA status = Completed
  completionNotes,      // Required if CA status = Completed
  verifiedBy,           // Required if CA status = Completed
  verificationRemarks,
  createdAt,            // ISO timestamp
  updatedAt             // ISO timestamp — updated every save
}
```

### Dropdown Options

**Incident Type:** Safety violation, Accident, Truck damage, Cargo issue, GPS issue, Driver behavior, Helper behavior, Workplace issue, Client complaint, Other

**Severity:** Low, Medium, High, Critical

**Incident Status:** New, Under review, Corrective action required, Corrective action in progress, For verification, Closed, Cancelled

**CA Status:** Not required, Pending, In progress, For verification, Completed, Overdue

### Validation Rules
- Always required: `loggedBy`, `incidentDate`, `incidentType`, `severity`, `status`, `incidentDescription`
- Required when `correctiveActionRequired === 'Yes'`: `rootCause`, `correctiveActionPlan`, `assignedTo`, `targetCompletionDate`, `correctiveActionStatus`
- Required when `correctiveActionStatus === 'Completed'`: `completionDate`, `completionNotes`, `verifiedBy`
- Auto-mark overdue: if `targetCompletionDate` is past today and `correctiveActionStatus` is not `Completed` or `Not required`

---

## 8. Backend — Cloudflare Worker + Supabase

The active backend is a **Cloudflare Worker** at `workers/push-worker/`.

### Worker API Routes (in `src/index.js`)
| Route | Method | Handler |
|---|---|---|
| `/api/payroll/list` | GET | List payroll records from Supabase |
| `/api/payroll/create` | POST | Create/update payroll record |
| `/api/payroll/update-status` | POST | Update payroll status |
| `/api/payroll/balances` | GET | List person balances |
| `/api/payroll/balance-event` | POST | Create balance event |
| `/api/payroll/rates` | GET | List payroll rate matrix |
| `/api/payroll/rate-create` | POST | Create/update rate |
| `/api/payroll/trip-lines` | GET | List trip lines |
| `/api/payroll/trip-line-upsert` | POST | Upsert trip line |
| `/api/payroll/trip-lines-bulk-upsert` | POST | Bulk upsert trip lines |
| `/api/repair/*` | Various | Repair records |
| `/api/cash/*` | Various | Cash records |

### Supabase Tables
| Table | Purpose |
|---|---|
| `payroll_records` | Payroll records per payroll run |
| `person_balances` | Driver/helper running balance |
| `payroll_balance_events` | Individual balance change events |
| `payroll_rate_matrix` | Route-based rate defaults |
| `payroll_trip_lines` | Individual trip lines per payroll |
| `repair_requests` | Repair request records |

**Security rule:** Service role key only in Cloudflare Worker secrets. Never in frontend code.

---

## 9. Coding Rules for Codex

1. **No frameworks.** Plain HTML, CSS, JS only.
2. **No rewriting unrelated modules.** Only touch what the task requires.
3. **Reuse shared CSS classes** from `styles.css`. Do not duplicate styles.
4. **localStorage first.** Structure data to map to Google Sheets columns later.
5. **Always validate required fields** before saving. Show clear error messages.
6. **Use fake sample data only** — never commit real driver names, payroll amounts, plate numbers, or GCash numbers.
7. **ID format:** `VNS-{MODULE}-YYYYMMDD-HHMMSS-RAND` (e.g., `VNS-INC-20260520-143022-AB3X`)
8. **Date format:** `YYYY-MM-DD` for storage; format for display only.
9. **Amounts:** Store as numbers. Display as `₱` formatted strings.
10. **Handle corrupted localStorage** safely — try/catch, reset to `[]` with `console.warn`.
11. **CSV export** should include all fields, ISO dates, no private data in demos.
12. **Status badges** use `.status-badge` base class + specific variant class.
13. **Run `git status --short` before committing.** Do not commit unrelated changes.

---

## 10. Navigation Pattern

Every internal module page uses the same nav:
```html
<header class="site-header" id="top">
  <nav class="nav-shell" aria-label="Primary navigation">
    <a href="index.html" class="brand">VNS Logistics</a>
    <!-- notification bell (copy from portal.html) -->
    <button class="menu-toggle" ...>Menu</button>
    <div class="nav-links" id="main-nav">
      <a href="index.html">Home</a>
      <a href="portal.html">System Portal</a>
      <details class="nav-modules">
        <summary>Modules</summary>
        <div class="nav-dropdown">
          <!-- all module links including incident-report.html -->
        </div>
      </details>
      <a href="index.html#contact" class="nav-cta">Request Quote</a>
    </div>
  </nav>
</header>
```

Script tags at bottom of every internal page:
```html
<script src="auth.js"></script>
<script src="push-config.js"></script>
<script src="notifications.js"></script>
<script src="script.js"></script>
<script src="[module].js"></script>
```

---

## 11. Do Not Touch (unless explicitly instructed)

- `index.html` — public landing page
- `parallax.js`, `video-scroll.js` — public page animations
- Any Supabase table schema without explicit migration
- `service-worker.js` — push notification worker
- `workers/push-worker/` security (service role key handling)
- Payroll approval/payment flow logic
- Cash/repair Apps Script integration points

---

*Last updated: 2026-05-20. Maintained by VNS dev session.*
