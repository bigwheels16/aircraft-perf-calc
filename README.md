# Takeoff & Landing Performance Calculator

A fast, lightweight, 100% client-side Single Page Application (SPA) designed for general aviation pilots to rapidly compute takeoff and landing performance distances based on manufacturer Pilot's Operating Handbook (POH) data.

---

## Table of Contents
1. [Overview](#overview)
2. [Supported Fleet](#supported-fleet)
3. [Key Features & Calculation Engine](#key-features--calculation-engine)
4. [Input Guide & Parameter Reference](#input-guide--parameter-reference)
5. [Fleet Configuration & Adding Aircraft](#fleet-configuration--adding-aircraft)
6. [Interpolation & Physics Rules](#interpolation--physics-rules)
7. [Tech Stack & Architecture](#tech-stack--architecture)
8. [Local Development & Testing](#local-development--testing)
9. [Deployment Guide (Firebase Hosting)](#deployment-guide-firebase-hosting)
10. [Aviation Safety Disclaimer](#aviation-safety-disclaimer)

---

## Overview

Accurate preflight takeoff and landing distance calculations are critical to flight safety. Traditional manual table lookups and multi-step chart interpolations can be time-consuming and error-prone.

This application digitizes tabular POH performance data for popular general aviation aircraft and executes real-time trilinear interpolation across weight, pressure altitude, and outside air temperature, applying environmental adjustments for wind component and runway surface.

### 100% Offline Client-Side Architecture
- **Zero External Network Calls**: Runs entirely within the user's browser once loaded.
- **Offline Reliability**: Continues functioning without an active internet connection—ideal for flight lines, remote grass strips, or in-cockpit tablet use.
- **In-Memory State**: No user flight data is persisted or transmitted to third-party servers.

---

## Supported Fleet

The application stores all aircraft configurations in a single consolidated JSON file ([`src/data/fleet.json`](./src/data/fleet.json)), keyed by aircraft tail number:

| Tail Number | Aircraft Model | Configuration / Engine | Certified Gross Weight Range | Tabular Altitudes | Tabular Temperatures |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **N0001** | **Cessna 172N Skyhawk** | Lycoming O-320-H2AD (160 HP) | 1,200 – 2,400 lbs | 0 – 8,000 ft PA | 0°C – 40°C (32°F – 104°F) |
| **N0002** | **Piper Archer II (PA-28-181)** | Lycoming O-360-A4M (180 HP) | 1,500 – 2,550 lbs | 0 – 8,000 ft PA | 0°C – 40°C (32°F – 104°F) |

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
- **Dynamic Dropdown Selector**: The UI dynamically renders an accessible, styled `<select id="aircraft-select">` dropdown menu populated from top-level tail number keys defined in [`src/data/fleet.json`](./src/data/fleet.json). Each dropdown option clearly displays both the tail number and aircraft model (e.g., `N0001 - Cessna 172N Skyhawk`, `N0002 - Piper Archer II (PA-28-181)`).
- **Automatic Envelope & Configuration Adaptation**: Selecting an aircraft instantly updates the weight slider limits to match that specific airframe's `minWeight` and `maxWeight`, dynamically configures available flap settings (e.g., Flaps 0° / 10° for Cessna vs. Flaps 0° / 25° for Archer II), and switches the active climb performance specification.
- **Session Persistence & Safe Fallbacks**: The user's active tail number is saved to `localStorage` (`aircraft_perf_calc_state_v1`). On reload, the app verifies that the stored key exists in `fleet.json` using prototype-safe validation (`Object.prototype.hasOwnProperty`). If an aircraft has been removed or the saved key is invalid, the app automatically and safely defaults to the first available tail number.

### 2. Operation
- **Takeoff**: Computes ground roll to unstick and total distance to reach 50 feet AGL across available flap configurations.
- **Climb**: Computes rate of climb (ROC), climb speeds ($V_x$, $V_y$), service ceiling, and estimated time, distance, and fuel to climb to target cruise altitude.
- **Landing**: Computes landing distance from a 50-foot obstacle and subsequent ground roll to a full stop.

### 3. Runway Surface
- **Paved, Dry**: Standard baseline hard surface (asphalt/concrete).
- **Grass / Dirt**: Unpaved dry turf. Applies a +15% ground roll penalty to account for rolling friction and reduced braking effectiveness.

### 4. Gross Weight
- Enter current aircraft takeoff or landing gross weight in pounds (lbs).
- **Validation**: Dynamically enforces the selected aircraft's certified gross weight envelope (e.g., 1,200 – 2,400 lbs for N0001; 1,500 – 2,550 lbs for N0002). Inputs outside this range display a validation warning and clamp to the nearest valid envelope bound.

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

## Fleet Configuration & Adding Aircraft

All aircraft performance data is centralized in a single plain JSON file: [`src/data/fleet.json`](./src/data/fleet.json). Instead of organizing data by airplane model across separate TypeScript modules, data is keyed directly by individual aircraft **tail numbers** (e.g., `"N0001"`, `"N0002"`).

### JSON File Structure (`fleet.json`)

The top-level structure implements `FleetData` (`Record<string, AircraftData>`):

```json
{
  "N0001": {
    "id": "c172n",
    "name": "Cessna 172N Skyhawk",
    "maxWeight": 2400,
    "minWeight": 1200,
    "takeoff": [
      {
        "id": "takeoff-flaps0-roll",
        "label": "Normal Take-Off · Flaps Up (0°)",
        "configuration": "Flaps Up (0°)",
        "metric": "groundRoll",
        "figure": "POH Section 5",
        "weights": [1600, 2000, 2400],
        "altitudes": [0, 2000, 4000, 6000, 8000],
        "temperatures": [0, 10, 20, 30, 40],
        "data": [
          [
            [448, 493, 538, 582, 627],
            [538, 591, 645, 699, 753],
            [627, 690, 753, 815, 878],
            [717, 788, 860, 932, 1004],
            [807, 887, 968, 1048, 1129]
          ],
          ...
        ]
      }
    ],
    "climb": {
      "tables": [ ... ],
      "vx": 65,
      "vy": 73,
      "serviceCeiling": 14200,
      "timeDistanceFuelFigure": "POH Fig 5-17",
      "profile": [
        { "altitude": 0, "timeMinutes": 0, "distanceNm": 0, "fuelGallons": 0 },
        { "altitude": 2000, "timeMinutes": 2.5, "distanceNm": 3.0, "fuelGallons": 0.7 },
        ...
      ]
    },
    "landing": [ ... ]
  },
  "N0002": {
    "id": "archer2",
    "name": "Piper Archer II (PA-28-181)",
    "maxWeight": 2550,
    "minWeight": 1500,
    "takeoff": [ ... ],
    "climb": { ... },
    "landing": [ ... ]
  }
}
```

### Schema & Data Model Reference

Each aircraft entry (`AircraftData`) in `fleet.json` contains the following fields:

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Machine-readable identifier / model slug (e.g., `'c172n'`, `'archer2'`). |
| `name` | `string` | Full display name shown in the UI dropdown selector alongside the tail number. |
| `maxWeight` | `number` | Maximum certified takeoff and landing gross weight in pounds (lbs). |
| `minWeight` | `number` | Minimum weight boundary of the published POH envelope in pounds (lbs). |
| `takeoff` | `PerformanceTable[]` | Array of performance tables for takeoff ground roll and 50-foot obstacle clearance across available flap settings. |
| `climb` | `ClimbSpec` | Climb specifications, including rate of climb tables, $V_x$, $V_y$, service and absolute ceilings, and cumulative climb profiles. |
| `landing` | `PerformanceTable[]` | Array of performance tables for landing ground roll and 50-foot obstacle clearance across available flap settings. |

#### Performance Table Matrix Format (`PerformanceTable`)

Performance tables represent a 3-dimensional grid matrix indexed across Weight $\times$ Pressure Altitude $\times$ Temperature:
- `weights`: 1D array of weight breakpoints (lbs), sorted in ascending order.
- `altitudes`: 1D array of pressure altitude breakpoints (ft), sorted in ascending order.
- `temperatures`: 1D array of outside air temperature breakpoints (°C), sorted in ascending order.
- `data`: 3D numeric array where `data[w][a][t]` represents the performance metric value at `weights[w]`, `altitudes[a]`, and `temperatures[t]`.
- `metric`: Output metric type (`'groundRoll'` in ft, `'clearance50ft'` in ft, or `'rateOfClimb'` in FPM).
- `configuration`: Flap or aerodynamic configuration label (e.g., `'Flaps Up (0°)'`, `'25° Flaps'`). Tables sharing the same configuration are displayed side-by-side on output cards.

---

### How to Add a New Aircraft to `fleet.json`

To add a new aircraft to the calculator, follow these steps:

#### Step 1: Open `src/data/fleet.json`
Open [`src/data/fleet.json`](./src/data/fleet.json) in your code editor.

#### Step 2: Add a Top-Level Entry Keyed by Tail Number
Create a new JSON key representing the aircraft's unique tail number (e.g., `"N0003"` or `"N734SP"`):

```json
"N0003": {
  "id": "c172s",
  "name": "Cessna 172S Skyhawk SP",
  "maxWeight": 2550,
  "minWeight": 1600,
  "takeoff": [],
  "climb": { "tables": [] },
  "landing": []
}
```

#### Step 3: Populate Takeoff and Landing Performance Tables
Extract tabular data from the aircraft's official POH:
1. Ensure the `weights`, `altitudes`, and `temperatures` breakpoint arrays are strictly monotonically increasing.
2. Structure the `data` 3D array such that outer array rows correspond to `weights`, inner arrays to `altitudes`, and leaf values to `temperatures`.
3. Add entries for both `groundRoll` and `clearance50ft` for each flap setting:
   ```json
   {
     "id": "takeoff-flaps0-roll",
     "label": "Normal Take-Off · Flaps Up (0°)",
     "configuration": "Flaps Up (0°)",
     "metric": "groundRoll",
     "figure": "POH Figure 5-5",
     "weights": [2200, 2400, 2550],
     "altitudes": [0, 2000, 4000, 6000, 8000],
     "temperatures": [0, 10, 20, 30, 40],
     "data": [ ... ]
   }
   ```

#### Step 4: Populate Climb Specifications
Define the aircraft's climb characteristics:
- Add rate-of-climb tables (`metric: "rateOfClimb"`) under `climb.tables`.
- Specify $V_x$ (`vx`) and $V_y$ (`vy`) in knots indicated airspeed (KIAS).
- Define `serviceCeiling` (altitude where ROC drops to 100 FPM) and optional `absoluteCeiling` (altitude where ROC drops to 0 FPM).
- Provide cumulative profile points (`profile`) from sea level for still-air time (minutes), distance (NM), and fuel (gallons).

#### Step 5: Verify and Validate
Run the test suite and production build to ensure JSON syntax correctness, type safety, and calculation accuracy:
```bash
npm test
npm run build
```

#### Step 6: Automatic UI Integration
Because `fleet.json` is bundled directly at build time and the UI dynamically maps over `Object.entries(fleetData)`, the new tail number will **automatically appear in the dropdown selector** with no manual modifications needed in `App.tsx` or any UI component!

---

### Architecture & Security Details

- **Direct Vite Bundling (Zero Network Requests)**:
  `fleet.json` is imported directly via ES modules (`import fleetRaw from './data/fleet.json'`). Vite bundles and parses the JSON at build time, preserving full offline capability without requiring runtime `fetch()` calls or service workers.
- **Prototype Pollution Prevention**:
  Because the active tail number can be loaded from user-controlled browser `localStorage`, the application strictly validates that the key is an actual own-property of the fleet object using `Object.prototype.hasOwnProperty.call(fleet, parsed.aircraft)` before referencing aircraft properties.
- **Fail-Safe Fallbacks**:
  If the stored tail number is missing or invalid (e.g., after an aircraft has been removed from `fleet.json`), the application gracefully falls back to the first available aircraft key (`Object.keys(fleet)[0]`), ensuring the UI never enters an unhandled or blank state.

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
│   ├── App.css                # Styling, responsive grid, and aircraft selector layout
│   ├── components/
│   │   └── DataTableViewer.tsx# Interactive POH tabular matrix inspector modal
│   ├── data/
│   │   └── fleet.json         # Consolidated fleet performance dataset keyed by tail number
│   ├── engine/
│   │   ├── types.ts           # FleetData, AircraftData, PerformanceTable, and ClimbSpec types
│   │   ├── interpolation.ts   # 1D and 3D multilinear interpolation algorithms
│   │   ├── performance.ts     # Core calculation engine, environmental adjustments, and warnings
│   │   └── __tests__/
│   │       └── performance.test.ts # Vitest automated test suite
│   └── utils/
│       ├── storage.ts         # Safe localStorage state persistence and schema validation
│       └── __tests__/
│           └── storage.test.ts # Unit tests for state persistence and fallback sanitization
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
