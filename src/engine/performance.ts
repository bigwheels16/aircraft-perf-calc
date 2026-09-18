import type { PerformanceTable, ClimbSpec } from './types';
import { interpolate3D } from './interpolation';

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
 * Calculate performance for a single PerformanceTable.
 *
 * Wind / surface / buffer corrections:
 * - Takeoff / Landing distances:
 *   - Headwind: -10% per 9 kts
 *   - Tailwind: +10% per 2 kts (warning if > 10 kts)
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
  let windFactor = 1.0;
  if (windKnots > 0) {
    windFactor = isHeadwind
      ? 1.0 - (windKnots / 9) * 0.10
      : 1.0 + (windKnots / 2) * 0.10;
  }
  windFactor = Math.max(windFactor, 0);
  dist *= windFactor;

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

  if (spec.profile && input.cruiseAltitude != null && !isNaN(input.cruiseAltitude)) {
    const depAlt = input.pressureAltitude;
    const cruiseAlt = input.cruiseAltitude;

    if (cruiseAlt > depAlt) {
      const depValues = interpolateProfile(spec.profile, depAlt);
      const cruiseValues = interpolateProfile(spec.profile, cruiseAlt);

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
