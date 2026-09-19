import type { PerformanceTable, ClimbSpec, WindCorrection } from './types';
import { gridBounds, interpolate1D, interpolate2D, interpolate3D } from './interpolation';

/**
 * Inputs for a performance table calculation.
 */
export type PerformanceInput = {
  /** Aircraft gross weight in lbs */
  weight: number;
  /** Pressure altitude in ft */
  pressureAltitude: number;
  /** Outside air temperature in °C */
  temperature: number;
  /** Wind speed magnitude in knots */
  windKnots: number;
  /** true = headwind, false = tailwind */
  isHeadwind: boolean;
  /** true = dry paved runway, false = dry grass/turf */
  surfacePaved: boolean;
  /** Optional custom safety buffer 0–100% applied to distance results */
  safetyBufferPercent?: number;
  /** Optional target cruise altitude in ft for climb profile (time, distance, fuel) */
  cruiseAltitude?: number;
};

/**
 * Result of a single PerformanceTable calculation.
 */
export type TableResult = {
  /** The table that produced this result */
  tableId: string;
  /** The metric this result corresponds to */
  metric: import('./types').PerformanceMetric;
  /**
   * Final value after all corrections and safety buffer.
   * For distances: ft (with wind, surface, and buffer applied).
   * For climb: FPM (no surface correction; wind affects gradient only).
   */
  value: number;
  /**
   * Value after wind/surface corrections but BEFORE safety buffer.
   * Equal to `value` when safetyBufferPercent = 0 or for climb.
   */
  baseValue: number;
  /** Computed density altitude in ft */
  densityAltitude: number;
  /** Operational warnings and advisories */
  warnings: string[];
  // Climb-only extras (present when metric === 'rateOfClimb')
  climbGradientFtPerNm?: number;
  climbGradientPercent?: number;
  climbTasKnots?: number;
  climbGroundspeedKnots?: number;
};

/**
 * Start of the warning added when a result uses data extrapolated beyond the printed POH chart.
 * Conservative: it also appears within one grid step of the chart's edge.
 */
export const EXTRAPOLATED_WARNING = 'Conditions are at or beyond the edge of the printed';

const pushOnce = (warnings: string[], warning: string) => {
  if (!warnings.includes(warning)) warnings.push(warning);
};

/** True if any grid point the interpolation draws on is marked as extrapolated beyond the printed chart. */
function usesExtrapolatedData(table: PerformanceTable, weight: number, altitude: number, temperature: number): boolean {
  const ws = contributingIndices(weight, table.weights);
  const as = contributingIndices(altitude, table.altitudes);
  const ts = contributingIndices(temperature, table.temperatures);
  return ws.some(i => as.some(j => ts.some(k => table.extrapolated![i][j][k] === 1)));
}

/** Indices of the grid points that contribute to interpolating at `val` (one when it is on a grid point). */
function contributingIndices(val: number, arr: number[]): number[] {
  const [i0, i1] = gridBounds(val, arr);
  if (val === arr[i0]) return [i0];
  if (val === arr[i1]) return [i1];
  return [i0, i1];
}

/**
 * Apply wind using the POH chart's wind guide lines, the way a pilot follows them:
 * interpolate between the neighbouring lines by zero-wind distance, then read along
 * them to the wind speed.
 *
 * Beyond the chart's wind data the result stays conservative and a warning is added:
 * headwind credit is capped at the chart's highest headwind, and tailwind lines are
 * extended past their printed end.
 */
