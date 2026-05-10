# VNS Logistics Website — Project Context

## What Is This?

This is an internal + public-facing web system for **VNS Logistics Services Phils. Corp.**, a Philippine trucking and cargo company operating since 1995. The project is a multi-page HTML/CSS/JS website with both a **public marketing landing page** and **internal operational modules**.

---

## Tech Stack

- **Pure HTML, CSS, JavaScript** (no frameworks)
- **Google Fonts** — Inter
- **GSAP + ScrollTrigger** (CDN) for scroll animations
- **localStorage** for temporary data storage in internal modules
- **Google Apps Script** (planned backend endpoint, not yet connected)
- File structure is flat — all files live in the same folder on the desktop

---

## Pages / Files

### `index.html` — Public Landing Page
The main marketing site. Sections:
- **Hero** — Animated dashboard mockup with floating cards (truck card, GPS status card, route map)
- **Scroll-bound canvas animation** — 96 pre-extracted `.webp` frames played back on a `<canvas>` element as the user scrolls (`video-scroll.js` + GSAP ScrollTrigger). Frames are in a `/frames/` folder.
- **Services grid** — 6 service cards (Warehouse transfers, Container hauling, Forwarding, Industrial hauling, GPS dispatch, Client reporting)
- **Fleet section** — Red gradient section listing truck types and fleet stats (90 employees, 100+ trucks)
- **Parallax image divider** — `images/control-room.png` used as a scroll-parallax divider
- **Technology section** — Styled monitor card showing fake fleet tracking UI
- **Clients section** — Coca-Cola, San Miguel, 2GO, Ginebra, CEMEX
- **About section**
- **Contact / Quote form** — Currently a demo form (not wired up)

### `styles.css` — Global Stylesheet
Shared across all pages. Uses CSS custom properties (`--red`, `--ink`, `--line`, etc.). Includes:
- Layout utilities (`.container`, `.section-pad`, `.btn`)
- Component styles (nav, hero, cards, tables, forms)
- Parallax and scroll animation classes (`.reveal`, `.parallax-image-divider`)
- Canvas/video scroll styles (`.video-scroll-section`, `.video-scroll-sticky`)
- Module-specific styles for repair, garage monitoring, inventory

### `video-scroll.js` — Canvas Frame Animation
Preloads 96 `.webp` frames from `/frames/frame_0000.webp` to `frame_0095.webp`. Uses GSAP ScrollTrigger to scrub through frames as the user scrolls through the `#video-scroll` section. Also animates 3 text overlays (`.video-text-1/2/3`) with fade + slide transitions.

### `cash.html` — Cash / PO / Bali Log Module (Internal)
An internal operations tool for parsing **Viber group chat messages** from truck plate-number groups. Features:
- Paste Viber messages into a textarea
- Click "Parse Message" to extract structured records
- Editable table with 17 columns: date, time, sender, plate number, type (Budget/Bali/Diesel PO/Payroll), person name, role, GCash number, amount, PO number, liters, fuel station, route, balance after payroll, review status, remarks
- Summary stats (total budget, total bali, PO count, total liters)
- Save to `localStorage` temporarily
- Planned: send to Google Sheets via Apps Script
- Script: `cash.js`

### `parts-inventory.html` — Parts Inventory Module (Internal)
A stock tracking system for truck spare parts, oil, tires, and safety equipment. Features:
- **4 tabs**: Inventory Master, Parts In, Parts Out, Movement History
- **Summary stats**: Total item types, low stock, out of stock, total value, parts out this month
- **Inventory Master**: Filterable table by item name, type, category, make, brand, stock status
- **Parts In form**: Record received/purchased/returned/repaired stock. Fields include date, plate number (optional for new stock), item name, type, category, make, brand, model, part number, serial/engine/chassis numbers, unit, quantity, unit cost (auto-calculates total), supplier, storage location, receipt no., received by, remarks
- **Parts Out form**: Record stock released to a truck. Plate number required. Fields include release info, item details, quantity/cost, released to, requested by, repair request ID, odometer, work done/purpose, remarks
- **Movement History**: Full log of all Parts In and Parts Out transactions
- Script: `parts-inventory.js`

### Other Pages (not open but referenced in nav)
- `portal.html` — Internal system portal / hub page linking to all modules
- `repair.html` — Repair & maintenance request module
- `parallax.js` — Handles scroll-based parallax for hero elements and image dividers
- `script.js` — General site script (nav toggle, reveal animations, etc.)
- `cash.js` — Logic for the Cash/PO/Bali parser
- `parts-inventory.js` — Logic for the inventory module

---

## Design System

| Token | Value |
|---|---|
| `--red` | `#d71920` (VNS brand red) |
| `--red-dark` | `#a70f15` |
| `--ink` | `#171717` |
| `--muted` | `#6b7280` |
| `--soft` | `#f6f7f9` |
| `--line` | `#e7e7ea` |
| `--shadow` | `0 24px 70px rgba(18,18,18,.14)` |
| `--radius` | `28px` |

Font: **Inter** (400–900 weights). Design style: clean, premium, dark accents, glassmorphism cards on the hero.

---

## Current Status / Notes

- The canvas scroll animation requires a `/frames/` folder with 96 `.webp` image frames (extracted from a truck video). If frames are missing, the scroll section shows blank.
- `cash.js` and `parts-inventory.js` use `localStorage` as temporary storage. The plan is to eventually POST data to a Google Apps Script endpoint that writes to Google Sheets.
- The quote form on `index.html` is a demo — it shows an alert on submit. It is not yet connected to email or a backend.
- `parallax.js` and `video-scroll.js` are separate to avoid conflicts (Lenis was removed; only GSAP ScrollTrigger is used).
- All images referenced: `images/control-room.png`, `images/hero-truck.png`, `images/fleet-yard.png`
