/**
 * Nomogram tracing: reproduces the path a pilot draws by hand on a POH
 * performance chart, using calibrated pixel coordinates from nomogram_meta.json.
 *
 * Every chart starts the same way: up from the OAT scale to the interpolated
 * pressure altitude line (an input line, like weight and wind). Then:
 *
 * "5-step" takeoff/landing distance charts
 *   - Across to reference line 1 (max weight)
 *   - Parallel to the weight guide curves to the gross weight
 *   - Across to reference line 2 (zero wind)
 *   - Parallel to the headwind / tailwind guide lines to the wind speed
 *   - Across to the output axis, where the distance is read
 *
 * "climb-roc" rate of climb charts
 *   - Across to the rate-of-climb line, then down to the rate-of-climb scale
 *
 * "climb-profile" time, fuel and distance to climb charts
 *   - Across to the time, distance and fuel curves, then down from each to the shared scale
 */

export type Point = [number, number];
export type Polyline = Point[];
export type ChartType = '5-step' | 'climb-roc' | 'climb-profile';
export type ProfileQuantity = 'time' | 'distance' | 'fuel';
export const PROFILE_QUANTITIES: ProfileQuantity[] = ['time', 'distance', 'fuel'];

export interface LinearAxis {
  p1: Point;
  v1: number;
  p2: Point;
  v2: number;
}

export interface NomogramMeta {
  /** Defaults to '5-step' */
  chartType?: ChartType;
  /** lbs; set when the chart is printed for a single gross weight (e.g. the climb charts) */
  chartWeight?: number;
  plotArea?: { top: number; bottom: number };
  axes: {
    /** printedRange: the lowest and highest temperature the chart's lines cover (°C) */
    oat: LinearAxis & { printedRange?: [number, number] };
    altitudeCurves: { value: number; points: Polyline }[];
    // 5-step
    outputAxis?: LinearAxis;
    referenceLine1?: { points: Polyline };
    referenceLine2?: { points: Polyline };
    weightScale?: LinearAxis;
    windScale?: LinearAxis;
    weightGuides?: Polyline[];
    headwindGuides?: Polyline[];
    tailwindGuides?: Polyline[];
    // climb-roc
    rocLine?: { points: Polyline };
    rocAxis?: LinearAxis;
    // climb-profile
    profileCurves?: Record<ProfileQuantity, { points: Polyline }>;
    valueAxis?: LinearAxis;
  };
}

export interface NomogramInputs {
  oat: number;
  altitude: number;
  /** lbs; 5-step charts only */
  weight?: number;
  /** Knots; positive = headwind, negative = tailwind; 5-step charts only */
  wind?: number;
}

export interface NomogramTrace {
  /** The calculation path, in image pixel coordinates */
  segments: { step: string; points: Polyline }[];
  /** Vertical lines up from the input scales to where the trace turns, showing the values used */
  inputLines: { input: 'oat' | 'weight' | 'wind'; points: Polyline }[];
  /** Every value read off the chart: one for distance and climb-rate charts; time, distance and fuel for profiles */
  results: { name: string; value: number; point: Point }[];
  /** The first (or only) result */
  result: number;
  resultPoint: Point;
  /** True when the trace leaves the printed chart, or uses a printed line past its ends */
  offChart: boolean;
}

/** Pixels a trace may run past a printed line's end before it counts as off the chart (digitizing error: ~7 lb or ~0.7°C). */
const DRAWN_TOLERANCE = 3;

export const chartType = (meta: NomogramMeta): ChartType => meta.chartType ?? '5-step';

/** True when the chart has all the data needed to trace it. */
export function canTrace(meta: NomogramMeta | undefined): meta is NomogramMeta {
  const a = meta?.axes;
  if (!meta || !a || !(a.altitudeCurves?.length >= 2)) return false;
  switch (chartType(meta)) {
    case '5-step':
      return !!(a.outputAxis && a.referenceLine1 && a.referenceLine2 && a.weightScale && a.windScale &&
        a.weightGuides?.length && a.headwindGuides?.length && a.tailwindGuides?.length);
    case 'climb-roc':
      return !!(a.rocLine && a.rocAxis);
    case 'climb-profile':
      return !!(a.profileCurves && a.valueAxis);
  }
}