export function applyChartWind(
  distance: number,
  windKnots: number,
  isHeadwind: boolean,
  wind: WindCorrection,
  warnings: string[]
): number {
  if (windKnots <= 0) return distance;
  const { zeroWindDistances: zero, knots, distances } = isHeadwind ? wind.headwind : wind.tailwind;
  const maxKnots = knots[knots.length - 1];

  let kts = windKnots;
  if (isHeadwind && windKnots > maxKnots) {
    kts = maxKnots;
    warnings.push(`Headwind above ${maxKnots} kts is beyond the POH chart; credit limited to ${maxKnots} kts.`);
  } else if (!isHeadwind && windKnots > maxKnots) {
    warnings.push(`Tailwind above ${maxKnots} kts is beyond the POH chart; distance extrapolated from the chart's tailwind lines.`);
  }

  // Neighbouring guide lines (extended past the first/last line, like following the nearest lines on the chart)
  if (distance < zero[0] || distance > zero[zero.length - 1]) {
    pushOnce(warnings, `${EXTRAPOLATED_WARNING} ${wind.source}; wind correction extrapolated beyond them.`);
  }
  let i = 0;
  while (i < zero.length - 2 && distance > zero[i + 1]) i++;

  // Distance along each guide line at this wind speed (lines are straight, so extend the last segment past the end)
  let k = 0;
  while (k < knots.length - 2 && kts > knots[k + 1]) k++;
  const along = (row: number[]) => interpolate1D(kts, knots[k], knots[k + 1], row[k], row[k + 1]);

  const result = interpolate1D(distance, zero[i], zero[i + 1], along(distances[i]), along(distances[i + 1]));
  const [printedMin, printedMax] = wind.printedDistances;
  if (result < printedMin || result > printedMax) {
    pushOnce(warnings, `${EXTRAPOLATED_WARNING} ${wind.source}; wind correction extrapolated beyond them.`);
  }
  return result;
}

/**
 * Calculate performance for a single PerformanceTable.
 *
 * Wind / surface / buffer corrections:
 * - Takeoff / Landing distances:
 *   - Wind from the table's windCorrection (the POH chart's own wind lines) when present, otherwise:
 *     - Headwind: -10% per 9 kts
 *     - Tailwind: +10% per 2 kts
 *   - Tailwind > 10 kts: warning
 *   - Grass/turf: +15% of ground roll added to both distances
 *   - Safety buffer applied after all corrections
 * - Climb (rateOfClimb):
 *   - Surface correction does NOT apply
 *   - Wind modifies groundspeed used to compute gradient
 *   - Safety buffer does NOT apply
 */
