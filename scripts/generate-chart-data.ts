/**
 * Regenerates POH chart-derived data from the calibrated chart geometry in
 * src/data/nomogram_meta.json:
 *
 *   1. Each chart's data in src/data/fleet.json:
 *      - Takeoff/landing distance charts: the zero-wind grid, off-chart flags, and wind
 *        correction from the chart's wind lines
 *      - Rate of climb chart: the rate-of-climb grid and off-chart flags
 *      - Time, distance and fuel to climb chart: the climb profile table (altitude × temperature)
 *   2. A test fixture of chart readings at random in-between conditions, used to
 *      check that interpolating the data stays within ±1% of the chart
 *
 * Run from the project root:
 *   node --experimental-strip-types scripts/generate-chart-data.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { traceChart, polylineY, valueToX, yToValue, PROFILE_QUANTITIES } from '../src/engine/nomogram.ts';
import type { NomogramMeta, NomogramTrace, Polyline } from '../src/engine/nomogram.ts';

type Range = [from: number, to: number, step: number];

interface DistanceChart {
  kind: 'distance';
  chartId: string;
  aircraft: string;
  operation: 'takeoff' | 'landing';
  tableId: string;
  figure: string;
  grid: { weight: Range; altitude: Range; temperature: Range };
  /** Wind speeds to store, up to the end of the chart's printed headwind / tailwind lines */
  headwindKnots: number[];
  tailwindKnots: number[];
}

interface RocChart {
  kind: 'roc';
  chartId: string;
  aircraft: string;
  tableId: string;
  figure: string;
  /** The chart is for one weight; its readings are used at every weight in this range (conservative at lighter weights) */
  grid: { weight: Range; altitude: Range; temperature: Range };
}

interface ProfileChart {
  kind: 'profile';
  chartId: string;
  aircraft: string;
  figure: string;
  grid: { altitude: Range; temperature: Range };
}

// Grids reach one altitude line past the highest printed line, and 20°C past the printed 30°C
// (or 10°C past 40°C), so results there are extrapolated with a warning rather than unavailable.
const DISTANCE_GRID = { weight: [2000, 2550, 50], altitude: [0, 8000, 500], temperature: [-20, 50, 5] } satisfies DistanceChart['grid'];
const DISTANCE_WIND = { headwindKnots: [0, 5, 10, 15], tailwindKnots: [0, 5] };

const CHARTS: (DistanceChart | RocChart | ProfileChart)[] = [
  { kind: 'distance', chartId: 'fig_5_7_takeoff_flaps0_50ft', aircraft: 'N0002', operation: 'takeoff', tableId: 'takeoff-flaps0-50ft', figure: 'POH Fig 5-7', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'distance', chartId: 'fig_5_9_takeoff_flaps25_50ft', aircraft: 'N0002', operation: 'takeoff', tableId: 'takeoff-flaps25-50ft', figure: 'POH Fig 5-9', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'distance', chartId: 'fig_5_11_takeoff_flaps0_roll', aircraft: 'N0002', operation: 'takeoff', tableId: 'takeoff-flaps0-roll', figure: 'POH Fig 5-11', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'distance', chartId: 'fig_5_13_takeoff_flaps25_roll', aircraft: 'N0002', operation: 'takeoff', tableId: 'takeoff-flaps25-roll', figure: 'POH Fig 5-13', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'distance', chartId: 'fig_5_35_landing_flaps40_50ft', aircraft: 'N0002', operation: 'landing', tableId: 'landing-50ft', figure: 'POH Fig 5-35', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'distance', chartId: 'fig_5_37_landing_flaps40_roll', aircraft: 'N0002', operation: 'landing', tableId: 'landing-roll', figure: 'POH Fig 5-37', grid: DISTANCE_GRID, ...DISTANCE_WIND },
  { kind: 'roc', chartId: 'fig_5_15_climb_roc', aircraft: 'N0002', tableId: 'climb-roc', figure: 'POH Fig 5-15', grid: { weight: [2000, 2550, 550], altitude: [0, 8000, 500], temperature: [-20, 50, 5] } },
  { kind: 'profile', chartId: 'fig_5_17_climb_profile', aircraft: 'N0002', figure: 'POH Fig 5-17', grid: { altitude: [0, 13000, 250], temperature: [-20, 50, 2.5] } },
];

const FIXTURE_POINTS = 500;
const META_PATH = 'src/data/nomogram_meta.json';
const FLEET_PATH = 'src/data/fleet.json';
const FIXTURE_DIR = 'src/engine/__tests__/fixtures';

const range = ([from, to, step]: Range) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Seeded PRNG so the fixture is identical on every run (mulberry32). */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2-space JSON with non-ASCII characters escaped, matching fleet.json. */
const toJson = (value: unknown) =>
  JSON.stringify(value, null, 2).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

/** Index just past the JSON object or array that starts at `start`. */
function valueEnd(text: string, start: number): number {
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return i + 1;
  }
  throw new Error(`Unterminated JSON value at ${start} in ${FLEET_PATH}`);
}