export const valueToX = (axis: LinearAxis, v: number) =>
  axis.p1[0] + ((v - axis.v1) / (axis.v2 - axis.v1)) * (axis.p2[0] - axis.p1[0]);

export const xToValue = (axis: LinearAxis, x: number) =>
  axis.v1 + ((x - axis.p1[0]) / (axis.p2[0] - axis.p1[0])) * (axis.v2 - axis.v1);

export const yToValue = (axis: LinearAxis, y: number) =>
  axis.v1 + ((y - axis.p1[1]) / (axis.p2[1] - axis.p1[1])) * (axis.v2 - axis.v1);

/** Coordinate `1 - at` of a polyline where coordinate `at` equals v, extending its end segments linearly beyond the drawn ends. */
function polylineAt(line: Polyline, v: number, at: 0 | 1): number {
  const out = 1 - at;
  const pts = [...line].sort((a, b) => a[at] - b[at]);
  let i = pts.findIndex((p, k) => k > 0 && v <= p[at]);
  if (i === -1) i = pts.length - 1;
  const p0 = pts[i - 1];
  const p1 = pts[i];
  return p0[out] + ((v - p0[at]) / (p1[at] - p0[at])) * (p1[out] - p0[out]);
}

/** y of a polyline at x, extending its end segments linearly beyond the drawn ends. */
export const polylineY = (line: Polyline, x: number) => polylineAt(line, x, 0);

/** x of a polyline at y, extending its end segments linearly beyond the drawn ends. */
export const polylineX = (line: Polyline, y: number) => polylineAt(line, y, 1);

/** True when the printed line covers coordinate v (at 0 = x, 1 = y). */
function drawnAt(line: Polyline, v: number, at: 0 | 1 = 0): boolean {
  const vs = line.map(p => p[at]);
  return v >= Math.min(...vs) - DRAWN_TOLERANCE && v <= Math.max(...vs) + DRAWN_TOLERANCE;
}

/** Index of the lower of the two neighbouring values and the fraction between them (t < 0 or > 1 past the ends). */
function bracket(values: number[], v: number): { i: number; t: number } {
  let i = 0;
  while (i < values.length - 2 && v > values[i + 1]) i++;
  return { i, t: (v - values[i]) / (values[i + 1] - values[i]) };
}

/**
 * Follow a family of guide curves from x = xFrom (starting at height y) to x = xTo,
 * keeping the same proportional position between the two neighbouring guides —
 * the "parallel to the nearest lines" move a pilot makes with a ruler.
 *
 * onChart is false when the start lies outside the outermost guides, or when neither
 * neighbouring guide is printed where the path ends.
 */
export function followGuides(guides: Polyline[], xFrom: number, y: number, xTo: number, steps = 24): { path: Polyline; onChart: boolean } {
  const sorted = [...guides].sort((a, b) => polylineY(a, xFrom) - polylineY(b, xFrom));
  const starts = sorted.map(g => polylineY(g, xFrom));
  const { i, t } = bracket(starts, y);
  const path: Polyline = [];
  for (let s = 0; s <= steps; s++) {
    const x = xFrom + ((xTo - xFrom) * s) / steps;
    const lo = polylineY(sorted[i], x);
    const hi = polylineY(sorted[i + 1], x);
    path.push([x, lo + t * (hi - lo)]);
  }
  path[0] = [xFrom, y];
  const onChart =
    y >= starts[0] - DRAWN_TOLERANCE && y <= starts[starts.length - 1] + DRAWN_TOLERANCE &&
    (drawnAt(sorted[i], xTo) || drawnAt(sorted[i + 1], xTo));
  return { path, onChart };
}

/**
 * y where the given pressure altitude crosses the vertical line at x.
 * onChart is false outside the printed altitudes, or where a line it interpolates from isn't printed at x.
 */