export function calculateTable(input: PerformanceInput, table: PerformanceTable): TableResult | null {
  const { weight, pressureAltitude, temperature, windKnots, isHeadwind, surfacePaved } = input;
  const warnings: string[] = [];

  const minWeight = table.weights[0];
  const maxWeight = table.weights[table.weights.length - 1];
  const minAlt = table.altitudes[0];
  const maxAlt = table.altitudes[table.altitudes.length - 1];
  const minTemp = table.temperatures[0];
  const maxTemp = table.temperatures[table.temperatures.length - 1];

  // If values are outside available data, do not calculate or return any performance values
  if (
    isNaN(weight) || weight < minWeight || weight > maxWeight ||
    isNaN(pressureAltitude) || pressureAltitude < minAlt || pressureAltitude > maxAlt ||
    isNaN(temperature) || temperature < minTemp || temperature > maxTemp
  ) {
    return null;
  }

  if (!isHeadwind && windKnots > 10) {
    warnings.push('Tailwind > 10 kts is not recommended/approved for this aircraft.');
  }

  // Density altitude
  const isaTemp = 15 - (pressureAltitude / 1000) * 2;
  const densityAltitude = pressureAltitude + 118.8 * (temperature - isaTemp);
  if (densityAltitude > pressureAltitude + 2000) {
    warnings.push('High Density Altitude! Expect degraded performance.');
  }

  const rawValue = interpolate3D(
    weight, pressureAltitude, temperature,
    table.weights, table.altitudes, table.temperatures,
    table.data
  );

  if (table.extrapolated && usesExtrapolatedData(table, weight, pressureAltitude, temperature)) {
    warnings.push(`${EXTRAPOLATED_WARNING} ${table.figure ?? 'POH chart'}; value extrapolated beyond published data.`);
  }

  // ── CLIMB ────────────────────────────────────────────────────────────────────
  if (table.metric === 'rateOfClimb') {
    const roc = Math.max(0, Math.round(rawValue));

    if (roc <= 0) {
      warnings.push('Absolute Ceiling Exceeded: Aircraft cannot maintain positive rate of climb under current conditions.');
    } else if (roc <= 100) {
      warnings.push('Service Ceiling Reached: Maximum rate of climb is 100 FPM or less.');
    }

    // TAS estimation: IAS × (1 + 0.015 × DA/1000)
    // We use Vy from the ClimbSpec (passed via the table — not available here directly).
    // The caller will merge vx/vy from ClimbSpec; we emit gradient using a placeholder TAS.
    // Use a generous default Vy of 75 KIAS if not derivable here.
    // NOTE: App.tsx should pass Vy from ClimbSpec when building the result display.
    const vyIas = 75; // conservative default; App overrides display with ClimbSpec.vy
    const climbTas = Math.round(vyIas * (1 + 0.015 * (densityAltitude / 1000)));
    let climbGs = climbTas;
    if (windKnots > 0) {
      climbGs = isHeadwind ? Math.max(10, climbTas - windKnots) : climbTas + windKnots;
    }

    const climbGradientFtPerNm = climbGs > 0 ? Math.round((roc / climbGs) * 60) : 0;
    const climbGradientPercent = Number((climbGradientFtPerNm / 60.7612).toFixed(1));

    if (climbGradientFtPerNm < 200 && roc > 0) {
      warnings.push('Advisory: Climb gradient (< 200 ft/NM) may not meet standard IFR/obstacle departure clearance requirements.');
    }

    return {
      tableId: table.id,
      metric: 'rateOfClimb',
      value: roc,
      baseValue: roc,
      densityAltitude: Math.round(densityAltitude),
      warnings,
      climbGradientFtPerNm,
      climbGradientPercent,
      climbTasKnots: climbTas,
      climbGroundspeedKnots: climbGs,
    };
  }

  // ── TAKEOFF / LANDING DISTANCES ──────────────────────────────────────────────
  let dist = rawValue;

  // Wind correction
  if (table.windCorrection) {
    dist = applyChartWind(dist, windKnots, isHeadwind, table.windCorrection, warnings);
  } else {
    let windFactor = 1.0;
    if (windKnots > 0) {
      windFactor = isHeadwind
        ? 1.0 - (windKnots / 9) * 0.10
        : 1.0 + (windKnots / 2) * 0.10;
    }
    windFactor = Math.max(windFactor, 0);
    dist *= windFactor;
  }

  // Surface correction (grass/turf) — applied only to groundRoll portion
  // For groundRoll tables: add 15% to the distance
  // For clearance50ft tables: add 15% of the raw groundRoll estimate
  // Approximation: both table types get +15% when surface is unpaved
  if (!surfacePaved) {
    dist += dist * 0.15;
  }

  const baseValue = Math.round(dist);
  const buffer = Math.max(0, Math.min(100, input.safetyBufferPercent ?? 0));
  const value = buffer > 0 ? Math.round(baseValue * (1 + buffer / 100)) : baseValue;

  return {
    tableId: table.id,
    metric: table.metric,
    value,
    baseValue,
    densityAltitude: Math.round(densityAltitude),
    warnings,
  };
}

/**
 * Complete result of a climb performance calculation including ROC, gradient,
 * and optional climb profile (time, distance, fuel to cruise).
 */
export type ClimbPerformanceResult = TableResult & {
  vy?: number;
  vx?: number;
  serviceCeiling?: number;
  absoluteCeiling?: number;
  timeDistanceFuelFigure?: string;
  timeToClimbMinutes?: number;
  distanceToClimbNm?: number;
  stillAirDistanceNm?: number;
  fuelToClimbGallons?: number;
  cruiseAltitude?: number;
};

/**
 * Linearly interpolates a cumulative climb profile point at a given altitude.
 */