/** Replace text[start, end) with `value` serialised at the indentation of the line it starts on. */
function spliceJson(text: string, start: number, end: number, value: unknown): string {
  const indent = text.slice(text.lastIndexOf('\n', start) + 1, start).match(/^\s*/)![0];
  return text.slice(0, start) + toJson(value).replace(/\n/g, '\n' + indent) + text.slice(end);
}

/**
 * Replace one table object in the fleet.json text, leaving every other byte as it was
 * (a full re-serialise would rewrite numbers such as 0.0 elsewhere in the file).
 */
function replaceTableText(text: string, aircraft: string, tableId: string, table: unknown): string {
  const from = aircraftStart(text, aircraft);
  const to = valueEnd(text, from);
  const key = `"id": "${tableId}"`;
  const found = [];
  for (let at = text.indexOf(key, from); at !== -1 && at < to; at = text.indexOf(key, at + 1)) found.push(at);
  if (found.length !== 1) throw new Error(`Expected exactly one table "${tableId}" in ${aircraft} in ${FLEET_PATH}`);
  const start = text.lastIndexOf('{', found[0]);
  return spliceJson(text, start, valueEnd(text, start), table);
}

/** Replace the climb profile of one aircraft (its "profile" or "profileTable" entry) with a "profileTable" entry. */
function replaceProfileText(text: string, aircraft: string, profileTable: unknown): string {
  const climbAt = text.indexOf('"climb": {', aircraftStart(text, aircraft));
  const climbEnd = valueEnd(text, text.indexOf('{', climbAt));
  const keys = ['"profileTable": ', '"profile": '].map(k => ({ k, at: text.indexOf(k, climbAt) })).filter(({ at }) => at !== -1 && at < climbEnd);
  if (keys.length !== 1) throw new Error(`Expected exactly one climb profile in ${aircraft} in ${FLEET_PATH}`);
  const valueStart = keys[0].at + keys[0].k.length;
  const replaced = spliceJson(text, valueStart, valueEnd(text, valueStart), profileTable);
  return replaced.slice(0, keys[0].at) + '"profileTable": ' + replaced.slice(valueStart);
}

function aircraftStart(text: string, aircraft: string): number {
  const keyAt = text.indexOf(`"${aircraft}": {`);
  if (keyAt === -1) throw new Error(`No aircraft ${aircraft} in ${FLEET_PATH}`);
  return text.indexOf('{', keyAt);
}

/** Rebuild a table object, keeping its descriptive fields and key order. */
function rebuildTable(table: Record<string, unknown>, fields: Record<string, unknown>) {
  const known = ['id', 'label', 'configuration', 'metric', 'figure', 'weights', 'altitudes', 'temperatures', 'data', 'extrapolated', 'windCorrection'];
  const unknown = Object.keys(table).filter(k => !known.includes(k));
  if (unknown.length) throw new Error(`${table.id} has fields this script would drop: ${unknown.join(', ')}`);
  const { id, label, configuration, metric, figure } = table;
  return { id, label, configuration, metric, figure, ...fields };
}

function writeFixture(chartId: string, figure: string, note: string, points: unknown[]) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(`${FIXTURE_DIR}/${chartId}_readings.json`, JSON.stringify({
    source: `Generated by scripts/generate-chart-data.ts from the calibrated ${figure} chart`,
    note,
    points,
  }, null, 2) + '\n');
}

/** Random on-chart conditions, and the chart's reading for each. */
function sampleOnChart<I>(meta: NomogramMeta, pick: (between: (r: number[], decimals: number) => number) => I, read: (trace: NomogramTrace) => object) {
  const rand = random(0x5eed);
  const between = ([from, to]: number[], decimals: number) => Number((from + rand() * (to - from)).toFixed(decimals));
  const points = [];
  for (let tries = 0; points.length < FIXTURE_POINTS; tries++) {
    if (tries > FIXTURE_POINTS * 100) throw new Error('Too few random conditions land on the printed chart');
    const inputs = pick(between);
    const trace = traceChart(meta, inputs as never);
    if (trace.offChart) continue;
    points.push({ ...inputs, ...read(trace) });
  }
  return points;
}

const metaAll = JSON.parse(readFileSync(META_PATH, 'utf8'));
let fleetText = readFileSync(FLEET_PATH, 'utf8');
const fleet = JSON.parse(fleetText);