export function altitudeY(meta: NomogramMeta, x: number, altitude: number): { y: number; onChart: boolean } {
  const curves = [...meta.axes.altitudeCurves].sort((a, b) => a.value - b.value);
  const { i, t } = bracket(curves.map(c => c.value), altitude);
  const lo = polylineY(curves[i].points, x);
  const hi = polylineY(curves[i + 1].points, x);
  const onChart =
    t >= 0 && t <= 1 &&
    (t === 1 || altitudeLineCovers(meta, curves[i].points, x)) &&
    (t === 0 || altitudeLineCovers(meta, curves[i + 1].points, x));
  return { y: lo + t * (hi - lo), onChart };
}

/** Pixels from the plot's top or bottom edge within which a line end counts as running off the chart. */
const EDGE_PX = 10;
/** °C from the printed temperature limit within which a line end counts as reaching it (digitizing loses a few px at grid lines). */
const EDGE_C = 1.5;

/**
 * True when an altitude line is printed at x. A line that runs off the top or bottom of the plot, or
 * to the printed temperature limit, counts as continuing (the point being read is checked separately).
 * A line that stops inside the chart does not.
 */
function altitudeLineCovers(meta: NomogramMeta, line: Polyline, x: number): boolean {
  const pts = [...line].sort((a, b) => a[0] - b[0]);
  const { oat } = meta.axes;
  const [tMin, tMax] = oat.printedRange ?? [-Infinity, Infinity];
  const reachesEdge = ([px, py]: Point, tLimit: number) => {
    const temp = xToValue(oat, px);
    return Math.abs(temp - tLimit) <= EDGE_C ||
      (!!meta.plotArea && (py <= meta.plotArea.top + EDGE_PX || py >= meta.plotArea.bottom - EDGE_PX));
  };
  const left = reachesEdge(pts[0], tMin) ? -Infinity : pts[0][0] - DRAWN_TOLERANCE;
  const right = reachesEdge(pts[pts.length - 1], tMax) ? Infinity : pts[pts.length - 1][0] + DRAWN_TOLERANCE;
  return x >= left && x <= right;
}

/** Shared first step: up from the OAT scale to the pressure altitude line. */
function oatStep(meta: NomogramMeta, inputs: NomogramInputs) {
  const { oat } = meta.axes;
  const oatX = valueToX(oat, inputs.oat);
  const alt = altitudeY(meta, oatX, inputs.altitude);
  const [oatMin, oatMax] = oat.printedRange ?? [-Infinity, Infinity];
  return {
    oatX,
    altY: alt.y,
    inputLine: { input: 'oat' as const, points: [[oatX, oat.p1[1]], [oatX, alt.y]] as Polyline },
    onChart: alt.onChart && inputs.oat >= oatMin && inputs.oat <= oatMax,
  };
}

/** True when every segment stays within the plot's top and bottom. */
function inPlot(meta: NomogramMeta, segments: NomogramTrace['segments'], fallback: { top: number; bottom: number }) {
  const area = meta.plotArea ?? fallback;
  return segments.every(seg => seg.points.every(([, y]) => y >= area.top - 1 && y <= area.bottom + 1));
}