function interpolateProfile(
  profile: import('./types').ClimbProfilePoint[],
  alt: number
): { timeMinutes: number; distanceNm: number; fuelGallons: number } | null {
  if (!profile.length) return null;
  if (alt < profile[0].altitude || alt > profile[profile.length - 1].altitude) {
    return null;
  }
  if (alt === profile[0].altitude) {
    return {
      timeMinutes: profile[0].timeMinutes,
      distanceNm: profile[0].distanceNm,
      fuelGallons: profile[0].fuelGallons,
    };
  }
  const last = profile[profile.length - 1];
  if (alt === last.altitude) {
    return {
      timeMinutes: last.timeMinutes,
      distanceNm: last.distanceNm,
      fuelGallons: last.fuelGallons,
    };
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const p1 = profile[i];
    const p2 = profile[i + 1];
    if (alt >= p1.altitude && alt <= p2.altitude) {
      const frac = (alt - p1.altitude) / (p2.altitude - p1.altitude);
      return {
        timeMinutes: p1.timeMinutes + frac * (p2.timeMinutes - p1.timeMinutes),
        distanceNm: p1.distanceNm + frac * (p2.distanceNm - p1.distanceNm),
        fuelGallons: p1.fuelGallons + frac * (p2.fuelGallons - p1.fuelGallons),
      };
    }
  }
  return null;
}

type ProfileValues = { timeMinutes: number; distanceNm: number; fuelGallons: number };

/**
 * Cumulative time, distance and fuel from sea level to a pressure altitude: from the spec's
 * profileTable at the given OAT when present, otherwise from its altitude-only profile.
 * Returns null, with a warning, when the altitude or temperature is outside the data.
 */
function readClimbProfile(
  spec: ClimbSpec,
  altitude: number,
  temperature: number,
  label: string,
  warnings: string[]
): ProfileValues | null {
  const table = spec.profileTable;
  if (table) {
    const aMin = table.altitudes[0];
    const aMax = table.altitudes[table.altitudes.length - 1];
    const tMin = table.temperatures[0];
    const tMax = table.temperatures[table.temperatures.length - 1];
    if (altitude < aMin || altitude > aMax || temperature < tMin || temperature > tMax) {
      warnings.push(
        `${label} (${altitude.toLocaleString()} ft, ${temperature}°C) is outside the ${table.figure} data ` +
        `(${aMin.toLocaleString()}–${aMax.toLocaleString()} ft, ${tMin} to ${tMax}°C); time, distance and fuel to climb not calculated.`
      );
      return null;
    }
    const as = contributingIndices(altitude, table.altitudes);
    const ts = contributingIndices(temperature, table.temperatures);
    if (as.some(i => ts.some(j => table.extrapolated[i][j] === 1))) {
      pushOnce(warnings, `${EXTRAPOLATED_WARNING} ${table.figure}; time, distance and fuel to climb extrapolated beyond published data.`);
    }
    const read = (grid: number[][]) => interpolate2D(altitude, temperature, table.altitudes, table.temperatures, grid);
    return { timeMinutes: read(table.timeMinutes), distanceNm: read(table.distanceNm), fuelGallons: read(table.fuelGallons) };
  }

  const profile = spec.profile!;
  const values = interpolateProfile(profile, altitude);
  if (!values) {
    warnings.push(
      `${label} (${altitude.toLocaleString()} ft) is outside the climb profile data ` +
      `(${profile[0].altitude.toLocaleString()}–${profile[profile.length - 1].altitude.toLocaleString()} ft); time, distance and fuel to climb not calculated.`
    );
  }
  return values;
}

/**
 * Calculate all climb tables in a ClimbSpec and return the primary ROC result
 * with TAS/gradient using the spec's actual Vy speed, plus Time, Distance, and Fuel
 * to cruise altitude if a climb profile and cruise altitude are provided.
 */
