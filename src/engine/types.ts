/**
 * The performance metric a PerformanceTable provides.
 * - groundRoll: Ground roll distance in feet
 * - clearance50ft: Total distance to clear a 50 ft obstacle in feet
 * - rateOfClimb: Rate of climb in feet per minute (FPM)
 */
export type PerformanceMetric = 'groundRoll' | 'clearance50ft' | 'rateOfClimb';

/**
 * A single POH data table providing exactly one performance metric across
 * a 3-dimensional grid of weight × pressure altitude × temperature.
 */
export interface PerformanceTable {
  /** Unique identifier within the aircraft (e.g. 'takeoff-flaps0-roll') */
  id: string;
  /** Human-readable label shown on output cards (e.g. 'Normal Take-Off · Flaps Up (0°)') */
  label: string;
  /**
   * Short configuration name used to GROUP related cards side-by-side.
   * Tables with the same configuration are displayed together.
   * (e.g. 'Flaps Up (0°)', '25° Flaps', '40° Flaps')
   */
  configuration: string;
  /** What performance value this table produces */
  metric: PerformanceMetric;
  /** POH source reference displayed in bottom-right of each output card (e.g. 'POH Fig 5-7') */
  figure?: string;
  /** Weight breakpoints in lbs — outermost data axis */
  weights: number[];
  /** Pressure altitude breakpoints in ft */
  altitudes: number[];
  /** Temperature breakpoints in °C */
  temperatures: number[];
  /** data[weightIdx][altIdx][tempIdx] = metric value */
  data: number[][][];
  /**
   * extrapolated[weightIdx][altIdx][tempIdx] = 1 where the grid point lies outside the printed
   * POH chart and was read by extending the chart's lines, else 0 (numbers keep the bundle small).
   * Results using these points get a warning.
   */
  extrapolated?: (0 | 1)[][][];
  /**
   * Wind correction read from the POH chart's own wind section. When absent,
   * the generic rule of thumb in performance.ts is used instead.
   */
  windCorrection?: WindCorrection;
}

/**
 * Distance with wind, read from the POH chart's headwind and tailwind guide lines.
 * Headwind and tailwind lines may start at different zero-wind distances.
 */
export interface WindCorrection {
  /** Where the chart's wind data came from (e.g. 'POH Fig 5-9 headwind and tailwind guide lines') */
  source: string;
  /** Lowest and highest distance (ft) printed on the chart's distance scale; results outside it get a warning */
  printedDistances: [number, number];
  headwind: WindCorrectionTable;
  tailwind: WindCorrectionTable;
}

export interface WindCorrectionTable {
  /** Zero-wind distances (ft) at which this direction's guide lines start, ascending */
  zeroWindDistances: number[];
  /** Wind speeds in knots, ascending from 0 to the most the chart covers */
  knots: number[];
  /** distances[lineIdx][knotsIdx] = distance with that wind (ft); row i starts at zeroWindDistances[i] */
  distances: number[][];
}

/** Cumulative climb profile point from sea level (Time, Distance, Fuel to Climb) */
export interface ClimbProfilePoint {
  /** Pressure altitude in feet (ft) */
  altitude: number;
  /** Cumulative time from sea level in minutes */
  timeMinutes: number;
  /** Cumulative still-air distance from sea level in nautical miles */
  distanceNm: number;
  /** Cumulative fuel used from sea level in gallons */
  fuelGallons: number;
}

/**
 * Cumulative time, distance and fuel to climb from sea level, read from a POH chart that also
 * depends on outside air temperature (e.g. POH Fig 5-17). Each grid is indexed [altIdx][tempIdx].
 */
export interface ClimbProfileTable {
  /** POH source reference (e.g. 'POH Fig 5-17') */
  figure: string;
  /** Pressure altitude breakpoints in ft, ascending */
  altitudes: number[];
  /** Temperature breakpoints in °C, ascending */
  temperatures: number[];
  timeMinutes: number[][];
  distanceNm: number[][];
  fuelGallons: number[][];
  /** 1 where the grid point lies outside the printed chart and was read by extending its lines, else 0 (numbers keep the bundle small) */
  extrapolated: (0 | 1)[][];
}

/** Climb-specific metadata and configuration */
export interface ClimbSpec {
  /** One or more rate-of-climb tables (metric must be 'rateOfClimb') */
  tables: PerformanceTable[];
  /** Best angle of climb speed in KIAS (Vx) */
  vx?: number;
  /** Best rate of climb speed in KIAS (Vy) */
  vy?: number;
  /** Service ceiling in ft (where ROC = 100 FPM) */
  serviceCeiling?: number;
  /** Absolute ceiling in ft (where ROC = 0 FPM) */
  absoluteCeiling?: number;
  /** POH Figure or Table source citation for Time, Distance, Fuel to Climb (e.g. 'POH Fig 5-17') */
  timeDistanceFuelFigure?: string;
  /** Cumulative time, distance, and fuel profile points from sea level (altitude only; used when there is no profileTable) */
  profile?: ClimbProfilePoint[];
  /** Cumulative time, distance, and fuel by altitude and temperature; takes precedence over `profile` */
  profileTable?: ClimbProfileTable;
}

/** Complete performance data for a single aircraft type */
export interface AircraftData {
  /** Full display name */
  name: string;
  /** Maximum certified takeoff/landing weight in lbs */
  maxWeight: number;
  /** Minimum weight in the POH envelope in lbs */
  minWeight: number;
  /** Takeoff performance tables (groundRoll and/or clearance50ft tables per configuration) */
  takeoff: PerformanceTable[];
  /** Climb performance specification */
  climb: ClimbSpec;
  /** Landing performance tables (groundRoll and/or clearance50ft tables per configuration) */
  landing: PerformanceTable[];
}

export type FleetData = Record<string, AircraftData>;
