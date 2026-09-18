import { describe, it, expect } from 'vitest';
import { calculateTable, calculateClimb } from '../performance';
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
    
    expect(rollResult.value).toBeGreaterThan(0);
    expect(clearanceResult.value).toBeGreaterThan(rollResult.value);
    expect(rollResult.warnings.length).toBe(0);
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
    expect(resultRoll.value).toBe(1452);
    expect(result50ft.value).toBe(2696);
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

    expect(resultRoll.value).toBe(864);
    expect(result50ft.value).toBe(1901);
  });

  it('verifies exact POH tabular points for Archer II Takeoff (Flaps Up)', () => {
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

    expect(resultRoll.value).toBe(1022);
    expect(result50ft.value).toBe(2020);
  });

  it('verifies exact POH tabular points for Archer II Takeoff (25° Flaps)', () => {
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

    expect(resultRoll.value).toBe(867);
    expect(result50ft.value).toBe(1773);
  });

  it('verifies exact POH tabular points for Archer II Landing', () => {
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

    expect(resultRoll.value).toBe(799);
    expect(result50ft.value).toBe(1283);
  });

  it('verifies exact Piper POH worked example for Archer II Flaps Up Takeoff (Figures 5-7 & 5-11)', () => {
    const inputZeroWind = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true
    };
    const tableRoll = archer2.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    const table50ft = archer2.takeoff.find(t => t.metric === 'clearance50ft' && t.configuration === 'Flaps Up (0°)')!;

    const resultRollZeroWind = calculateTable(inputZeroWind, tableRoll);
    const result50ftZeroWind = calculateTable(inputZeroWind, table50ft);

    expect(Math.abs(result50ftZeroWind.value - 2350)).toBeLessThanOrEqual(2);
    expect(Math.abs(resultRollZeroWind.value - 1220)).toBeLessThanOrEqual(2);

    const inputWind = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots: 8,
      isHeadwind: true,
      surfacePaved: true
    };

    const resultRollWind = calculateTable(inputWind, tableRoll);
    expect(Math.abs(resultRollWind.value - 1111)).toBeLessThanOrEqual(2);
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

    expect(Math.abs(result50ftZeroWind.value - 2040)).toBeLessThanOrEqual(3);
    expect(Math.abs(resultRollZeroWind.value - 1040)).toBeLessThanOrEqual(3);

    const inputWind = {
      weight: 2400,
      pressureAltitude: 2000,
      temperature: 21,
      windKnots: 8,
      isHeadwind: true,
      surfacePaved: true
    };

    const result50ftWind = calculateTable(inputWind, table50ft);
    expect(Math.abs(result50ftWind.value - 1860)).toBeLessThanOrEqual(2);
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

    expect(Math.abs(result50ft.value - 1290)).toBeLessThanOrEqual(2);
    expect(Math.abs(resultRoll.value - 825)).toBeLessThanOrEqual(5);
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

    expect(resultRoll.value).toBeGreaterThan(700);
    expect(resultRoll.value).toBeLessThan(1452);
    expect(result50ft.value).toBeGreaterThan(1300);
    expect(result50ft.value).toBeLessThan(2696);
  });

  it('applies headwind correction (-10% per 9 knots)', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;
    
    const baseInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const base = calculateTable(baseInput, tableRoll);

    const windInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 9, isHeadwind: true, surfacePaved: true };
    const withWind = calculateTable(windInput, tableRoll);

    expect(withWind.value).toBeLessThan(base.value);
    expect(Math.abs(withWind.value - base.value * 0.9)).toBeLessThan(2);
  });

  it('applies tailwind correction (+10% per 2 knots) and warns > 10kts', () => {
    const tableRoll = c172n.takeoff.find(t => t.metric === 'groundRoll' && t.configuration === 'Flaps Up (0°)')!;

    const baseInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const base = calculateTable(baseInput, tableRoll);

    const windInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 2, isHeadwind: false, surfacePaved: true };
    const withWind = calculateTable(windInput, tableRoll);

    expect(withWind.value).toBeGreaterThan(base.value);
    expect(Math.abs(withWind.value - base.value * 1.1)).toBeLessThan(2);

    const warningInput = { weight: 2000, pressureAltitude: 0, temperature: 15, windKnots: 11, isHeadwind: false, surfacePaved: true };
    const warningWind = calculateTable(warningInput, tableRoll);

    expect(warningWind.warnings).toContain('Tailwind > 10 kts is not recommended/approved for this aircraft.');
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

    expect(Math.abs(unpavedRoll.value - baseRoll.value * 1.15)).toBeLessThan(2);
    expect(Math.abs(unpaved50ft.value - base50ft.value * 1.15)).toBeLessThan(2);
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
    
    expect(Math.abs(result.densityAltitude - 4257)).toBeLessThan(5);
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

    expect(bufferedRoll.baseValue).toBe(unbufferedRoll.value);
    expect(buffered50ft.baseValue).toBe(unbuffered50ft.value);
    expect(bufferedRoll.value).toBe(Math.round(unbufferedRoll.value * 1.50));
    expect(buffered50ft.value).toBe(Math.round(unbuffered50ft.value * 1.50));
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

    expect(result.value).toBeGreaterThan(590);
    expect(result.value).toBeLessThan(650);
  });

  it('C172N at 2300 lbs / SL / 20°C → ~720 FPM', () => {
    const input = { weight: 2300, pressureAltitude: 0, temperature: 20, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, c172n.climb)!;

    expect(result.value).toBeGreaterThan(690);
    expect(result.value).toBeLessThan(750);
  });

  it('Climb operation returns correct operation flag', () => {
    const input = { weight: 2550, pressureAltitude: 0, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, archer2.climb)!;

    expect(result.metric).toBe('rateOfClimb');
  });

  it('Climb gradient > 0 when ROC > 0', () => {
    const input = { weight: 2300, pressureAltitude: 2000, temperature: 15, windKnots: 0, isHeadwind: true, surfacePaved: true };
    const result = calculateClimb(input, c172n.climb)!;

    expect(result.value).toBeGreaterThan(0);
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

  it('calculates Archer II time, distance, and fuel to climb matching Figure 5-17 example', () => {
    const input = {
      weight: 2550,
      pressureAltitude: 2000,
      cruiseAltitude: 6000,
      temperature: 15,
      windKnots: 0,
      isHeadwind: true,
      surfacePaved: true,
    };
    const result = calculateClimb(input, archer2.climb)!;

    // Fig 5-17 example: 2000 to 6000 ft -> Time: 8.5 min, Distance: 11.5 NM
    expect(result.timeToClimbMinutes).toBe(8.5);
    expect(result.distanceToClimbNm).toBe(11.5);
    expect(result.fuelToClimbGallons).toBe(1.5);
    expect(result.timeDistanceFuelFigure).toBe('POH Fig 5-17');
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

    expect(result.warnings.some(w => w.includes('must be higher than departure altitude'))).toBe(true);
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

    expect(result.warnings.some(w => w.includes('exceeds certified service ceiling'))).toBe(true);
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
            expect(climbResult.value).toBeGreaterThan(0);
        }
      }
    }
  });
});