export function calculateClimb(
  input: PerformanceInput,
  spec: ClimbSpec,
): ClimbPerformanceResult | null {
  if (!spec.tables.length) return null;

  const primary = calculateTable(input, spec.tables[0]);
  if (!primary) return null;

  // Re-derive gradient with the actual Vy from spec
  if (spec.vy != null && primary.climbTasKnots != null) {
    const { pressureAltitude, temperature, windKnots, isHeadwind } = input;
    const isaTemp = 15 - (pressureAltitude / 1000) * 2;
    const da = pressureAltitude + 118.8 * (temperature - isaTemp);
    const vy = spec.vy;
    const climbTas = Math.round(vy * (1 + 0.015 * (da / 1000)));
    let climbGs = climbTas;
    if (windKnots > 0) {
      climbGs = isHeadwind ? Math.max(10, climbTas - windKnots) : climbTas + windKnots;
    }
    const roc = primary.value;
    const grad = climbGs > 0 ? Math.round((roc / climbGs) * 60) : 0;
    primary.climbTasKnots = climbTas;
    primary.climbGroundspeedKnots = climbGs;
    primary.climbGradientFtPerNm = grad;
    primary.climbGradientPercent = Number((grad / 60.7612).toFixed(1));
  }

  // Calculate Time, Distance, and Fuel to Cruise Altitude if profile is available
  let timeToClimbMinutes: number | undefined;
  let distanceToClimbNm: number | undefined;
  let stillAirDistanceNm: number | undefined;
  let fuelToClimbGallons: number | undefined;

  if ((spec.profileTable || spec.profile) && input.cruiseAltitude != null && !isNaN(input.cruiseAltitude)) {
    const depAlt = input.pressureAltitude;
    const cruiseAlt = input.cruiseAltitude;

    if (cruiseAlt > depAlt) {
      // Read at the departure and cruise altitudes and subtract. The POH asks for the OAT at each
      // altitude; both readings use the one OAT input, as the app has no cruise temperature input.
      const depValues = readClimbProfile(spec, depAlt, input.temperature, 'Departure altitude', primary.warnings);
      const cruiseValues = readClimbProfile(spec, cruiseAlt, input.temperature, 'Cruise altitude', primary.warnings);

      if (depValues && cruiseValues) {
        const rawTime = Math.max(0, cruiseValues.timeMinutes - depValues.timeMinutes);
        const rawDist = Math.max(0, cruiseValues.distanceNm - depValues.distanceNm);
        const rawFuel = Math.max(0, cruiseValues.fuelGallons - depValues.fuelGallons);

        // Wind correction on distance
        // Headwind reduces ground distance covered; tailwind increases it
        const windEffect = (input.isHeadwind ? -input.windKnots : input.windKnots) * (rawTime / 60);
        const finalDist = Math.max(0.1, Number((rawDist + windEffect).toFixed(1)));

        timeToClimbMinutes = Number(rawTime.toFixed(1));
        stillAirDistanceNm = Number(rawDist.toFixed(1));
        distanceToClimbNm = finalDist;
        fuelToClimbGallons = Number(rawFuel.toFixed(1));
      }

      if (spec.serviceCeiling != null && cruiseAlt > spec.serviceCeiling) {
        primary.warnings.push(
          `Target cruise altitude (${cruiseAlt.toLocaleString()} ft) exceeds certified service ceiling (${spec.serviceCeiling.toLocaleString()} ft).`
        );
      }
    } else if (cruiseAlt <= depAlt) {
      primary.warnings.push(
        `Target cruise altitude (${cruiseAlt.toLocaleString()} ft) must be higher than departure altitude (${depAlt.toLocaleString()} ft) to calculate climb profile.`
      );
    }
  }

  return {
    ...primary,
    vy: spec.vy,
    vx: spec.vx,
    serviceCeiling: spec.serviceCeiling,
    absoluteCeiling: spec.absoluteCeiling,
    timeDistanceFuelFigure: spec.timeDistanceFuelFigure,
    timeToClimbMinutes,
    distanceToClimbNm,
    stillAirDistanceNm,
    fuelToClimbGallons,
    cruiseAltitude: input.cruiseAltitude,
  };
}
