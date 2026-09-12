# Indiana Re-Entry Vault

A private, client-side, zero-knowledge dashboard and statutory deadline tracker for Indiana criminal record expungement and re-entry under **Indiana Code § 35-38-9 (Second Chance Law)**.

Runs **100% in the user's browser**. No servers, no tracking, no cloud databases, and no telemetry.

---

## Key Features

### 1. Client-Side Persistent Vault (`IndexedDB`)
* Stores cases, cause numbers, court orders, and generated PDF packets locally in the browser using the `IndianaReEntryVault` IndexedDB database.
* Far exceeds `localStorage` 5MB string limits — supports full binary PDF document storage.
* Built-in **Export Vault (JSON)**, **Restore Backup**, and **Wipe Local Data** controls.
* Live browser storage quota monitor via `navigator.storage.estimate()`.

### 2. Indiana Statutory Timeline & Deadlines Engine
* **Trial Rule 6(A) Computation**: Automatically rolls deadlines falling on weekends and Indiana legal court holidays forward to the next judicial business day.
* **Prosecutor 30-Day Response Window**: Calculates the 30-day objection window following petition filing.
* **365-Day Multi-County Clock (IC § 35-38-9-9(h))**: Tracks the lifetime statutory window across multi-county convictions.
* **Post-Order Service Checklist**: Generates verified service steps for serving certified orders on the Indiana State Police (ISP) Criminal History Repository, Bureau of Motor Vehicles (BMV), and local arresting agencies.
* **RFC 5545 iCalendar (`.ics`) Exporter**: Download upcoming deadlines and import them directly into Google Calendar, Apple Calendar, or Outlook with zero cloud syncing.

### 3. Guided Intake with Real-Time Cause Number Parser
* Type any standard Indiana cause number (e.g. `49D01-1805-F6-000123`) to auto-detect:
  * County (e.g. Marion County)
  * Court (e.g. Marion Superior Court 1)
  * Offense Tier & Statutory Section (e.g. Level 6 Felony / Tier 3)
* Direct JSON import compatibility with **The Expunger**.

### 4. Verified Indiana 92-County Directory
* Instant lookup for verified court clerk addresses, prosecuting attorney service offices, sheriffs, and Odyssey e-filing codes across all 92 Indiana counties.
* Statewide service addresses for the Indiana State Police and Indiana Bureau of Motor Vehicles.

---

## Getting Started

### Prerequisites
* Node.js v18+ (No npm install required — runs with zero external npm dependencies).

### Running Locally
```bash
# Clone or navigate to the repository
cd D:\tools\reentry-dashboard

# Start the zero-dependency local dev server
npm start
# or: node server.js
```
Open `http://localhost:3300` in your web browser.

### Running Tests
```bash
npm test
```

---

## Architecture

```text
reentry-dashboard/
├── index.html                 # Semantic single page application
├── server.js                  # Zero-dependency local development server
├── package.json               # Lightweight scripts & metadata
├── css/
│   └── dashboard.css          # Design system, accessible palette, dark/light theme
├── js/
│   ├── app.js                 # Application orchestrator and modal handlers
│   ├── vault.js               # IndexedDB persistence layer (IndianaReEntryVault v1)
│   ├── timeline.js            # Statutory deadline math (Trial Rule 6(A)) & .ics generation
│   ├── ui.js                  # Dynamic DOM renderers (Cards, calendar, modals)
│   └── lib/                   # Extracted legal domain engines
│       ├── eligibility.js     # Statutory classification & date evaluation
│       ├── county-directory.js# Verified 92-county court & prosecutor directory
│       ├── pdf-generator.js   # Indiana Trial Rule 10 court pleading generator
│       └── pdf-lib.min.js     # Client-side PDF manipulation engine
└── tests/
    └── timeline.test.js       # Node native unit tests
```

---

## Legal Safeguards & Pro Se Disclaimer

* **Not Legal Advice**: This software is a document-formatting and deadline-tracking aid for pro se litigants. It does not provide legal advice, legal representation, or guarantee court outcomes.
* **Statutory Lifetime Restriction**: Under IC § 35-38-9-9(i), a person may petition for expungement of convictions only once in their lifetime. Omitting a conviction may permanently bar its expungement.