for (const chart of CHARTS) {
  const meta: NomogramMeta = metaAll[chart.chartId];
  if (!meta) throw new Error(`No chart ${chart.chartId} in ${META_PATH}`);
  const aircraft = fleet[chart.aircraft];
  if (!aircraft) throw new Error(`No aircraft ${chart.aircraft} in ${FLEET_PATH}`);
  const altitudes = range(chart.grid.altitude);
  const temperatures = range(chart.grid.temperature);
  let offChart = 0;

  if (chart.kind === 'profile') {
    const traces = altitudes.map(altitude => temperatures.map(oat => traceChart(meta, { oat, altitude })));
    const grid = (name: string) => traces.map(a => a.map(tr => Number(tr.results.find(r => r.name === name)!.value.toFixed(2))));
    const profileTable = {
      figure: chart.figure,
      altitudes,
      temperatures,
      timeMinutes: grid('time'),
      distanceNm: grid('distance'),
      fuelGallons: grid('fuel'),
      extrapolated: traces.map(a => a.map(tr => (tr.offChart ? 1 : 0))),
    };
    delete aircraft.climb.profile;
    aircraft.climb.profileTable = profileTable;
    fleetText = replaceProfileText(fleetText, chart.aircraft, profileTable);
    offChart = profileTable.extrapolated.flat().filter(f => f === 1).length;

    writeFixture(chart.chartId, chart.figure, 'Cumulative values as read off the chart (the chart starts at about 0.5 at sea level); only differences between altitudes are used.',
      sampleOnChart(meta,
        between => ({ altitude: between(chart.grid.altitude, 0), oat: between(chart.grid.temperature, 1) }),
        trace => Object.fromEntries(PROFILE_QUANTITIES.map(q => [q, Number(trace.results.find(r => r.name === q)!.value.toFixed(2))]))));
    console.log(`${chart.chartId}: ${altitudes.length}×${temperatures.length} profile grid (${offChart} off-chart), ${FIXTURE_POINTS} fixture points`);
    continue;
  }

  const tables = chart.kind === 'roc' ? aircraft.climb.tables : aircraft[chart.operation];
  const table = tables?.find((t: { id: string }) => t.id === chart.tableId);
  if (!table) throw new Error(`No table ${chart.aircraft}/${chart.tableId} in ${FLEET_PATH}`);
  const weights = range(chart.grid.weight);
  // The rate-of-climb chart has no weight input; the distance charts are traced at each weight
  const traces = weights.map(weight => altitudes.map(altitude => temperatures.map(oat =>
    traceChart(meta, { oat, altitude, weight, wind: 0 }))));
  const fields: Record<string, unknown> = {
    weights, altitudes, temperatures,
    data: traces.map(a => a.map(t => t.map(tr => Math.round(tr.result)))),
    // 0/1 rather than false/true: several times smaller in the bundle
    extrapolated: traces.map(a => a.map(t => t.map(tr => (tr.offChart ? 1 : 0)))),
  };

  if (chart.kind === 'distance') {
    // Wind correction: distance along each wind guide line, read at each stored wind speed
    const { axes } = meta as Required<NomogramMeta>;
    const outputAxis = axes.outputAxis!, windScale = axes.windScale!;
    const plot = meta.plotArea ?? { top: outputAxis.p2[1], bottom: outputAxis.p1[1] };
    const readLines = (lines: Polyline[], knots: number[]) => {
      const rows = [...lines]
        .map(line => knots.map(k => Math.round(yToValue(outputAxis, polylineY(line, valueToX(windScale, k))))))
        .sort((a, b) => a[0] - b[0]);
      return { zeroWindDistances: rows.map(row => row[0]), knots, distances: rows };
    };
    fields.windCorrection = {
      source: `${chart.figure} headwind and tailwind guide lines`,
      printedDistances: [plot.bottom, plot.top].map(y => Math.round(yToValue(outputAxis, y))),
      headwind: readLines(axes.headwindGuides!, chart.headwindKnots),
      tailwind: readLines(axes.tailwindGuides!, chart.tailwindKnots),
    };
  }

  const rebuilt = rebuildTable(table, fields);
  tables[tables.indexOf(table)] = rebuilt;
  fleetText = replaceTableText(fleetText, chart.aircraft, chart.tableId, rebuilt);
  offChart = (rebuilt.extrapolated as number[][][]).flat(2).filter(f => f === 1).length;

  const points = chart.kind === 'distance'
    ? sampleOnChart(meta,
        between => ({
          weight: between(chart.grid.weight, 0),
          altitude: between(chart.grid.altitude, 0),
          oat: between(chart.grid.temperature, 1),
          wind: between([-chart.tailwindKnots.at(-1)!, chart.headwindKnots.at(-1)!], 1),
        }),
        trace => ({ chartReading: Math.round(trace.result) }))
    : sampleOnChart(meta,
        between => ({ weight: between(chart.grid.weight, 0), altitude: between(chart.grid.altitude, 0), oat: between(chart.grid.temperature, 1) }),
        trace => ({ chartReading: Math.round(trace.result) }));
  writeFixture(chart.chartId, chart.figure,
    chart.kind === 'distance'
      ? 'wind: knots, positive = headwind, negative = tailwind. chartReading: ft, zero safety buffer, paved runway.'
      : 'chartReading: rate of climb, ft/min. The chart is for one weight; its reading applies at every weight.',
    points);
  console.log(`${chart.chartId}: ${weights.length}×${altitudes.length}×${temperatures.length} grid (${offChart} off-chart), ${points.length} fixture points`);
}

// The edited text must parse to exactly the intended data before it is written
if (JSON.stringify(JSON.parse(fleetText)) !== JSON.stringify(fleet)) {
  throw new Error(`Editing ${FLEET_PATH} did not produce the expected data; nothing written.`);
}
writeFileSync(FLEET_PATH, fleetText);
