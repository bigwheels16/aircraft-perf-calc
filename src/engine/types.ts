/**
 * POH tabular dataset for aircraft performance calculations.
 * Represents tabular values for a specific operation (takeoff or landing).
 */
export type POHDataset = {
  /** Aircraft identification name (e.g., 'Cessna 172N', 'Piper Archer II'). */
  aircraft: string;
  /** Flight operation type: 'takeoff' or 'landing'. */
  operation: 'takeoff' | 'landing';
  /** Configuration or flap setting description (e.g., 'Flaps Up (0°)', '25° Flaps', '40° Flaps'). */
  configuration?: string;
  /** POH Figure or Table source citations for the calculated values. */
  figures?: {
    /** POH Figure or Table source for Ground Roll (e.g., 'POH Fig 5-11'). */
    groundRoll: string;
    /** POH Figure or Table source for 50 ft Obstacle Clearance (e.g., 'POH Fig 5-7'). */
    clearance50ft: string;
  };
  /** Discrete weight points in pounds (lbs) corresponding to rows in POH tables. */
  weights: number[]; // e.g., [1600, 2000, 2400]
  /** Discrete pressure altitude points in feet (ft). */
  altitudes: number[]; // e.g., [0, 2000, 4000, 6000, 8000]
  /** Discrete temperature points in Celsius (°C). */
  temperatures: number[]; // e.g., [0, 10, 20, 30, 40]
  /**
   * 3D lookup data matrices indexed by [weightIndex][altitudeIndex][temperatureIndex].
   */
  data: {
    /** Ground roll distance in feet. */
    groundRoll: number[][][]; 
    /** Total distance in feet required to clear a 50-foot obstacle. */
    clearance50ft: number[][][];
  }
};
