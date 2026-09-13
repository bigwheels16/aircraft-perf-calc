# Takeoff & Landing Performance Calculator

A fast, lightweight, 100% client-side Single Page Application (SPA) designed for general aviation pilots to rapidly compute takeoff and landing performance distances based on manufacturer Pilot's Operating Handbook (POH) data.

---

## Table of Contents
1. [Overview](#overview)
2. [Supported Aircraft](#supported-aircraft)
3. [Key Features & Calculation Engine](#key-features--calculation-engine)
4. [Input Guide & Parameter Reference](#input-guide--parameter-reference)
5. [Interpolation & Physics Rules](#interpolation--physics-rules)
6. [Tech Stack & Architecture](#tech-stack--architecture)
7. [Local Development & Testing](#local-development--testing)
8. [Deployment Guide (Firebase Hosting)](#deployment-guide-firebase-hosting)
9. [Aviation Safety Disclaimer](#aviation-safety-disclaimer)

---

## Overview

Accurate preflight takeoff and landing distance calculations are critical to flight safety. Traditional manual table lookups and multi-step chart interpolations can be time-consuming and error-prone.

This application digitizes tabular POH performance data for popular general aviation aircraft and executes real-time trilinear interpolation across weight, pressure altitude, and outside air temperature, applying environmental adjustments for wind component and runway surface.

### 100% Offline Client-Side Architecture
- **Zero External Network Calls**: Runs entirely within the user's browser once loaded.
- **Offline Reliability**: Continues functioning without an active internet connection—ideal for flight lines, remote grass strips, or in-cockpit tablet use.
- **In-Memory State**: No user flight data is persisted or transmitted to third-party servers.

---

## Supported Aircraft

| Aircraft Model | Configuration / Engine | POH Tabular Gross Weight Range | Tabular Altitudes | Tabular Temperatures |
| :--- | :--- | :--- | :--- | :--- |
| **Cessna 172N Skyhawk** | Lycoming O-320-H2AD (160 HP) | 1,600 – 2,400 lbs | 0 – 8,000 ft PA | 0°C – 40°C (32°F – 104°F) |
| **Piper Archer II (PA-28-181)** | Lycoming O-360-A4M (180 HP) | 1,600 – 2,400 lbs | 0 – 8,000 ft PA | 0°C – 40°C (32°F – 104°F) |

---

## Key Features & Calculation Engine

- **Multilinear (Trilinear) Interpolation**:
  Computes continuous performance values from 3D POH grid matrices (Weight $\times$ Pressure Altitude $\times$ Temperature) using sequential 1D linear interpolation across each axis.
- **Simultaneous Dual Distance Output**:
  Displays both **Ground Roll** (distance required to lift off or stop) and **Total Distance to Clear a 50-Foot Obstacle** side-by-side. 50-foot clearance is calculated as an output metric, never an input.
- **Density Altitude Computation**:
  Derives Density Altitude (DA) using standard International Standard Atmosphere (ISA) lapse rates and outside temperature differentials, alerting the pilot when performance degradation is expected.
- **Wind Corrections**:
  - **Headwind**: Automatically reduces ground roll and obstacle clearance distances per POH rules (-10% distance per 9 knots).
  - **Tailwind**: Increases distances (+10% distance per 2 knots) and warns when tailwinds exceed safe operational limits (> 10 knots).
- **Runway Surface Corrections**:
  Calculates distance penalties for turf/grass runways (+15% of ground roll added to both ground roll and 50ft clearance).
- **POH Envelope Boundary Protections**:
  Identifies inputs exceeding published POH charts (e.g., temperatures above 40°C or pressure altitudes above 8,000 ft), clamps calculations to chart limits, and surfaces clear advisory warnings.

---

## Input Guide & Parameter Reference

### 1. Aircraft Selection
- **Cessna 172N**: Standard flaps setting per POH (Takeoff: Flaps 0° / Flaps 10°; Landing: Flaps 40°).
- **Piper Archer II**: Standard flaps setting per POH (Takeoff: Flaps 0° / 25°; Landing: Flaps 40°).

### 2. Operation
- **Takeoff**: Computes ground roll to unstick and total distance to reach 50 feet AGL.
- **Landing**: Computes landing distance from a 50-foot obstacle and subsequent ground roll to a full stop.

### 3. Runway Surface
- **Paved, Dry**: Standard baseline hard surface (asphalt/concrete).
- **Grass / Dirt**: Unpaved dry turf. Applies a +15% ground roll penalty to account for rolling friction and reduced braking effectiveness.

### 4. Gross Weight
- Enter current aircraft takeoff or landing gross weight in pounds (lbs).
- **Validation**: Enforces aircraft weight bounds (1,600 – 2,400 lbs). Inputs outside this range display a validation warning and clamp to the nearest envelope bound.

### 5. Field Elevation & Altimeter Setting (QNH)
- **Field Elevation**: Enter departure airport elevation in feet MSL.
- **Altimeter Setting (QNH)**: Enter local barometric pressure in inches of mercury (inHg, valid range: 26.00 – 32.00 inHg, default: 29.92 inHg).
- **Automatic Pressure Altitude Derivation**:
  Pressure altitude (PA) is derived automatically using the standard barometric lapse rate (direct manual entry of pressure altitude is no longer used):
  $$\text{Pressure Altitude} = \text{Field Elevation (ft)} + (29.92 - \text{Altimeter Setting}) \times 1,000$$
  *Example:* Field elevation 1,500 ft with QNH 29.72 inHg:
  $$\text{PA} = 1500 + (29.92 - 29.72) \times 1000 = 1,700\text{ ft}$$

### 6. Temperature
- Numeric outside air temperature (OAT) with an instant **°C** / **°F** toggle.
- Conversions are computed automatically ($T_{^\circ\text{C}} = (T_{^\circ\text{F}} - 32) \times \frac{5}{9}$).

### 7. Wind Component
- Numeric wind velocity in knots.
- **Headwind / Tailwind Toggle**: Select whether the runway wind component is a headwind or tailwind.
- *Default:* 0 knots (calm wind).

---

## Interpolation & Physics Rules

### Trilinear Interpolation Algorithm
For an arbitrary input point $(w, a, t)$ bounded by tabular points $(w_0, w_1)$, $(a_0, a_1)$, and $(t_0, t_1)$:
1. **Temperature Axis**: Interpolates temperature at each of the 4 bounding (weight, altitude) vertices:
   $$v_{w, a} = v(w, a, t_0) + \frac{t - t_0}{t_1 - t_0} \cdot [v(w, a, t_1) - v(w, a, t_0)]$$
2. **Altitude Axis**: Interpolates between the altitude bounds using the temperature-resolved values:
   $$v_w = v_{w, a_0} + \frac{a - a_0}{a_1 - a_0} \cdot [v_{w, a_1} - v_{w, a_0}]$$
3. **Weight Axis**: Resolves the final value across the two bounding weights:
   $$v = v_{w_0} + \frac{w - w_0}{w_1 - w_0} \cdot [v_{w_1} - v_{w_0}]$$

### Density Altitude Formula
- Standard ISA temperature at pressure altitude $PA$ is computed as:
  $$T_{\text{ISA}} = 15 - \left(\frac{PA}{1000}\right) \times 2$$
- Density altitude $DA$ is derived from:
  $$DA = PA + 118.8 \times (T_{\text{OAT}} - T_{\text{ISA}})$$
- When $DA > PA + 2000\text{ ft}$, the application triggers a high density altitude performance advisory.

### Correction Modifiers
- **Headwind**:
  $`\text{Distance}_{\text{adjusted}} = \text{Distance}_{\text{base}} \times \left(1.0 - \frac{\text{Wind}}{9} \times 0.10\right)`$
- **Tailwind**:
  $`\text{Distance}_{\text{adjusted}} = \text{Distance}_{\text{base}} \times \left(1.0 + \frac{\text{Wind}}{2} \times 0.10\right)`$
- **Grass Runway**:
  - Ground roll: $`\text{GroundRoll}_{\text{adjusted}} = \text{GroundRoll}_{\text{base}} \times 1.15`$
  - 50ft obstacle clearance: $`\text{Clearance50ft}_{\text{adjusted}} = \text{Clearance50ft}_{\text{base}} + (\text{GroundRoll}_{\text{base}} \times 0.15)`$

---

## Tech Stack & Architecture

- **UI Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite 6](https://vite.dev/)
- **Test Runner**: [Vitest](https://vitest.dev/)
- **Linting**: ESLint 9 with TypeScript rules
- **Hosting Target**: Firebase Hosting (Static CDN distribution)

### Source Directory Layout
```
aircraft-performance-calc/
├── firebase.json              # Firebase Hosting and security headers configuration
├── index.html                 # Main HTML entrypoint
├── package.json               # Dependencies and build/test scripts
├── src/
│   ├── App.tsx                # Main React UI component and reactive state
│   ├── data/
│   │   ├── c172n.ts           # Cessna 172N takeoff & landing POH datasets
│   │   └── archer2.ts         # Piper Archer II takeoff & landing POH datasets
│   └── engine/
│       ├── types.ts           # POHDataset, PerformanceInput, and PerformanceOutput types
│       ├── interpolation.ts   # 1D and 3D multilinear interpolation algorithms
│       ├── performance.ts     # Core calculation engine, environmental adjustments, and warnings
│       └── __tests__/
│           └── performance.test.ts # Vitest automated test suite
└── dist/                      # Production build output
```

---

## Local Development & Testing

### Prerequisites
- Node.js (version 18+ recommended)
- npm (bundled with Node.js)

### Installation
Clone the repository and install dependencies:
```bash
cd /workspace/aircraft-performance-calc
npm install
```

### Development Server
Start the Vite local development server with Hot Module Replacement (HMR):
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### Running Tests
Execute the unit test suite covering POH tabular verification, trilinear interpolation, wind/surface corrections, and density altitude calculations:
```bash
npm test
```

### Production Build & Preview
Compile TypeScript and bundle optimized static assets:
```bash
npm run build
```
Preview the production build locally:
```bash
npm run preview
```

### Running Locally with Docker (Live-Reload)
You can run the container locally with instant Hot Module Replacement (HMR) live-reloading:
```cmd
run_local.bat
```
This builds the dev container image ([`Dockerfile.dev`](./Dockerfile.dev)), mounts your workspace directory into the container with polling watch enabled, serves the app on `http://localhost:8086`, and opens your default browser. Any changes you make to the code will automatically hot-reload in the browser without restarting Docker. Pressing any key in the console stops and cleans up the container.

---

## Deployment Guide (Firebase Hosting)

The application is optimized for deployment to [Firebase Hosting](https://firebase.google.com/docs/hosting), providing global CDN distribution, automatic HTTPS, and zero ongoing server maintenance.

### Configuration (`firebase.json`)
The application includes a production-ready `firebase.json` configuration:
- **Public Directory**: `dist`
- **SPA Rewrites**: All routes rewrite to `/index.html`
- **Strict Security Headers**:
  - `Content-Security-Policy: script-src 'self'` (prevents unauthorized external script injection)
  - `X-Content-Type-Options: nosniff` (mitigates MIME-type sniffing attacks)
  - `X-Frame-Options: DENY` (prevents clickjacking via iframes)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enforces HTTPS)

### Deployment Steps
1. Install the Firebase CLI (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```
2. Authenticate with Google:
   ```bash
   firebase login
   ```
3. Build the production bundle:
   ```bash
   npm run build
   ```
4. Deploy to Firebase Hosting:
   ```bash
   firebase deploy --only hosting
   ```

---

## Aviation Safety Disclaimer

> [!WARNING]
> **FOR SUPPLEMENTARY FLIGHT PLANNING USE ONLY**
>
> This application is intended solely as an educational and supplementary flight planning tool. It is **NOT** a certified flight computer and does not replace the official FAA-approved Airplane Flight Manual (AFM) or Pilot’s Operating Handbook (POH) issued by the aircraft manufacturer.
>
> In accordance with 14 CFR § 91.3, the **Pilot in Command (PIC)** is directly responsible for, and is the final authority as to, the safe operation of that aircraft. Pilots must verify all calculated values against official AFM/POH charts, heed all manufacturer operating limitations, and factor in actual aircraft condition, runway slope, contamination, atmospheric humidity, and engine degradation before commencing flight operations.
