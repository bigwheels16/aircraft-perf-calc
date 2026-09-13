import type { POHDataset } from './types';
import { interpolate3D } from './interpolation';

/**
 * Input parameters required for takeoff or landing performance calculation.
 */
export type PerformanceInput = {
  /** Aircraft gross weight in pounds (lbs). */
  weight: number;
  /** Pressure altitude in feet (ft). */
  pressureAltitude: number;
  /** Outside air temperature in degrees Celsius (°C). */
  temperature: number;
  /** Wind velocity component magnitude in knots. */
  windKnots: number;
  /** True if the wind component is a headwind; false if tailwind. */
  isHeadwind: boolean;
  /** True for dry paved runway; false for dry grass/turf runway. */
  surfacePaved: boolean;
  /** Optional custom safety buffer percentage from 0 to 100%. */
  safetyBufferPercent?: number;
};

/**
 * Output performance metrics and operational safety warnings.
 */
export type PerformanceOutput = {
  /** Computed ground roll distance in feet (including safety buffer, rounded to integer). */
  groundRoll: number;
  /** Total distance to clear a 50-foot obstacle in feet (including safety buffer, rounded to integer). */
  clearance50ft: number;
  /** Unbuffered base POH ground roll distance in feet. */
  baseGroundRoll: number;
  /** Unbuffered base POH 50-foot obstacle clearance distance in feet. */
  baseClearance50ft: number;
  /** Safety buffer percentage applied (0 to 100%). */
  safetyBufferPercent: number;
  /** Computed density altitude in feet (rounded to nearest integer). */
  densityAltitude: number;
  /** List of operational warnings, advisories, or POH envelope clamping notices. */
  warnings: string[];
  /** POH Figure or Table source citations passed through from dataset. */
  figures?: {
    groundRoll: string;
    clearance50ft: string;
  };
};

/**
 * Calculates takeoff or landing performance using multilinear (trilinear) interpolation
 * on aircraft POH tabular data, applying corrections for wind, runway surface, and density altitude.
 *
 * Operational Rules and Corrections:
 * - POH Envelope Clamping: Values outside tabular ranges for weight, pressure altitude,
 *   or temperature are clamped to tabular boundaries with user warnings generated.
 * - Wind Correction:
 *   - Headwind: -10% distance per 9 knots.
 *   - Tailwind: +10% distance per 2 knots (warnings generated if tailwind > 10 knots).
 * - Surface Correction:
 *   - Unpaved/Grass runways: Adds 15% of the computed ground roll to both ground roll
 *     and 50-foot obstacle clearance distances.
 * - Density Altitude:
 *   - Calculated via ISA standard lapse rate: ISA = 15 - (PA / 1000) * 2; DA = PA + 118.8 * (OAT - ISA).
 *   - Issues advisory warning if DA exceeds PA by more than 2,000 feet.
 *
 * @param input - Current atmospheric, aircraft, and runway parameters
 * @param dataset - Selected aircraft and operation POH dataset
 * @returns PerformanceOutput object containing computed distances, density altitude, and warnings
 */
export function calculatePerformance(input: PerformanceInput, dataset: POHDataset): PerformanceOutput {
  const { weight, pressureAltitude, temperature, windKnots, isHeadwind, surfacePaved } = input;
  const warnings: string[] = [];

  let calcWeight = weight;
  let calcAlt = pressureAltitude;
  let calcTemp = temperature;

  if (weight > dataset.weights[dataset.weights.length - 1] || weight < dataset.weights[0]) {
    warnings.push('Weight out of POH envelope.');
    calcWeight = Math.min(Math.max(weight, dataset.weights[0]), dataset.weights[dataset.weights.length - 1]);
  }

  if (pressureAltitude > dataset.altitudes[dataset.altitudes.length - 1] || pressureAltitude < dataset.altitudes[0]) {
    warnings.push('Altitude out of POH envelope.');
    calcAlt = Math.min(Math.max(pressureAltitude, dataset.altitudes[0]), dataset.altitudes[dataset.altitudes.length - 1]);
  }

  if (temperature > dataset.temperatures[dataset.temperatures.length - 1] || temperature < dataset.temperatures[0]) {
    warnings.push('Temperature out of POH envelope.');
    calcTemp = Math.min(Math.max(temperature, dataset.temperatures[0]), dataset.temperatures[dataset.temperatures.length - 1]);
  }

  if (!isHeadwind && windKnots > 10) {
    warnings.push('Tailwind > 10 kts is not recommended/approved for this aircraft.');
  }

  let groundRoll = interpolate3D(
    calcWeight, calcAlt, calcTemp,
    dataset.weights, dataset.altitudes, dataset.temperatures,
    dataset.data.groundRoll
  );

  let clearance50ft = interpolate3D(
    calcWeight, calcAlt, calcTemp,
    dataset.weights, dataset.altitudes, dataset.temperatures,
    dataset.data.clearance50ft
  );

  let windFactor = 1.0;
  if (windKnots > 0) {
    if (isHeadwind) {
      windFactor = 1.0 - (windKnots / 9) * 0.10;
    } else {
      windFactor = 1.0 + (windKnots / 2) * 0.10;
    }
  }
  
  windFactor = Math.max(windFactor, 0);

  groundRoll *= windFactor;
  clearance50ft *= windFactor;

  if (!surfacePaved) {
    // Usually it's "increase distance by 15% of ground roll".
    const grIncrease = groundRoll * 0.15;
    groundRoll += grIncrease;
    clearance50ft += grIncrease;
  }

  const isaTemp = 15 - (pressureAltitude / 1000) * 2;
  const densityAltitude = pressureAltitude + 118.8 * (temperature - isaTemp);

  if (densityAltitude > pressureAltitude + 2000) {
    warnings.push('High Density Altitude! Expect degraded performance.');
  }

  const baseGroundRoll = Math.round(groundRoll);
  const baseClearance50ft = Math.round(clearance50ft);
  const buffer = Math.max(0, Math.min(100, input.safetyBufferPercent || 0));

  const bufferedGroundRoll = buffer > 0 ? Math.round(baseGroundRoll * (1 + buffer / 100)) : baseGroundRoll;
  const bufferedClearance50ft = buffer > 0 ? Math.round(baseClearance50ft * (1 + buffer / 100)) : baseClearance50ft;

  return {
    groundRoll: bufferedGroundRoll,
    clearance50ft: bufferedClearance50ft,
    baseGroundRoll,
    baseClearance50ft,
    safetyBufferPercent: buffer,
    densityAltitude: Math.round(densityAltitude),
    warnings,
    figures: dataset.figures,
  };
}
