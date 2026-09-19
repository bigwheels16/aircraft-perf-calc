import { describe, it, expect } from 'vitest';
import nomogramMetaRaw from '../../data/nomogram_meta.json';
import { canTrace, traceChart, traceNomogram } from '../nomogram';
import type { NomogramMeta } from '../nomogram';

const nomogramMeta = nomogramMetaRaw as unknown as Record<string, NomogramMeta>;

// POH printed worked examples. Where a printed example disagrees with the chart's own lines,
// the tolerance covers the difference and the reason is given.
const distanceExamples = [
  { chartId: 'fig_5_7_takeoff_flaps0_50ft', inputs: { oat: 21, altitude: 2000, weight: 2400, wind: 15 }, printed: 1900, tolerance: 20 },
  { chartId: 'fig_5_9_takeoff_flaps25_50ft', inputs: { oat: 21, altitude: 2000, weight: 2400, wind: 8 }, printed: 1860, tolerance: 20 },
  // The printed example's wind leg is steeper than the chart's own headwind lines;
  // following the lines gives ~1140 ft (+3.6%)
  { chartId: 'fig_5_11_takeoff_flaps0_roll', inputs: { oat: 21, altitude: 2000, weight: 2400, wind: 8 }, printed: 1100, tolerance: 45 },
  // The printed example turns up from 20°C, not 21°C, and its dashes end at ~940 ft;
  // following the lines from 21°C gives ~977 ft (+2.8%)
  { chartId: 'fig_5_13_takeoff_flaps25_roll', inputs: { oat: 21, altitude: 2000, weight: 2400, wind: 10 }, printed: 950, tolerance: 30 },
  { chartId: 'fig_5_35_landing_flaps40_50ft', inputs: { oat: 21, altitude: 2300, weight: 2264, wind: 5 }, printed: 1290, tolerance: 15 },
  { chartId: 'fig_5_37_landing_flaps40_roll', inputs: { oat: 21, altitude: 2300, weight: 2264, wind: 5 }, printed: 825, tolerance: 10 },
  { chartId: 'fig_5_15_climb_roc', inputs: { oat: -1, altitude: 3600 }, printed: 620, tolerance: 5 },
];

describe('POH charts', () => {
  it('contains all 8 POH charts, each traceable', () => {
    [...distanceExamples.map(e => e.chartId), 'fig_5_17_climb_profile'].forEach(chartId => {
      expect(nomogramMeta).toHaveProperty(chartId);
      expect(canTrace(nomogramMeta[chartId])).toBe(true);
    });
  });

  it.each(distanceExamples)('$chartId reproduces the POH printed example ($printed)', ({ chartId, inputs, printed, tolerance }) => {
    const trace = traceChart(nomogramMeta[chartId], inputs);
    expect(Math.abs(trace.result - printed)).toBeLessThanOrEqual(tolerance);
    expect(trace.offChart).toBe(false);
  });

  it.each(distanceExamples)('$chartId draws a connected path that stays on the chart for the example', ({ chartId, inputs }) => {
    const trace = traceChart(nomogramMeta[chartId], inputs);
    const main = trace.segments.filter(s => !s.step.startsWith('output-'));
    for (let i = 1; i < main.length; i++) {
      const prevEnd = main[i - 1].points.slice(-1)[0];
      expect(main[i].points[0][0]).toBeCloseTo(prevEnd[0], 5);
      expect(main[i].points[0][1]).toBeCloseTo(prevEnd[1], 5);
    }
    expect(trace.segments.slice(-1)[0].points.slice(-1)[0]).toEqual(trace.resultPoint);
    expect(trace.inputLines[0].points[1]).toEqual(trace.segments[0].points[0]);
  });

  it.each(distanceExamples)('$chartId flags conditions beyond the printed lines', ({ chartId, inputs }) => {
    const meta: NomogramMeta = nomogramMeta[chartId];
    const top = Math.max(...meta.axes.altitudeCurves.map(c => c.value));
    // Above the printed temperature scale (lines end at 30°C), and above the highest altitude line
    expect(traceChart(meta, { ...inputs, oat: 35 }).offChart).toBe(true);
    expect(traceChart(meta, { ...inputs, oat: -20, altitude: top + 500 }).offChart).toBe(true);
  });

  it.each(distanceExamples.filter(e => e.chartId !== 'fig_5_15_climb_roc'))('$chartId gives longer distances for hotter, higher, heavier, and tailwind conditions', ({ chartId }) => {
    const base = { oat: 15, altitude: 2000, weight: 2300, wind: 0 };
    const r = (o: Partial<typeof base>) => traceChart(nomogramMeta[chartId], { ...base, ...o }).result;
    expect(r({ oat: 25 })).toBeGreaterThan(r({}));
    expect(r({ altitude: 4000 })).toBeGreaterThan(r({}));
    expect(r({ weight: 2500 })).toBeGreaterThan(r({}));
    expect(r({ wind: -3 })).toBeGreaterThan(r({}));
    expect(r({ wind: 10 })).toBeLessThan(r({}));
  });

  it('fig_5_15_climb_roc gives lower rates of climb when hotter and higher', () => {
    const r = (oat: number, altitude: number) => traceChart(nomogramMeta.fig_5_15_climb_roc, { oat, altitude }).result;
    expect(r(20, 2000)).toBeLessThan(r(10, 2000));
    expect(r(10, 4000)).toBeLessThan(r(10, 2000));
  });
});