/** Trace a "5-step" takeoff/landing distance chart. */
export function traceNomogram(meta: NomogramMeta, inputs: NomogramInputs): NomogramTrace {
  const axes = meta.axes as Required<NomogramMeta['axes']>;
  const weight = inputs.weight ?? axes.weightScale.v1;
  const wind = inputs.wind ?? 0;
  const ref1X = axes.referenceLine1.points[0][0];
  const ref2X = axes.referenceLine2.points[0][0];
  const outX = axes.outputAxis.p1[0];

  const start = oatStep(meta, inputs);

  const weightX = valueToX(axes.weightScale, weight);
  const weightStep = followGuides(axes.weightGuides, ref1X, start.altY, weightX);
  const weightY = weightStep.path[weightStep.path.length - 1][1];

  const windX = valueToX(axes.windScale, Math.abs(wind));
  const windStep = wind === 0
    ? { path: [[ref2X, weightY] as Point], onChart: true }
    : followGuides(wind > 0 ? axes.headwindGuides : axes.tailwindGuides, ref2X, weightY, windX);
  const [endX, endY] = windStep.path[windStep.path.length - 1];

  const segments: NomogramTrace['segments'] = [
    { step: 'altitude', points: [[start.oatX, start.altY], [ref1X, start.altY]] },
    { step: 'weight', points: weightStep.path },
    { step: 'crossToWind', points: [[weightX, weightY], [ref2X, weightY]] },
    { step: 'wind', points: windStep.path },
    { step: 'output', points: [[endX, endY], [outX, endY]] },
  ];

  const offChart =
    !start.onChart || !weightStep.onChart || !windStep.onChart ||
    !inPlot(meta, segments, { top: axes.outputAxis.p2[1], bottom: axes.outputAxis.p1[1] }) ||
    start.oatX < axes.oat.p1[0] - 1 || start.oatX > ref1X || weightX < ref1X - 1 || weightX > ref2X || windX > outX + 1;

  const result = yToValue(axes.outputAxis, endY);
  return {
    segments,
    inputLines: [
      start.inputLine,
      { input: 'weight', points: [[weightX, axes.weightScale.p1[1]], [weightX, weightY]] },
      { input: 'wind', points: [[windX, axes.windScale.p1[1]], [windX, endY]] },
    ],
    results: [{ name: 'distance', value: result, point: [outX, endY] }],
    result,
    resultPoint: [outX, endY],
    offChart,
  };
}

/** Trace a rate-of-climb chart: across to the rate-of-climb line, then down to its scale. */
export function traceClimbRoc(meta: NomogramMeta, inputs: NomogramInputs): NomogramTrace {
  const rocLine = meta.axes.rocLine!.points;
  const rocAxis = meta.axes.rocAxis!;
  const axisY = rocAxis.p1[1];

  const start = oatStep(meta, inputs);
  const rocX = polylineX(rocLine, start.altY);

  const segments: NomogramTrace['segments'] = [
    { step: 'altitude', points: [[start.oatX, start.altY], [rocX, start.altY]] },
    { step: 'output', points: [[rocX, start.altY], [rocX, axisY]] },
  ];
  const offChart =
    !start.onChart || !drawnAt(rocLine, start.altY, 1) || start.oatX > rocX ||
    !inPlot(meta, segments, { top: Math.min(...rocLine.map(p => p[1])), bottom: axisY });

  const result = xToValue(rocAxis, rocX);
  return {
    segments,
    inputLines: [start.inputLine],
    results: [{ name: 'rateOfClimb', value: result, point: [rocX, axisY] }],
    result,
    resultPoint: [rocX, axisY],
    offChart,
  };
}

/** Trace a time, fuel and distance to climb chart: across to each curve, then down to the shared scale. */
export function traceClimbProfile(meta: NomogramMeta, inputs: NomogramInputs): NomogramTrace {
  const curves = meta.axes.profileCurves!;
  const valueAxis = meta.axes.valueAxis!;
  const axisY = valueAxis.p1[1];

  const start = oatStep(meta, inputs);
  const results = PROFILE_QUANTITIES.map(name => {
    const x = polylineX(curves[name].points, start.altY);
    return { name, value: xToValue(valueAxis, x), point: [x, axisY] as Point };
  });
  const farthestX = Math.max(...results.map(r => r.point[0]));

  const segments: NomogramTrace['segments'] = [
    { step: 'altitude', points: [[start.oatX, start.altY], [farthestX, start.altY]] },
    ...results.map(r => ({ step: `output-${r.name}`, points: [[r.point[0], start.altY], r.point] as Polyline })),
  ];
  const offChart =
    !start.onChart ||
    PROFILE_QUANTITIES.some(name => !drawnAt(curves[name].points, start.altY, 1)) ||
    !inPlot(meta, segments, { top: -Infinity, bottom: axisY });

  return { segments, inputLines: [start.inputLine], results, result: results[0].value, resultPoint: results[0].point, offChart };
}

/** Trace any supported chart type. */
export function traceChart(meta: NomogramMeta, inputs: NomogramInputs): NomogramTrace {
  switch (chartType(meta)) {
    case '5-step':
      return traceNomogram(meta, inputs);
    case 'climb-roc':
      return traceClimbRoc(meta, inputs);
    case 'climb-profile':
      return traceClimbProfile(meta, inputs);
  }
}
