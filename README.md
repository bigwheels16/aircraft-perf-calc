# Aircraft Performance Calculator

A client-side web application for calculating takeoff, climb, and landing performance for general aviation aircraft using digitized Pilot's Operating Handbook (POH) data.

---

## Project Overview

The **Aircraft Performance Calculator** provides pilots with fast, accurate takeoff, climb, and landing performance estimates. All calculations run entirely in the browser using pre-digitized POH performance tables and nomograms, ensuring full offline capability in cockpit or remote flight planning environments without requiring external network requests.

*Note: This application is an informational flight planning aid and demonstration tool. It does not replace official aircraft Pilot's Operating Handbooks (POH), FAA regulations, or sound pilot judgment.*

---

## Core Capabilities

- **Data-Driven Fleet Selection**: Dynamically select aircraft by tail number via a dropdown menu populated directly from the fleet configuration.
- **Multilinear Interpolation**: Performs tri-linear interpolation across 3D grids of gross weight, pressure altitude, and outside air temperature.
- **Dual Distance Calculations**: Computes and displays ground roll and total distance to clear a 50-foot obstacle for takeoff and landing.
- **Climb Performance**: Calculates rate of climb (ROC), climb gradient (ft/NM and %), estimated climb groundspeed, and cumulative time, distance, and fuel to cruise altitude.
- **Environmental Corrections**: Accounts for headwind/tailwind components, runway surface conditions (paved vs. dry grass/turf), and user-defined safety buffers (0–100%).
- **Interactive POH Figure & Nomogram Viewer**: View original POH chart figures with an interactive overlay tracing calculation lines (temperature, pressure altitude, reference line, gross weight, and performance output).
- **Interactive Data Table Viewer**: Inspect underlying POH data tables with real-time cell highlighting for current operating parameters.
- **Safe State Persistence**: Automatically preserves user inputs in `localStorage` with built-in prototype pollution defenses and fallback recovery.

---

## Architecture & Data Overview

- **100% Client-Side Architecture**: Built with **React 19**, **TypeScript**, and **Vite**. Packaged as a static bundle deployable to any static host (Firebase Hosting, Cloud Run, Nginx, or GitHub Pages).
- **Fleet & Chart Data Model**: Performance models, 3D interpolation tables (`src/data/fleet.json`), and calibrated chart coordinate mappings (`src/data/nomogram_meta.json`) are structured as JSON data. Adding new aircraft or updating figures is entirely data-driven.

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
