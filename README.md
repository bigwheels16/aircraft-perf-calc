# Aircraft Performance Calculator

A 100% client-side web application for calculating takeoff, climb, and landing performance for general aviation aircraft using multilinear interpolation of Pilot's Operating Handbook (POH) data.

---

## Overview

The **Aircraft Performance Calculator** provides pilots with fast, accurate takeoff, climb, and landing distance estimates. All calculations run entirely in the browser using pre-digitized POH performance tables, ensuring full offline capability in cockpit or remote flight planning environments without requiring external network requests.

---

## Core Capabilities

- **Data-Driven Fleet Selection**: Dynamically select aircraft by tail number via a dropdown menu populated directly from the fleet configuration.
- **Multilinear Interpolation**: Performs tri-linear interpolation across 3D grids of gross weight, pressure altitude, and outside air temperature.
- **Dual Distance Calculations**: Computes and displays ground roll and total distance to clear a 50-ft obstacle side-by-side.
- **Climb Performance**: Calculates rate of climb (ROC), climb gradient (ft/NM and %), estimated climb groundspeed, and cumulative time, distance, and fuel to cruise altitude.
- **Environmental Corrections**: Accounts for headwind/tailwind components, runway surface conditions (paved vs. dry grass/turf), and user-defined safety buffers (0–100%).
- **Interactive Data Table Viewer**: Inspect underlying POH data tables with real-time cell highlighting for current operating parameters.
- **Safe State Persistence**: Automatically preserves user inputs in `localStorage` with built-in prototype pollution defenses and fallback recovery.

---

## Architecture & Data Model

- **100% Client-Side**: Built with **React 19**, **TypeScript**, and **Vite**. Packaged as a static bundle that can be hosted on any static web server (Firebase Hosting, Cloud Run, Nginx, or GitHub Pages).
- **Fleet Data (`src/data/fleet.json`)**: All aircraft performance models and 3D tables are consolidated into a single plain JSON file keyed by tail number (e.g. `N0001`, `N0002`). Adding or updating an aircraft is completely data-driven and requires no application source code modifications.

---

## Quick Start

### Prerequisites
- Node.js (v20+ recommended)
- npm

### Installation & Development
```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit and integration tests
npm test

# Build production bundle
npm run build
```

---

## Disclaimer

*This application is an informational, supplementary flight planning aid. It does not replace official aircraft Pilot's Operating Handbooks (POH), FAA regulations, or sound pilot judgment. Always consult the approved Flight Manual and POH for your specific airframe prior to flight.*
