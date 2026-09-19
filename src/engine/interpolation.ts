/**
 * Performs standard 1D linear interpolation between two points (x0, y0) and (x1, y1).
 * If x0 === x1, returns y0 to prevent division by zero.
 *
 * @param x - Input coordinate to evaluate
 * @param x0 - Lower reference coordinate
 * @param x1 - Upper reference coordinate
 * @param y0 - Dependent value at x0
 * @param y1 - Dependent value at x1
 * @returns Interpolated value at x
 */
export function interpolate1D(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x0 === x1) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Indices of the two grid points bracketing `val` (the same index twice when `val` is on or past an end).
 */
export function gridBounds(val: number, arr: number[]): [number, number] {
  if (val <= arr[0]) return [0, 0];
  if (val >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1];
  for (let i = 0; i < arr.length - 1; i++) {
    if (val >= arr[i] && val <= arr[i + 1]) return [i, i + 1];
  }
  return [0, 0];
}

/**
 * Performs trilinear (3D) interpolation across weight, pressure altitude, and temperature.
 *
 * The interpolation resolves dimensions sequentially:
 * 1. Temperature interpolation at each of the 4 bounding (weight, altitude) corners.
 * 2. Pressure altitude interpolation between the temperature-interpolated pairs.
 * 3. Weight interpolation between the remaining two values to produce the final scalar.
 *
 * Bounds handling:
 * Caller ensures inputs are within table envelope. Coordinates outside grid bounds are clamped.
 *
 * @param w - Aircraft gross weight in pounds (lbs)
 * @param a - Pressure altitude in feet (ft)
 * @param t - Outside air temperature in Celsius (°C)
 * @param weights - Discrete weight grid points in ascending order
 * @param altitudes - Discrete altitude grid points in ascending order
 * @param temperatures - Discrete temperature grid points in ascending order
 * @param data - 3D lookup array indexed by [weightIndex][altitudeIndex][temperatureIndex]
 * @returns Trilinearly interpolated performance distance (ft)
 */
export function interpolate3D(
  w: number, a: number, t: number,
  weights: number[], altitudes: number[], temperatures: number[],
  data: number[][][]
): number {
  const [w0i, w1i] = gridBounds(w, weights);
  const [a0i, a1i] = gridBounds(a, altitudes);
  const [t0i, t1i] = gridBounds(t, temperatures);

  const w0 = weights[w0i];
  const w1 = weights[w1i];
  const a0 = altitudes[a0i];
  const a1 = altitudes[a1i];
  const t0 = temperatures[t0i];
  const t1 = temperatures[t1i];

  // Interpolate across temperature for 8 corners
  const v00 = interpolate1D(t, t0, t1, data[w0i][a0i][t0i], data[w0i][a0i][t1i]);
  const v01 = interpolate1D(t, t0, t1, data[w0i][a1i][t0i], data[w0i][a1i][t1i]);
  const v10 = interpolate1D(t, t0, t1, data[w1i][a0i][t0i], data[w1i][a0i][t1i]);
  const v11 = interpolate1D(t, t0, t1, data[w1i][a1i][t0i], data[w1i][a1i][t1i]);

  // Interpolate across altitude
  const v0 = interpolate1D(a, a0, a1, v00, v01);
  const v1 = interpolate1D(a, a0, a1, v10, v11);

  // Interpolate across weight
  return interpolate1D(w, w0, w1, v0, v1);
}

/**
 * Bilinear (2D) interpolation across pressure altitude and temperature.
 * Coordinates outside the grid are clamped; callers check the envelope first.
 *
 * @param data - 2D lookup array indexed by [altitudeIndex][temperatureIndex]
 */
export function interpolate2D(
  a: number, t: number,
  altitudes: number[], temperatures: number[],
  data: number[][]
): number {
  const [a0i, a1i] = gridBounds(a, altitudes);
  const [t0i, t1i] = gridBounds(t, temperatures);
  const t0 = temperatures[t0i];
  const t1 = temperatures[t1i];
  const v0 = interpolate1D(t, t0, t1, data[a0i][t0i], data[a0i][t1i]);
  const v1 = interpolate1D(t, t0, t1, data[a1i][t0i], data[a1i][t1i]);
  return interpolate1D(a, altitudes[a0i], altitudes[a1i], v0, v1);
}