describe('Nomogram tracing (Fig 5-17, time, fuel and distance to climb)', () => {
  const meta = nomogramMeta.fig_5_17_climb_profile as NomogramMeta;
  const read = (oat: number, altitude: number) => {
    const trace = traceChart(meta, { oat, altitude });
    return { ...Object.fromEntries(trace.results.map(r => [r.name, r.value])), offChart: trace.offChart } as Record<string, number | boolean>;
  };

  // Printed examples; fuel is printed in whole gallons (1 gal is ~9 px on the scale)
  it.each([
    { oat: 21, altitude: 2000, time: 3, distance: 4.5, fuel: 1 },
    { oat: 13, altitude: 6000, time: 11.5, distance: 16, fuel: 2 },
  ])('reproduces the POH printed example at $altitude ft, $oat°C', ({ oat, altitude, time, distance, fuel }) => {
    const r = read(oat, altitude);
    expect(Math.abs((r.time as number) - time)).toBeLessThanOrEqual(0.25);
    expect(Math.abs((r.distance as number) - distance)).toBeLessThanOrEqual(0.25);
    expect(Math.abs((r.fuel as number) - fuel)).toBeLessThanOrEqual(0.35);
    expect(r.offChart).toBe(false);
  });

  it('drops a line from each curve to the scale', () => {
    const trace = traceChart(meta, { oat: 21, altitude: 2000 });
    expect(trace.results.map(r => r.name)).toEqual(['time', 'distance', 'fuel']);
    for (const r of trace.results) {
      const drop = trace.segments.find(s => s.step === `output-${r.name}`)!.points;
      expect(drop[1]).toEqual(r.point);
      expect(drop[0][1]).toBeCloseTo(trace.segments[0].points[0][1], 5);
    }
  });

  it('flags conditions beyond the printed lines', () => {
    expect(read(45, 2000).offChart).toBe(true);
    expect(read(20, 12000).offChart).toBe(true);
    expect(read(0, 13000).offChart).toBe(true);
    expect(read(-5, 10000).offChart).toBe(false);
  });
});

