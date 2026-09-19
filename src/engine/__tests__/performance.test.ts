import { describe, it, expect } from 'vitest';
import { calculateTable, calculateClimb } from '../performance';
import { interpolate2D } from '../interpolation';
import fleetRaw from '../../data/fleet.json';
import type { FleetData } from '../../engine/types';
const fleet = fleetRaw as unknown as FleetData;
const c172n = fleet['N0001'];
const archer2 = fleet['N0002'];

describe('Performance Engine', () => {
  it('calculates standard takeoff performance without wind correctly', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = c172n.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;
    
    const input = {
      weight: 2000,
      pressureAltitude: 0,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const rollResult = calculateTable(input, tableRoll);
    const clearanceResult = calculateTable(input, table50ft);
    
    expect(rollResult!.value).toBeGreaterThan(0);
    expect(clearanceResult!.value).toBeGreaterThan(rollResult!.value);
    expect(rollResult!.warnings.length).toBe(0);
  });

  it('verifies exact POH tabular points for C172N Takeoff', () => {
    const input = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 20,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = c172n.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);
    expect(resultRoll!.value).toBe(1452);
    expect(result50ft!.value).toBe(2696);
  });

  it('verifies exact POH tabular points for C172N Landing', () => {
    const input = {
      weight: 2400,
      pressureAltitude: 0,
      temperature: 20,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = c172n.landing.find(t => t.metric === 'groundRoll')!;
    const table50ft = c172n.landing.find(t => t.metric === 'clearance50ft')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    expect(resultRoll!.value).toBe(864);
    expect(result50ft!.value).toBe(1901);
  });

  // Archer II values below are read from the POH charts (fleet.json is generated from them by
  // scripts/generate-chart-data.ts; chartReadings.test.ts checks the tables against the charts)
  it('matches the POH charts for Archer II Takeoff (Flaps Up)', () => {
    const input = {
      weight: 2000,
      pressureAltitude: 4000,
      temperature: 10,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    expect(resultRoll!.value).toBe(1005); // Fig 5-11
    expect(result50ft!.value).toBe(1658); // Fig 5-7
  });

  it('matches the POH charts for Archer II Takeoff (25° Flaps)', () => {
    const input = {
      weight: 2000,
      pressureAltitude: 4000,
      temperature: 10,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === '25° Flaps')!;
    const table50ft = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === '25° Flaps')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    expect(resultRoll!.value).toBe(918); // Fig 5-13
    expect(result50ft!.value).toBe(1754); // Fig 5-9
  });

  it('matches the POH charts for Archer II Landing', () => {
    const input = {
      weight: 2400,
      pressureAltitude: 0,
      temperature: 20,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = archer2.landing.find(t => t.metric === 'groundRoll')!;
    const table50ft = archer2.landing.find(t => t.metric === 'clearance50ft')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    expect(resultRoll!.value).toBe(881); // Fig 5-37
    expect(result50ft!.value).toBe(1375); // Fig 5-35
  });

  it('verifies Piper POH worked examples for Archer II Flaps Up Takeoff (Figures 5-7 & 5-11)', () => {
    const input = (windKnots: number) => ({
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots,
      isHeadwind: true,
      surfacePaved: true
    });
    const tableRoll = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    // Fig 5-7 example: 15 kt headwind -> 1900 ft
    expect(Math.abs(calculateTable(input(15), table50ft)!.value - 1900)).toBeLessThanOrEqual(20);
    // Fig 5-11 example: 8 kt headwind -> 1100 ft. The printed example's wind leg is steeper than
    // the chart's own headwind lines; following the lines gives ~1140 ft (+3.6%)
    expect(Math.abs(calculateTable(input(8), tableRoll)!.value - 1141)).toBeLessThanOrEqual(2);
  });

  it('verifies exact Piper POH worked example for Archer II 25° Flaps Takeoff (Figures 5-9 & 5-13)', () => {
    const inputZeroWind = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === '25° Flaps')!;
    const table50ft = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === '25° Flaps')!;

    const resultRollZeroWind = calculateTable(inputZeroWind, tableRoll);
    const result50ftZeroWind = calculateTable(inputZeroWind, table50ft);

    // The POH prints only the final 1860 ft; the zero-wind value is where the printed
    // dashed example path turns on Fig 5-9 (~2103 ft)
    expect(Math.abs(result50ftZeroWind!.value - 2103)).toBeLessThanOrEqual(5);
    // Fig 5-13 (zero wind), read from the chart
    expect(Math.abs(resultRollZeroWind!.value - 1161)).toBeLessThanOrEqual(2);

    const inputWind = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots: 8,
      isHeadwind: true,
      surfacePaved: true
    };

    const result50ftWind = calculateTable(inputWind, table50ft);
    expect(Math.abs(result50ftWind!.value - 1860)).toBeLessThanOrEqual(2);

    // Fig 5-13 example: 10 kt headwind -> 950 ft. The printed example turns up from 20°C, not 21°C,
    // and its dashes end at ~940 ft; following the lines from 21°C gives ~977 ft (+2.8%)
    const resultRollWind = calculateTable({ ...inputWind, windKnots: 10 }, tableRoll);
    expect(Math.abs(resultRollWind!.value - 977)).toBeLessThanOrEqual(2);
  });

  it('verifies exact Piper POH worked example for Archer II 40° Flaps Landing (Figures 5-35 & 5-37)', () => {
    const input = {
      weight: 2264,
      pressureAltitude: 2300,
      temperature: 21,
      windKnots: 5,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = archer2.landing.find(t => t.metric === 'groundRoll')!;
    const table50ft = archer2.landing.find(t => t.metric === 'clearance50ft')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    // Printed examples: 1290 ft (Fig 5-35) and 825 ft (Fig 5-37); the charts' own lines give 1299 and 830
    expect(Math.abs(result50ft!.value - 1290)).toBeLessThanOrEqual(15);
    expect(Math.abs(resultRoll!.value - 825)).toBeLessThanOrEqual(10);
  });

  it('verifies multilinear interpolation between nodes', () => {
    const input = {
      weight: 2200,
      pressureAltitude: 1000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = c172n.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const resultRoll = calculateTable(input, tableRoll);
    const result50ft = calculateTable(input, table50ft);

    expect(resultRoll!.value).toBeGreaterThan(700);
    expect(resultRoll!.value).toBeLessThan(1452);
    expect(result50ft!.value).toBeGreaterThan(1300);
    expect(result50ft!.value).toBeLessThan(2696);
  });

  it('applies headwind correction (-10% per 9 knots)', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    
    const baseInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const base = calculateTable(baseInput, tableRoll);

    const windInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 9, isHeadwind: true, surfacePaved: true };
    const withWind = calculateTable(windInput, tableRoll);

    expect(withWind!.value).toBeLessThan(base!.value);
    expect(Math.abs(withWind!.value - base!.value * 0.9)).toBeLessThan(2);
  });

  it('applies tailwind correction (+10% per 2 knots) and warns > 10kts', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;

    const baseInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const base = calculateTable(baseInput, tableRoll);

    const windInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 2, isHeadwind: false, surfacePaved: true };
    const withWind = calculateTable(windInput, tableRoll);

    expect(withWind!.value).toBeGreaterThan(base!.value);
    expect(Math.abs(withWind!.value - base!.value * 1.1)).toBeLessThan(2);

    const warningInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 11, isHeadwind: false, surfacePaved: true };
    const warningWind = calculateTable(warningInput, tableRoll);

    expect(warningWind!.warnings).toContain('Tailwind > 10 kts is not recommended/approved for this aircraft.');
  });

  it('applies runway surface adjustments (dry grass +15%)', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = c172n.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const baseInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const baseRoll = calculateTable(baseInput, tableRoll);
    const base50ft = calculateTable(baseInput, table50ft);

    const unpavedInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: false };
    const unpavedRoll = calculateTable(unpavedInput, tableRoll);
    const unpaved50ft = calculateTable(unpavedInput, table50ft);

    expect(Math.abs(unpavedRoll!.value - baseRoll!.value * 1.15)).toBeLessThan(2);
    expect(Math.abs(unpaved50ft!.value - base50ft!.value * 1.15)).toBeLessThan(2);
  });

  it('returns null when temperature is outside available data', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const inputHigh = { weight: 2000, pressureAltitude: 0, temperature: 50, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputHigh, tableRoll)).toBeNull();

    const inputLow = { weight: 2000, pressureAltitude: 0, temperature: -10, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputLow, tableRoll)).toBeNull();
  });

  it('returns null when weight is outside available data', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const inputHigh = { weight: 3000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputHigh, tableRoll)).toBeNull();

    const inputLow = { weight: 1400, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputLow, tableRoll)).toBeNull();
  });

  it('returns null when pressure altitude is outside available data', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const inputHigh = { weight: 2000, pressureAltitude: 9000, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputHigh, tableRoll)).toBeNull();

    const inputLow = { weight: 2000, pressureAltitude: -500, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateTable(inputLow, tableRoll)).toBeNull();
  });

  it('returns null when climb input values are outside available data', () => {
    const inputOutOfEnvelope = { weight: 3000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    expect(calculateClimb(inputOutOfEnvelope, c172n.climb)).toBeNull();
  });
  
  it('calculates density altitude correctly', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const input = { weight: 2000, pressureAltitude: 2000, temperature: 30, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateTable(input, tableRoll);
    
    expect(Math.abs(result!.densityAltitude - 4257)).toBeLessThan(5);
  });

  it('applies custom safety buffer to ground roll and 50ft obstacle clearance', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = c172n.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const unbufferedInput = { weight: 2400, pressureAltitude: 0, temperature: 20, windKnots: 0, isHeadwind: true, surfacePaved: true, safetyBufferPercent: 0 };
    const unbufferedRoll = calculateTable(unbufferedInput, tableRoll);
    const unbuffered50ft = calculateTable(unbufferedInput, table50ft);

    const bufferedInput = { weight: 2400, pressureAltitude: 0, temperature: 20, windKnots: 0, isHeadwind: true, surfacePaved: true, safetyBufferPercent: 50 };
    const bufferedRoll = calculateTable(bufferedInput, tableRoll);
    const buffered50ft = calculateTable(bufferedInput, table50ft);

    expect(bufferedRoll!.baseValue).toBe(unbufferedRoll!.value);
    expect(buffered50ft!.baseValue).toBe(unbuffered50ft!.value);
    expect(bufferedRoll!.value).toBe(Math.round(unbufferedRoll!.value * 1.50));
    expect(buffered50ft!.value).toBe(Math.round(unbuffered50ft!.value * 1.50));
  });

  it('propagates dataset POH figure citations to calculation output', () => {
    const tableRollArcher = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    expect(tableRollArcher.figure).toBe('POH Fig 5-11');
    const table50ftArcher = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;
    expect(table50ftArcher.figure).toBe('POH Fig 5-7');

    const tableRollC172 = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    expect(tableRollC172.figure).toBe('POH Section 5');
  });
});

