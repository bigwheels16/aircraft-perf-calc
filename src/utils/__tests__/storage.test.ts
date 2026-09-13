import { describe, it, expect, beforeEach } from 'vitest';
import { loadSavedState, saveAppState, DEFAULT_APP_STATE } from '../storage';

describe('Storage Utility', () => {
  let store: Record<string, string> = {};

  const localStorageMock = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: localStorageMock },
      writable: true,
      configurable: true,
    });
  });

  it('returns default state when localStorage is empty', () => {
    const state = loadSavedState();
    expect(state).toEqual(DEFAULT_APP_STATE);
  });

  it('saves and restores valid state', () => {
    saveAppState({
      ...DEFAULT_APP_STATE,
      aircraft: 'Archer2',
      operation: 'takeoff',
      archerFlaps: '25',
      weight: 2450,
      temperature: 30,
      windKnots: 8,
      isHeadwind: false,
      safetyBuffer: 25,
    });

    const restored = loadSavedState();
    expect(restored.aircraft).toBe('Archer2');
    expect(restored.operation).toBe('takeoff');
    expect(restored.archerFlaps).toBe('25');
    expect(restored.weight).toBe(2450);
    expect(restored.temperature).toBe(30);
    expect(restored.windKnots).toBe(8);
    expect(restored.isHeadwind).toBe(false);
    expect(restored.safetyBuffer).toBe(25);
  });

  it('sanitizes corrupt or invalid data from localStorage', () => {
    store['aircraft_perf_calc_state_v1'] = JSON.stringify({
      aircraft: '<script>alert("XSS")</script>',
      archerFlaps: 'invalid-flaps',
      weight: 'not-a-number',
      temperature: null,
      windKnots: -50,
      operation: 'invalid-op',
      safetyBuffer: 150, // invalid: > 100
    });

    const restored = loadSavedState();
    expect(restored.aircraft).toBe('C172N');
    expect(restored.operation).toBe('takeoff');
    expect(restored.archerFlaps).toBe('0');
    expect(restored.weight).toBe(DEFAULT_APP_STATE.weight);
    expect(restored.temperature).toBe(DEFAULT_APP_STATE.temperature);
    expect(restored.windKnots).toBe(0);
    expect(restored.safetyBuffer).toBe(0);
  });
});