describe('Nomogram tracing (Fig 5-9, 25° flaps takeoff over 50 ft)', () => {
  const meta = nomogramMeta.fig_5_9_takeoff_flaps25_50ft as NomogramMeta;

  it('has the guide data needed to trace', () => {
    expect(canTrace(meta)).toBe(true);
  });

  it('reproduces the POH printed example (21°C, 2000 ft, 2400 lbs, 8 kt headwind = 1860 ft)', () => {
    const trace = traceNomogram(meta, { oat: 21, altitude: 2000, weight: 2400, wind: 8 });
    expect(trace.result).toBeGreaterThan(1860 - 20);
    expect(trace.result).toBeLessThan(1860 + 20);
    expect(trace.offChart).toBe(false);
  });

  it('turns at the same points as the printed example path', () => {
    const trace = traceNomogram(meta, { oat: 21, altitude: 2000, weight: 2400, wind: 8 });
    const end = (step: string) => trace.segments.find(s => s.step === step)!.points.slice(-1)[0];
    // Pixel positions of the dashed example lines printed on the chart
    expect(Math.abs(end('altitude')[1] - 560)).toBeLessThanOrEqual(3);
    expect(Math.abs(end('weight')[1] - 623)).toBeLessThanOrEqual(3);
    expect(Math.abs(end('wind')[1] - 683)).toBeLessThanOrEqual(3);
  });

  it('draws a connected path from the OAT axis to the output axis', () => {
    const trace = traceNomogram(meta, { oat: 10, altitude: 4000, weight: 2200, wind: 5 });
    for (let i = 1; i < trace.segments.length; i++) {
      const prevEnd = trace.segments[i - 1].points.slice(-1)[0];
      const start = trace.segments[i].points[0];
      expect(start[0]).toBeCloseTo(prevEnd[0], 5);
      expect(start[1]).toBeCloseTo(prevEnd[1], 5);
    }
    expect(trace.resultPoint[0]).toBe(meta.axes.outputAxis!.p1[0]);
  });

  it('draws lines up from the OAT, weight and wind scales to where the trace turns', () => {
    const trace = traceNomogram(meta, { oat: 21, altitude: 2000, weight: 2400, wind: 8 });
    const line = (input: string) => trace.inputLines.find(l => l.input === input)!.points;
    const end = (step: string) => trace.segments.find(s => s.step === step)!.points.slice(-1)[0];
    // Start on the printed scale ticks (2400 lbs and 8 kt), end on the trace
    expect(Math.abs(line('weight')[0][0] - 880.5)).toBeLessThanOrEqual(2);
    expect(Math.abs(line('wind')[0][0] - 1227.8)).toBeLessThanOrEqual(2);
    expect(line('weight')[0][1]).toBe(meta.axes.weightScale!.p1[1]);
    expect(line('weight')[1]).toEqual(end('weight'));
    expect(line('wind')[1]).toEqual(end('wind'));
    // OAT line rises from 21°C to the pressure altitude turn
    expect(line('oat')[0][1]).toBe(meta.axes.oat.p1[1]);
    expect(line('oat')[1]).toEqual(trace.segments[0].points[0]);
  });

  it('gives longer distances for hotter, higher, heavier, and tailwind conditions', () => {
    const base = { oat: 15, altitude: 2000, weight: 2300, wind: 0 };
    const r = (o: Partial<typeof base>) => traceNomogram(meta, { ...base, ...o }).result;
    expect(r({ oat: 25 })).toBeGreaterThan(r({}));
    expect(r({ altitude: 4000 })).toBeGreaterThan(r({}));
    expect(r({ weight: 2500 })).toBeGreaterThan(r({}));
    expect(r({ wind: -3 })).toBeGreaterThan(r({}));
    expect(r({ wind: 10 })).toBeLessThan(r({}));
  });

  it('flags traces that run off the printed chart', () => {
    expect(traceNomogram(meta, { oat: 30, altitude: 7000, weight: 2550, wind: 0 }).offChart).toBe(true);
    expect(traceNomogram(meta, { oat: -10, altitude: 0, weight: 2050, wind: 15 }).offChart).toBe(true);
    // Above the printed temperature scale (lines end at 30°C), even when the trace stays inside the plot
    expect(traceNomogram(meta, { oat: 30, altitude: 1000, weight: 2550, wind: 0 }).offChart).toBe(false);
    expect(traceNomogram(meta, { oat: 35, altitude: 1000, weight: 2550, wind: 0 }).offChart).toBe(true);
    expect(traceNomogram(meta, { oat: 40, altitude: 0, weight: 2550, wind: 0 }).offChart).toBe(true);
  });
});