describe('Climb Performance Engine', () => {
  it('Archer II at 2550 lbs / 3600 ft PA / -1°C → ~620 FPM', () => {
    const input = { weight: 2550, pressureAltitude: 3600, temperature: -1, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, archer2.climb)!;

    expect(result!.value).toBeGreaterThan(590);
    expect(result!.value).toBeLessThan(650);
  });

  it('C172N at 2300 lbs / SL / 20°C → ~720 FPM', () => {
    const input = { weight: 2300, pressureAltitude: 0, temperature: 20, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, c172n.climb)!;

    expect(result!.value).toBeGreaterThan(690);
    expect(result!.value).toBeLessThan(750);
  });

  it('Climb operation returns correct operation flag', () => {
    const input = { weight: 2550, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, archer2.climb)!;

    expect(result.metric).toBe('rateOfClimb');
  });

  it('Climb gradient > 0 when ROC > 0', () => {
    const input = { weight: 2300, pressureAltitude: 2000, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, c172n.climb)!;

    expect(result!.value).toBeGreaterThan(0);
    expect(result.climbGradientFtPerNm).toBeGreaterThan(0);
    expect(result.climbGradientPercent).toBeGreaterThan(0);
  });

  it('Headwind increases climb gradient (same ROC over shorter ground distance)', () => {
    const noWindInput = { weight: 2300, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const noWind = calculateClimb(noWindInput, c172n.climb)!;

    const headwindInput = { weight: 2300, pressureAltitude: 0, temperature: 15, windKnots: 10, isHeadwind: true, surfacePaved: true };
    const headwind = calculateClimb(headwindInput, c172n.climb)!;

    expect(headwind.climbGradientFtPerNm).toBeGreaterThan(noWind.climbGradientFtPerNm!);
  });

  it('Archer II dataset has correct Vy, service ceiling, figure reference', () => {
    expect(archer2.climb.vy).toBe(76);
    expect(archer2.climb.serviceCeiling).toBe(13650);
    expect(archer2.climb.absoluteCeiling).toBe(15750);
    expect(archer2.climb.tables[0].figure).toBeTruthy();
  });

  it('C172N dataset has correct Vy and service ceiling', () => {
    expect(c172n.climb.vy).toBe(73);
    expect(c172n.climb.serviceCeiling).toBe(14200);
    expect(c172n.climb.tables[0].figure).toBeTruthy();
  });

  it('reads Archer II time, distance, and fuel to climb from Figure 5-17 at the printed example points', () => {
    const table = archer2.climb.profileTable!;
    const read = (altitude: number, oat: number) => ({
      time: interpolate2D(altitude, oat, table.altitudes, table.temperatures, table.timeMinutes),
      distance: interpolate2D(altitude, oat, table.altitudes, table.temperatures, table.distanceNm),
      fuel: interpolate2D(altitude, oat, table.altitudes, table.temperatures, table.fuelGallons),
    });
    // Printed examples; fuel is printed in whole gallons (1 gal is ~9 px on the chart's scale)
    for (const ex of [
      { altitude: 2000, oat: 21, time: 3, distance: 4.5, fuel: 1 },
      { altitude: 6000, oat: 13, time: 11.5, distance: 16, fuel: 2 },
    ]) {
      const r = read(ex.altitude, ex.oat);
      expect(Math.abs(r.time - ex.time)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(r.distance - ex.distance)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(r.fuel - ex.fuel)).toBeLessThanOrEqual(0.35);
    }
  });

  it('calculates Archer II time, distance, and fuel to climb as cruise minus departure, both at the OAT input', () => {
    const input = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const table = archer2.climb.profileTable!;
    const at = (grid: number[][], altitude: number) => interpolate2D(altitude, 15, table.altitudes, table.temperatures, grid);
    const result = calculateClimb(input, archer2.climb)!;

    expect(result.timeToClimbMinutes).toBe(Number((at(table.timeMinutes, 6000) - at(table.timeMinutes, 2000)).toFixed(1)));
    expect(result.distanceToClimbNm).toBe(Number((at(table.distanceNm, 6000) - at(table.distanceNm, 2000)).toFixed(1)));
    expect(result.fuelToClimbGallons).toBe(Number((at(table.fuelGallons, 6000) - at(table.fuelGallons, 2000)).toFixed(1)));
    expect(result.timeToClimbMinutes).toBe(8.9);
    expect(result.timeDistanceFuelFigure).toBe('POH Fig 5-17');
    expect(result.warnings).toEqual([]);

    // Hotter air: longer climb
    const hot = calculateClimb({ ...input, temperature: 30 }, archer2.climb)!;
    expect(hot.timeToClimbMinutes!).toBeGreaterThan(result.timeToClimbMinutes!);
  });

  it('warns when the Archer II climb profile is extrapolated or unavailable', () => {
    const input = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 45,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const hot = calculateClimb(input, archer2.climb)!;
    expect(hot.timeToClimbMinutes).toBeDefined();
    expect(hot.warnings.filter(w => w.includes('beyond the edge of the printed POH Fig 5-17'))).toHaveLength(1);

    const high = calculateClimb({ ...input, temperature: 15, cruiseAltitude: 13500 }, archer2.climb)!;
    expect(high.timeToClimbMinutes).toBeUndefined();
    expect(high.warnings.some(w => w.includes('outside the POH Fig 5-17 data'))).toBe(true);
  });

  it('calculates C172N time, distance, and fuel to climb matching POH Section 5', () => {
    const input = {
      weight: 2300,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const result = calculateClimb(input, c172n.climb)!;

    // C172N POH Section 5: 2000 to 6000 ft -> Time: 7.0 min (10 - 3), Distance: 11.0 NM (15 - 4), Fuel: 1.6 gal (2.3 - 0.7)
    expect(result.timeToClimbMinutes).toBe(7.0);
    expect(result.distanceToClimbNm).toBe(11.0);
    expect(result.fuelToClimbGallons).toBe(1.6);
    expect(result.timeDistanceFuelFigure).toBe('POH Section 5');
  });

  it('corrects climb distance for wind component', () => {
    const noWindInput = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const noWind = calculateClimb(noWindInput, archer2.climb)!;

    const headwindInput = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 15,
      isHeadwind: true,
      surfacePaved: true,
    };
    const headwind = calculateClimb(headwindInput, archer2.climb)!;

    const tailwindInput = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 15,
      isHeadwind: false,
      surfacePaved: true,
    };
    const tailwind = calculateClimb(tailwindInput, archer2.climb)!;

    expect(headwind.distanceToClimbNm).toBeLessThan(noWind.distanceToClimbNm!);
    expect(tailwind.distanceToClimbNm).toBeGreaterThan(noWind.distanceToClimbNm!);
  });

  it('warns when cruise altitude is less than or equal to departure altitude', () => {
    const input = {
      weight: 2550,
      pressureAltitude: 4000,
      cruiseAltitude: 2000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const result = calculateClimb(input, archer2.climb)!;

    expect(result!.warnings.some(w => w.includes('must be higher than departure altitude'))).toBe(true);
    expect(result.timeToClimbMinutes).toBeUndefined();
  });

  it('warns when cruise altitude exceeds aircraft service ceiling', () => {
    const input = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 14000, // Archer II service ceiling is 13,650 ft
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const result = calculateClimb(input, archer2.climb)!;

    expect(result!.warnings.some(w => w.includes('exceeds certified service ceiling'))).toBe(true);
  });
});

describe('Fleet JSON Integrity', () => {
  it('has valid structure for all aircraft', () => {
    const tailNumbers = Object.keys(fleet);
    expect(tailNumbers.length).toBeGreaterThan(0);

    for (const tailNumber of tailNumbers) {
      const aircraft = fleet[tailNumber];
      
      expect(aircraft).not.toHaveProperty('id');
      expect(aircraft).toHaveProperty('name');
      expect(aircraft).toHaveProperty('maxWeight');
      expect(aircraft).toHaveProperty('minWeight');
      expect(aircraft).toHaveProperty('takeoff');
      expect(aircraft).toHaveProperty('climb');
      expect(aircraft).toHaveProperty('landing');
      
      expect(typeof aircraft.name).toBe('string');
      expect(typeof aircraft.maxWeight).toBe('number');
      expect(typeof aircraft.minWeight).toBe('number');
      
      expect(Array.isArray(aircraft.takeoff)).toBe(true);
      expect(Array.isArray(aircraft.landing)).toBe(true);
      
      expect(aircraft.takeoff.length).toBeGreaterThan(0);
      expect(aircraft.landing.length).toBeGreaterThan(0);
      
      expect(typeof aircraft.climb).toBe('object');
      expect(aircraft.climb).toHaveProperty('tables');
      expect(Array.isArray(aircraft.climb.tables)).toBe(true);
    }
  });

  it('verifies performance calculations can run for every tail number', () => {
    const input = {
      weight: 2000,
      pressureAltitude: 0,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };

    const tailNumbers = Object.keys(fleet);
    for (const tailNumber of tailNumbers) {
      const aircraft = fleet[tailNumber];

      // Test takeoff roll
      const takeoffTable = aircraft.takeoff[0];
      const takeoffResult = calculateTable(input, takeoffTable);
      expect(takeoffResult).not.toBeNull();
      expect(takeoffResult!.value).toBeGreaterThan(0);

      // Test landing roll
      const landingTable = aircraft.landing[0];
      const landingResult = calculateTable(input, landingTable);
      expect(landingResult).not.toBeNull();
      expect(landingResult!.value).toBeGreaterThan(0);

      // Test climb
      if (aircraft.climb) {
        const climbInput = { ...input, cruiseAltitude: 5000 };
        const climbResult = calculateClimb(climbInput, aircraft.climb);
        if (climbResult) {
            expect(climbResult!.value).toBeGreaterThan(0);
        }
      }
    }
  });
});


describe('Chart-based wind correction and extrapolation (Archer II Fig 5-9)', () => {
  const table = archer2.takeoff.find(t => t.id === 'takeoff-flaps25-50ft')!;
  const base = { weight: 2200, pressureAltitude: 2000, temperature: 21, windKnots: 8, isHeadwind: true, surfacePaved: true };

  it('uses the chart wind lines, not the generic rule (2200 lbs, 8 kt headwind reads 1572 ft on the chart)', () => {
    const r = calculateTable(base, table)!;
    expect(Math.abs(r.value - 1572)).toBeLessThanOrEqual(15);
    expect(r.warnings).toEqual([]);
  });

  it('caps headwind credit at the chart maximum (15 kts) and warns', () => {
    const at15 = calculateTable({ ...base, windKnots: 15 }, table)!;
    const at20 = calculateTable({ ...base, windKnots: 20 }, table)!;
    expect(at20.value).toBe(at15.value);
    expect(at20.warnings.some(w => w.includes('Headwind above 15 kts'))).toBe(true);
  });

  it('extends the tailwind lines past 5 kts with a warning', () => {
    const at5 = calculateTable({ ...base, windKnots: 5, isHeadwind: false }, table)!;
    const at8 = calculateTable({ ...base, windKnots: 8, isHeadwind: false }, table)!;
    expect(at8.value).toBeGreaterThan(at5.value);
    expect(at5.warnings).toEqual([]);
    expect(at8.warnings.some(w => w.includes('Tailwind above 5 kts'))).toBe(true);
  });

  it('warns when conditions are outside the printed chart', () => {
    const r = calculateTable({ ...base, pressureAltitude: 8000, temperature: 40, windKnots: 0 }, table)!;
    expect(r.warnings.some(w => w.includes('beyond the edge of the printed POH Fig 5-9'))).toBe(true);
  });
});
