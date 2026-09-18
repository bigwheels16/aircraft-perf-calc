import fleetRaw from '../data/fleet.json';
import type { FleetData } from '../engine/types';

const fleet: FleetData = fleetRaw as unknown as FleetData;
const defaultTailNumber = Object.keys(fleet)[0] || '';

export interface SavedAppState {
  aircraft: string;
  operation: 'takeoff' | 'climb' | 'landing';
  archerFlaps?: '0' | '25';
  surfacePaved: boolean;
  weight: number;
  fieldElev: number;
  altimeterSetting: number;
  temperature: number;
  tempUnit: 'C' | 'F';
  windKnots: number;
  isHeadwind: boolean;
  safetyBuffer: number;
  cruiseAltitude: number;
}

export const DEFAULT_APP_STATE: SavedAppState = {
  aircraft: defaultTailNumber,
  operation: 'takeoff',
  archerFlaps: '0',
  surfacePaved: true,
  weight: 2300,
  fieldElev: 1000,
  altimeterSetting: 29.92,
  cruiseAltitude: 5500,
  temperature: 25,
  tempUnit: 'C',
  windKnots: 0,
  isHeadwind: true,
  safetyBuffer: 0,
};

const STORAGE_KEY = 'aircraft_perf_calc_state_v1';

/**
 * Loads and strictly validates saved application state from localStorage.
 * Sanitizes any invalid or corrupt values back to safe defaults.
 */
export function loadSavedState(): SavedAppState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_APP_STATE;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_STATE;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_APP_STATE;

    const validAircraft = typeof parsed.aircraft === 'string' && Object.prototype.hasOwnProperty.call(fleet, parsed.aircraft) ? parsed.aircraft : defaultTailNumber;

    return {
      aircraft: validAircraft,
      operation:
        parsed.operation === 'climb' || parsed.operation === 'landing'
          ? parsed.operation
          : 'takeoff',
      archerFlaps: parsed.archerFlaps === '25' ? '25' : '0',
      surfacePaved: typeof parsed.surfacePaved === 'boolean' ? parsed.surfacePaved : true,
      weight:
        typeof parsed.weight === 'number' && Number.isFinite(parsed.weight) && parsed.weight > 0
          ? parsed.weight
          : DEFAULT_APP_STATE.weight,
      fieldElev:
        typeof parsed.fieldElev === 'number' && Number.isFinite(parsed.fieldElev)
          ? parsed.fieldElev
          : DEFAULT_APP_STATE.fieldElev,
      altimeterSetting:
        typeof parsed.altimeterSetting === 'number' &&
        Number.isFinite(parsed.altimeterSetting) &&
        parsed.altimeterSetting >= 25 &&
        parsed.altimeterSetting <= 35
          ? parsed.altimeterSetting
          : DEFAULT_APP_STATE.altimeterSetting,
      temperature:
        typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)
          ? parsed.temperature
          : DEFAULT_APP_STATE.temperature,
      tempUnit: parsed.tempUnit === 'F' ? 'F' : 'C',
      windKnots:
        typeof parsed.windKnots === 'number' && Number.isFinite(parsed.windKnots) && parsed.windKnots >= 0
          ? parsed.windKnots
          : 0,
      isHeadwind: typeof parsed.isHeadwind === 'boolean' ? parsed.isHeadwind : true,
      safetyBuffer:
        typeof parsed.safetyBuffer === 'number' &&
        Number.isFinite(parsed.safetyBuffer) &&
        parsed.safetyBuffer >= 0 &&
        parsed.safetyBuffer <= 100
          ? parsed.safetyBuffer
          : 0,
      cruiseAltitude:
        typeof parsed.cruiseAltitude === 'number' && Number.isFinite(parsed.cruiseAltitude)
          ? parsed.cruiseAltitude
          : DEFAULT_APP_STATE.cruiseAltitude,
    };
  } catch {
    return DEFAULT_APP_STATE;
  }
}

/**
 * Persists application state to localStorage.
 */
export function saveAppState(state: SavedAppState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Gracefully handle storage quota or private browsing mode
  }
}
