import { useState, useMemo, useEffect } from 'react';
import fleetRaw from './data/fleet.json';
import type { FleetData } from './engine/types';
const fleetData: FleetData = fleetRaw as unknown as FleetData;
import { calculateTable, calculateClimb, EXTRAPOLATED_WARNING } from './engine/performance';
import type { PerformanceInput, TableResult, ClimbPerformanceResult } from './engine/performance';
import type { PerformanceTable } from './engine/types';
import { NomogramViewer } from './components/NomogramViewer';
import type { ChartTraceRequest } from './components/NomogramViewer';
import nomogramMetaRaw from './data/nomogram_meta.json';
import { loadSavedState, saveAppState } from './utils/storage';
import './App.css';

const nomogramMeta: Record<string, unknown> = nomogramMetaRaw;

function App() {
  // Checked here, before the calculator's hooks, so they always run in the same order
  if (Object.keys(fleetData).length === 0) return <div className="app-container"><div className="error-box">No aircraft data available</div></div>;
  return <Calculator />;
}

function Calculator() {
  const [initialState] = useState(() => loadSavedState());

  const [activeChart, setActiveChart] = useState<string | null>(null);
  const [chartInputs, setChartInputs] = useState<{ traces: ChartTraceRequest[]; summary: string; resultText: string } | null>(null);

  const [aircraft, setAircraft] = useState<string>(initialState.aircraft);
  const [operation, setOperation] = useState<'takeoff' | 'climb' | 'landing'>(initialState.operation);
  const [surfacePaved, setSurfacePaved] = useState<boolean>(initialState.surfacePaved);

  const [weight, setWeight] = useState<number>(initialState.weight);
  const [fieldElev, setFieldElev] = useState<number>(initialState.fieldElev);
  const [altimeterSetting, setAltimeterSetting] = useState<number>(initialState.altimeterSetting);

  const [temperature, setTemperature] = useState<number>(initialState.temperature);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(initialState.tempUnit);
  const [windKnots, setWindKnots] = useState<number>(initialState.windKnots);
  const [isHeadwind, setIsHeadwind] = useState<boolean>(initialState.isHeadwind);
  const [safetyBuffer, setSafetyBuffer] = useState<number>(initialState.safetyBuffer || 0);
  const [cruiseAltitude, setCruiseAltitude] = useState<number>(initialState.cruiseAltitude ?? 5500);

  // Automatically persist user input values on change
  useEffect(() => {
    saveAppState({
      aircraft,
      operation,
      surfacePaved,
      weight,
      fieldElev,
      altimeterSetting,
      cruiseAltitude,
      temperature,
      tempUnit,
      windKnots,
      isHeadwind,
      safetyBuffer,
    });
  }, [
    aircraft,
    operation,
    surfacePaved,
    weight,
    fieldElev,
    altimeterSetting,
    cruiseAltitude,
    temperature,
    tempUnit,
    windKnots,
    isHeadwind,
    safetyBuffer,
  ]);

  // Charts are keyed by figure number, e.g. 'POH Fig 5-37' -> 'fig_5_37_landing_flaps40_roll'
  const getChartId = (figure?: string) => {
    const match = figure?.match(/^POH Fig (\d+)-(\d+)$/);
    if (!match) return null;
    const prefix = `fig_${match[1]}_${match[2]}_`;
    return Object.keys(nomogramMeta).find(cid => cid.startsWith(prefix)) ?? null;
  };

  const aircraftData = useMemo(() => fleetData[aircraft] || Object.values(fleetData)[0], [aircraft]);

  // Compute active primary tables
  const operationTables = useMemo(() => {
    if (operation === 'climb') return aircraftData.climb.tables;
    return operation === 'takeoff' ? aircraftData.takeoff : aircraftData.landing;
  }, [aircraftData, operation]);

  // Available POH data envelope for the active operation
  const dataEnvelope = useMemo(() => {
    let minW = Infinity;
    let maxW = -Infinity;
    let minA = Infinity;
    let maxA = -Infinity;
    let minT = Infinity;
    let maxT = -Infinity;

    for (const t of operationTables) {
      minW = Math.min(minW, t.weights[0]);
      maxW = Math.max(maxW, t.weights[t.weights.length - 1]);
      minA = Math.min(minA, t.altitudes[0]);
      maxA = Math.max(maxA, t.altitudes[t.altitudes.length - 1]);
      minT = Math.min(minT, t.temperatures[0]);
      maxT = Math.max(maxT, t.temperatures[t.temperatures.length - 1]);
    }

    // Safe fallbacks if tables array is empty
    if (!Number.isFinite(minW)) minW = aircraftData.minWeight;
    if (!Number.isFinite(maxW)) maxW = aircraftData.maxWeight;
    if (!Number.isFinite(minA)) minA = 0;
    if (!Number.isFinite(maxA)) maxA = 8000;
    if (!Number.isFinite(minT)) minT = 0;
    if (!Number.isFinite(maxT)) maxT = 40;

    let minProfileAlt = 0;
    let maxProfileAlt = 12000;
    const profileAltitudes = aircraftData.climb.profileTable?.altitudes ?? aircraftData.climb.profile?.map(p => p.altitude);
    if (operation === 'climb' && profileAltitudes && profileAltitudes.length > 0) {
      minProfileAlt = profileAltitudes[0];
      maxProfileAlt = profileAltitudes[profileAltitudes.length - 1];
    }

    return {
      minWeight: minW,
      maxWeight: maxW,
      minAltitude: minA,
      maxAltitude: maxA,
      minTempC: minT,
      maxTempC: maxT,
      minProfileAlt,
      maxProfileAlt,
    };
  }, [aircraftData, operation, operationTables]);

  const maxWeight = dataEnvelope.maxWeight;
  const minWeight = dataEnvelope.minWeight;
  const isWeightValid = !isNaN(weight) && weight >= minWeight && weight <= maxWeight;

  // Compute Departure Pressure Altitude: Field Elevation + (29.92 - Altimeter) * 1000
  const pressureAltitude = useMemo(() => {
    if (isNaN(fieldElev) || isNaN(altimeterSetting) || altimeterSetting < 26.0 || altimeterSetting > 32.0) {
      return NaN;
    }
    return Math.round(fieldElev + (29.92 - altimeterSetting) * 1000);
  }, [fieldElev, altimeterSetting]);

  const isAltitudeValid = !isNaN(pressureAltitude) && pressureAltitude >= dataEnvelope.minAltitude && pressureAltitude <= dataEnvelope.maxAltitude;

  // Compute Cruise Pressure Altitude: Target Cruise Altitude + (29.92 - Altimeter) * 1000
  const cruisePressureAltitude = useMemo(() => {
    if (isNaN(cruiseAltitude) || isNaN(altimeterSetting) || altimeterSetting < 26.0 || altimeterSetting > 32.0) {
      return NaN;
    }
    return Math.round(cruiseAltitude + (29.92 - altimeterSetting) * 1000);
  }, [cruiseAltitude, altimeterSetting]);

  // Convert temperature to Celsius for engine calculation
  const tempInC = tempUnit === 'F' ? ((temperature - 32) * 5) / 9 : temperature;
  const isTempValid = !isNaN(temperature) && tempInC >= dataEnvelope.minTempC && tempInC <= dataEnvelope.maxTempC;

  // Compute equivalent opposite unit temperature
  const equivalentTemp = useMemo(() => {
    if (isNaN(temperature)) return '--';
    if (tempUnit === 'C') {
      const f = (temperature * 9) / 5 + 32;
      return Number.isInteger(f) ? `${f}°F` : `${f.toFixed(1)}°F`;
    } else {
      const c = ((temperature - 32) * 5) / 9;
      return Number.isInteger(c) ? `${c}°C` : `${c.toFixed(1)}°C`;
    }
  }, [temperature, tempUnit]);

  // Validate inputs and collect all failure reasons
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // Weight validation
    if (isNaN(weight)) {
      errors.push('Gross weight is empty or not a valid number.');
    } else if (weight < minWeight || weight > maxWeight) {
      errors.push(
        `Gross weight (${weight.toLocaleString()} lbs) is outside the available POH data envelope (${minWeight.toLocaleString()} \u2013 ${maxWeight.toLocaleString()} lbs for ${
          aircraftData.name
        }).`
      );
    }

    // Altitude validation
    if (isNaN(fieldElev)) {
      errors.push('Field elevation is empty or not a valid number.');
    }
    if (isNaN(altimeterSetting)) {
      errors.push('Altimeter setting (QNH) is empty or not a valid number.');
    } else if (altimeterSetting < 26.0 || altimeterSetting > 32.0) {
      errors.push(`Altimeter setting (${altimeterSetting.toFixed(2)} inHg) must be between 26.00 and 32.00 inHg.`);
    }

    if (!isNaN(pressureAltitude)) {
      if (pressureAltitude < dataEnvelope.minAltitude || pressureAltitude > dataEnvelope.maxAltitude) {
        errors.push(
          `Departure pressure altitude (${pressureAltitude.toLocaleString()} ft) is outside the available POH data envelope (${dataEnvelope.minAltitude.toLocaleString()} \u2013 ${dataEnvelope.maxAltitude.toLocaleString()} ft).`
        );
      }
    }

    // Temperature validation
    if (isNaN(temperature)) {
      errors.push('Outside air temperature is empty or not a valid number.');
    } else if (tempInC < dataEnvelope.minTempC || tempInC > dataEnvelope.maxTempC) {
      const minF = Math.round((dataEnvelope.minTempC * 9) / 5 + 32);
      const maxF = Math.round((dataEnvelope.maxTempC * 9) / 5 + 32);
      if (tempUnit === 'C') {
        errors.push(
          `Outside air temperature (${temperature}°C) is outside the available POH data envelope (${dataEnvelope.minTempC}°C \u2013 ${dataEnvelope.maxTempC}°C / ${minF}°F \u2013 ${maxF}°F).`
        );
      } else {
        errors.push(
          `Outside air temperature (${temperature}°F) is outside the available POH data envelope (${minF}°F \u2013 ${maxF}°F / ${dataEnvelope.minTempC}°C \u2013 ${dataEnvelope.maxTempC}°C).`
        );
      }
    }

    // Wind validation
    if (isNaN(windKnots)) {
      errors.push('Runway wind component is empty or not a valid number.');
    } else if (windKnots < 0) {
      errors.push('Runway wind component cannot be negative.');
    }

    // Target cruise altitude validation (only applies when on climb tab)
    if (operation === 'climb') {
      if (isNaN(cruiseAltitude)) {
        errors.push('Target cruise altitude is empty or not a valid number.');
      } else if (!isNaN(fieldElev) && cruiseAltitude <= fieldElev) {
        errors.push(
          `Target cruise altitude (${cruiseAltitude.toLocaleString()} ft MSL) must be higher than field elevation (${fieldElev.toLocaleString()} ft MSL).`
        );
      } else if (!isNaN(cruisePressureAltitude)) {
        if (cruisePressureAltitude < dataEnvelope.minProfileAlt || cruisePressureAltitude > dataEnvelope.maxProfileAlt) {
          errors.push(
            `Target cruise pressure altitude (${cruisePressureAltitude.toLocaleString()} ft) is outside the available POH climb profile envelope (${dataEnvelope.minProfileAlt.toLocaleString()} \u2013 ${dataEnvelope.maxProfileAlt.toLocaleString()} ft).`
          );
        } else if (aircraftData.climb.serviceCeiling != null && cruisePressureAltitude > aircraftData.climb.serviceCeiling) {
          errors.push(
            `Target cruise pressure altitude (${cruisePressureAltitude.toLocaleString()} ft) exceeds certified service ceiling (${aircraftData.climb.serviceCeiling.toLocaleString()} ft).`
          );
        }
      }
    }

    return errors;
  }, [
    weight,
    minWeight,
    maxWeight,
    dataEnvelope,
    aircraftData,
    fieldElev,
    altimeterSetting,
    pressureAltitude,
    temperature,
    tempInC,
    tempUnit,
    windKnots,
    operation,
    cruiseAltitude,
    cruisePressureAltitude,
  ]);

  // Run calculation if all inputs are valid for primary dataset
  const tableResults = useMemo(() => {
    const results = new Map<string, TableResult | ClimbPerformanceResult>();
    if (validationErrors.length > 0 || isNaN(pressureAltitude)) {
      return results;
    }
    const input: PerformanceInput = {
      weight,
      pressureAltitude,
      temperature: tempInC,
      windKnots: Math.max(0, windKnots),
      isHeadwind,
      surfacePaved,
      safetyBufferPercent: safetyBuffer,
      cruiseAltitude: cruisePressureAltitude,
    };

    if (operation === 'climb') {
      const result = calculateClimb(input, aircraftData.climb);
      if (result) {
        results.set(result.tableId, result);
      }
    } else {
      operationTables.forEach(t => {
        const res = calculateTable(input, t);
        if (res) {
          results.set(t.id, res);
        }
      });
    }
    return results;
  }, [validationErrors, pressureAltitude, cruisePressureAltitude, weight, tempInC, windKnots, isHeadwind, surfacePaved, safetyBuffer, operation, aircraftData, operationTables]);

  const operationalWarnings = useMemo(() => {
    if (validationErrors.length > 0) return [];
    const warnings = new Set<string>();
    tableResults.forEach(res => {
      res.warnings.forEach(w => warnings.add(w));
    });
    return Array.from(warnings);
  }, [validationErrors, tableResults]);

  // Density altitude (from performance calculation)
  const currentDensityAltitude = useMemo(() => {
    if (validationErrors.length > 0) return null;
    if (tableResults.size > 0) {
      const firstRes = Array.from(tableResults.values())[0];
      return firstRes?.densityAltitude ?? null;
    }
    return null;
  }, [validationErrors, tableResults]);

  // High density altitude flag (DA > PA + 2,000 ft)
  const isHighDensityAltitude = useMemo(() => {
    if (validationErrors.length > 0) return false;
    if (operationalWarnings.some((w) => w.toLowerCase().includes('density altitude'))) {
      return true;
    }
    if (currentDensityAltitude !== null && !isNaN(pressureAltitude)) {
      return currentDensityAltitude > pressureAltitude + 2000;
    }
    return false;
  }, [validationErrors, operationalWarnings, currentDensityAltitude, pressureAltitude]);

  // Other operational warnings, shown under the density altitude warning above the tabs;
  // beyond-the-printed-chart warnings first
  const otherOperationalWarnings = useMemo(() => {
    if (validationErrors.length > 0) return [];
    const others = operationalWarnings.filter((w) => !w.toLowerCase().includes('density altitude'));
    return [
      ...others.filter((w) => w.startsWith(EXTRAPOLATED_WARNING)),
      ...others.filter((w) => !w.startsWith(EXTRAPOLATED_WARNING)),
    ];
  }, [validationErrors, operationalWarnings]);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Take-Off, Climb &amp; Landing Performance Calculator</h1>
        <p>POH Multi-Linear Interpolation &bull; 100% Client-Side Supplementary Flight Computer</p>
      </header>

      {/* 1. Aircraft Selection */}
      <div className="section-title">Select Aircraft</div>
      <div className="aircraft-selector" style={{ marginBottom: '22px' }}>
        <select
          id="aircraft-select"
          aria-label="Select Aircraft"
          value={aircraft}
          onChange={(e) => {
            const tailNumber = e.target.value;
            const data = fleetData[tailNumber];
            setAircraft(tailNumber);
            if (weight > data.maxWeight) setWeight(data.maxWeight);
            if (weight < data.minWeight) setWeight(data.minWeight);
          }}
          style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          {Object.entries(fleetData).map(([tailNumber, data]) => (
            <option key={tailNumber} value={tailNumber}>
              {tailNumber} - {data.name}
            </option>
          ))}
        </select>
      </div>
      {/* 2. Runway Surface Toggle */}
      <div style={{ marginBottom: '22px' }}>
        <div className="section-title">Runway Surface</div>
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-btn ${surfacePaved ? 'active' : ''}`}
            onClick={() => setSurfacePaved(true)}
          >
            Paved, Level, Dry
          </button>
          <button
            type="button"
            className={`toggle-btn ${!surfacePaved ? 'active' : ''}`}
            onClick={() => setSurfacePaved(false)}
          >
            Dry Grass / Turf (+15%)
          </button>
        </div>
      </div>

      {/* 3. Flight Conditions */}
      <div className="conditions-panel">
        <div className="section-title" style={{ marginBottom: '14px' }}>
          Flight Conditions &amp; Environment
        </div>

        <div className="form-grid">
          {/* Gross Weight */}
          <div className="form-field">
            <label className="form-label">
              <span>Gross Weight (lbs)</span>
              <span className="form-label-hint">Envelope: {minWeight.toLocaleString()} &ndash; {maxWeight.toLocaleString()} lbs</span>
            </label>
            <input
              type="number"
              min={minWeight}
              max={maxWeight}
              step={10}
              value={isNaN(weight) ? '' : weight}
              onChange={(e) => setWeight(parseFloat(e.target.value))}
            />
            {!isWeightValid && (
              <div className="field-error">
                {isNaN(weight)
                  ? 'Gross weight is required'
                  : `Weight must be within available data envelope (${minWeight.toLocaleString()} \u2013 ${maxWeight.toLocaleString()} lbs)`}
              </div>
            )}
          </div>

          {/* Temperature */}
          <div className="form-field">
            <label className="form-label">
              <span>Outside Air Temp</span>
              <span className="form-label-hint">
                {tempUnit === 'C'
                  ? `${dataEnvelope.minTempC}°C to ${dataEnvelope.maxTempC}°C`
                  : `${Math.round((dataEnvelope.minTempC * 9) / 5 + 32)}°F to ${Math.round((dataEnvelope.maxTempC * 9) / 5 + 32)}°F`}
              </span>
            </label>
            <div className="input-with-toggle">
              <input
                type="number"
                step={1}
                value={isNaN(temperature) ? '' : temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <div className="mini-toggle-group">
                <button
                  type="button"
                  className={`mini-toggle-btn ${tempUnit === 'C' ? 'active' : ''}`}
                  onClick={() => {
                    if (tempUnit === 'F') {
                      setTemperature(Math.round(((temperature - 32) * 5) / 9));
                      setTempUnit('C');
                    }
                  }}
                >
                  &deg;C
                </button>
                <button
                  type="button"
                  className={`mini-toggle-btn ${tempUnit === 'F' ? 'active' : ''}`}
                  onClick={() => {
                    if (tempUnit === 'C') {
                      setTemperature(Math.round((temperature * 9) / 5 + 32));
                      setTempUnit('F');
                    }
                  }}
                >
                  &deg;F
                </button>
              </div>
            </div>
            <span className="form-label-hint" style={{ marginTop: '4px' }}>
              Equivalent: <strong>{equivalentTemp}</strong>
            </span>
            {isNaN(temperature) && (
              <div className="field-error">Outside air temperature is required</div>
            )}
            {!isNaN(temperature) && !isTempValid && (
              <div className="field-error">
                Temperature must be within available data envelope ({tempUnit === 'C' ? `${dataEnvelope.minTempC}°C \u2013 ${dataEnvelope.maxTempC}°C` : `${Math.round((dataEnvelope.minTempC * 9) / 5 + 32)}°F \u2013 ${Math.round((dataEnvelope.maxTempC * 9) / 5 + 32)}°F`})
              </div>
            )}
          </div>

          {/* Altimeter Setting */}
          <div className="form-field">
            <label className="form-label" htmlFor="altimeter-input">
              <span>Altimeter Setting (inHg)</span>
              <span className="form-label-hint">Standard: 29.92</span>
            </label>
            <input
              id="altimeter-input"
              type="number"
              step={0.01}
              placeholder="29.92"
              value={isNaN(altimeterSetting) ? '' : altimeterSetting}
              onChange={(e) => setAltimeterSetting(parseFloat(e.target.value))}
            />
            <span className="form-label-hint" style={{ marginTop: '6px' }}>
              Pressure Altitude Correction: <strong>{!isNaN(altimeterSetting) ? `${((29.92 - altimeterSetting) * 1000 >= 0 ? '+' : '')}${Math.round((29.92 - altimeterSetting) * 1000)} ft` : '--'}</strong>
            </span>
            {isNaN(altimeterSetting) && (
              <div className="field-error">Altimeter setting is required</div>
            )}
            {!isNaN(altimeterSetting) && (altimeterSetting < 26.0 || altimeterSetting > 32.0) && (
              <div className="field-error">Must be 26.00 &ndash; 32.00 inHg</div>
            )}
          </div>

          {/* Wind Component */}
          <div className="form-field">
            <label className="form-label">
              <span>Wind Component</span>
              <span className="form-label-hint">Default: 0 kts</span>
            </label>
            <div className="input-with-toggle">
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={isNaN(windKnots) ? '' : windKnots}
                onChange={(e) => setWindKnots(parseFloat(e.target.value))}
              />
              <div className="mini-toggle-group">
                <button
                  type="button"
                  className={`mini-toggle-btn ${isHeadwind ? 'active' : ''}`}
                  onClick={() => setIsHeadwind(true)}
                >
                  Headwind
                </button>
                <button
                  type="button"
                  className={`mini-toggle-btn ${!isHeadwind ? 'active' : ''}`}
                  onClick={() => setIsHeadwind(false)}
                >
                  Tailwind
                </button>
              </div>
            </div>
            {isNaN(windKnots) && (
              <div className="field-error">Wind speed is required</div>
            )}
            {!isNaN(windKnots) && windKnots < 0 && (
              <div className="field-error">Wind speed cannot be negative</div>
            )}
          </div>

          {/* Field Elevation */}
          <div className="form-field">
            <label className="form-label" htmlFor="field-elev-input">
              <span>Field Elevation (ft MSL)</span>
              <span className="form-label-hint">Departure Airport</span>
            </label>
            <input
              id="field-elev-input"
              type="number"
              step={100}
              placeholder="e.g. 1000"
              value={isNaN(fieldElev) ? '' : fieldElev}
              onChange={(e) => setFieldElev(parseFloat(e.target.value))}
            />
            <span className="form-label-hint" style={{ marginTop: '6px' }}>
              Departure Pressure Altitude: <strong>{isNaN(pressureAltitude) ? '--' : `${pressureAltitude.toLocaleString()} ft`}</strong>
              {!isNaN(pressureAltitude) && (pressureAltitude < dataEnvelope.minAltitude || pressureAltitude > dataEnvelope.maxAltitude) && (
                <span style={{ color: '#f87171', marginLeft: '6px' }}>
                  (Available: {dataEnvelope.minAltitude.toLocaleString()} &ndash; {dataEnvelope.maxAltitude.toLocaleString()} ft)
                </span>
              )}
            </span>
            {isNaN(fieldElev) && (
              <div className="field-error">Field elevation is required</div>
            )}
            {!isNaN(fieldElev) && !isAltitudeValid && !isNaN(pressureAltitude) && (
              <div className="field-error">
                Departure pressure altitude ({pressureAltitude.toLocaleString()} ft) must be between {dataEnvelope.minAltitude.toLocaleString()} and {dataEnvelope.maxAltitude.toLocaleString()} ft
              </div>
            )}
          </div>

          {/* Cruise Elevation */}
          <div className="form-field">
            <label className="form-label" htmlFor="cruise-alt-input">
              <span>Cruise Elevation (ft MSL)</span>
              <span className="form-label-hint">
                Ceiling: {aircraftData.climb.serviceCeiling ? `${aircraftData.climb.serviceCeiling.toLocaleString()} ft` : '--'}
              </span>
            </label>
            <input
              id="cruise-alt-input"
              type="number"
              step={500}
              placeholder="e.g. 5500"
              value={isNaN(cruiseAltitude) ? '' : cruiseAltitude}
              onChange={(e) => setCruiseAltitude(parseFloat(e.target.value))}
            />
            <span className="form-label-hint" style={{ marginTop: '6px' }}>
              Calculated Cruise Pressure Altitude: <strong>{isNaN(cruisePressureAltitude) ? '--' : `${cruisePressureAltitude.toLocaleString()} ft`}</strong>
              {!isNaN(cruisePressureAltitude) && (cruisePressureAltitude < dataEnvelope.minProfileAlt || cruisePressureAltitude > dataEnvelope.maxProfileAlt) && (
                <span style={{ color: '#f87171', marginLeft: '6px' }}>
                  (Available: {dataEnvelope.minProfileAlt.toLocaleString()} &ndash; {dataEnvelope.maxProfileAlt.toLocaleString()} ft)
                </span>
              )}
            </span>
            {isNaN(cruiseAltitude) && operation === 'climb' && (
              <div className="field-error">Cruise elevation is required</div>
            )}
            {!isNaN(cruiseAltitude) && !isNaN(fieldElev) && cruiseAltitude <= fieldElev && operation === 'climb' && (
              <div className="field-error">Must be higher than field elevation ({fieldElev.toLocaleString()} ft MSL)</div>
            )}
            {!isNaN(cruiseAltitude) && !isNaN(cruisePressureAltitude) && operation === 'climb' && (cruisePressureAltitude < dataEnvelope.minProfileAlt || cruisePressureAltitude > dataEnvelope.maxProfileAlt) && (
              <div className="field-error">
                Cruise pressure altitude ({cruisePressureAltitude.toLocaleString()} ft) must be between {dataEnvelope.minProfileAlt.toLocaleString()} and {dataEnvelope.maxProfileAlt.toLocaleString()} ft
              </div>
            )}
            {!isNaN(cruiseAltitude) && !isNaN(cruisePressureAltitude) && operation === 'climb' && aircraftData.climb.serviceCeiling != null && cruisePressureAltitude > aircraftData.climb.serviceCeiling && (
              <div className="field-error">
                Exceeds service ceiling ({aircraftData.climb.serviceCeiling.toLocaleString()} ft)
              </div>
            )}
          </div>

          {/* Custom Safety Buffer Slider */}
          <div className="form-field full-width">
            <div className="slider-label-row">
              <div className="slider-title-group">
                <label className="slider-label" htmlFor="safety-buffer-slider">
                  Custom Safety Buffer
                </label>
                <span className="slider-label-hint">
                  Manually add safety margin to final distance calculations
                </span>
              </div>
              <div className="slider-val-badge">
                {safetyBuffer > 0 ? `+${safetyBuffer}%` : '0% (None)'}
              </div>
            </div>

            <div className="slider-wrapper">
              <input
                id="safety-buffer-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={safetyBuffer}
                onChange={(e) => setSafetyBuffer(parseInt(e.target.value, 10))}
                className="safety-slider"
              />
              <div className="slider-ticks">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="slider-presets">
              <span className="preset-label">Quick Presets:</span>
              {[0, 15, 25, 43, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`preset-chip ${safetyBuffer === val ? 'active' : ''}`}
                  onClick={() => setSafetyBuffer(val)}
                >
                  {val === 0 ? '0%' : val === 43 ? '+43% (FAA)' : `+${val}%`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Results Display - Always Visible */}
      <div className="results-container">
        <div className="results-header">
          <div className="results-title">Calculated Performance</div>
          <div className="density-alt-badge">
            Density Altitude:{' '}
            <span className="density-alt-value">
              {currentDensityAltitude !== null
                ? `${currentDensityAltitude.toLocaleString()} ft`
                : '--'}
            </span>
          </div>
        </div>

        {/* High Density Altitude Warning Banner */}
        {isHighDensityAltitude && (
          <div className="warning-box">
            <span>&#9888;</span>
            <span>High Density Altitude! Expect degraded performance.</span>
          </div>
        )}

        {/* Other Operational Warnings Banner */}
        {otherOperationalWarnings.map((warning, idx) => (
          <div key={idx} className="warning-box">
            <span>&#9888;</span>
            <span>{warning}</span>
          </div>
        ))}

        {/* Operation Tabs (Take-Off / Climb / Landing) */}
        <div className="results-tabs-bar">
          <button
            type="button"
            className={`results-tab ${operation === 'takeoff' ? 'active' : ''}`}
            onClick={() => setOperation('takeoff')}
          >
            Take-Off
          </button>
          <button
            type="button"
            className={`results-tab ${operation === 'climb' ? 'active' : ''}`}
            onClick={() => setOperation('climb')}
          >
            Climb
          </button>
          <button
            type="button"
            className={`results-tab ${operation === 'landing' ? 'active' : ''}`}
            onClick={() => setOperation('landing')}
          >
            Landing
          </button>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div className="error-box">
            <div className="error-box-header">
              <span className="error-icon">&#9888;</span>
              <strong>Calculation Unavailable:</strong>
            </div>
            <ul className="error-list">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── CLIMB OUTPUT CARDS ─── */}
        {operation === 'climb' && (
          <div className="perf-outputs-wrapper">
            <div className="perf-config-group">
              <div className="perf-config-badge-row">
                <span className="perf-config-pill normal">Full Power · Flaps Up</span>
                <span className="perf-config-label">Maximum Rate-of-Climb Performance</span>
              </div>
              
              {(() => {
                const rocTable = operationTables.find(t => t.metric === 'rateOfClimb');
                const performance = rocTable ? tableResults.get(rocTable.id) : null;
                return (
                  <>
                    <div className="distance-cards-grid">
                      {/* Rate of Climb */}
                      <div className="distance-card">
                        <div className="distance-card-label">Rate of Climb</div>
                        <div className={`distance-card-value climb-roc ${!performance ? 'empty' : ''}`}>
                          {performance?.value != null ? Math.round(performance.value).toLocaleString() : '--'}
                        </div>
                        <div className="distance-card-unit">FT / MIN</div>
                        {rocTable?.figure && (
                          <span className="distance-card-source">{rocTable.figure}</span>
                        )}
                        {getChartId(rocTable?.figure) && (
                          <button 
                            style={{marginTop: '8px', fontSize: '12px', padding: '4px 8px', cursor: 'pointer', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px'}}
                            onClick={() => {
                              setActiveChart(getChartId(rocTable?.figure));
                              setChartInputs({
                                traces: [{ inputs: { oat: tempInC, altitude: pressureAltitude } }],
                                summary: `${tempInC.toFixed(0)}°C · ${Math.round(pressureAltitude)} ft PA`,
                                resultText: performance ? `${Math.round(performance.value)} ft/min` : 'No result for these inputs',
                              });
                            }}>View Chart 📊</button>
                        )}
                      </div>

                      {/* Climb Gradient */}
                      <div className="distance-card">
                        <div className="distance-card-label">Climb Gradient</div>
                        <div className={`distance-card-value climb-gradient ${!performance ? 'empty' : ''}`}>
                          {performance?.climbGradientFtPerNm != null
                            ? Math.round(performance.climbGradientFtPerNm).toLocaleString()
                            : '--'}
                        </div>
                        <div className="distance-card-unit">FT / NM</div>
                        {performance?.climbGradientPercent != null && (
                          <div className="distance-card-base-hint">
                            {performance.climbGradientPercent.toFixed(1)}% gradient
                          </div>
                        )}
                        {rocTable?.figure && (
                          <span className="distance-card-source">{rocTable.figure}</span>
                        )}
                      </div>
                    </div>

                    {/* How gradient was calculated */}
                    {performance && (
                      <div className="climb-calc-detail">
                        <span className="climb-calc-detail-label">Gradient derived from:</span>
                        {aircraftData.climb.vy != null && (
                          <>
                            <span className="climb-calc-detail-item">
                              Vy <strong>{aircraftData.climb.vy} KIAS</strong>
                            </span>
                            <span className="climb-calc-detail-sep">→</span>
                          </>
                        )}
                        <span className="climb-calc-detail-item">
                          TAS <strong>{Math.round(performance.climbTasKnots ?? 0)} kts</strong>
                        </span>
                        <span className="climb-calc-detail-sep">·</span>
                        <span className="climb-calc-detail-item">
                          GS <strong>{Math.round(performance.climbGroundspeedKnots ?? 0)} kts</strong>
                        </span>
                        <span className="climb-calc-detail-sep">·</span>
                        <span className="climb-calc-detail-item">
                          ({Math.round(performance.value)} ÷ {Math.round(performance.climbGroundspeedKnots ?? 0)}) × 60
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Climb Profile: Time, Distance, Fuel to Cruise */}
            {(() => {
              const rocTable = operationTables.find(t => t.metric === 'rateOfClimb');
              const performance = rocTable ? (tableResults.get(rocTable.id) as ClimbPerformanceResult | undefined) : null;
              const hasProfile = performance?.timeToClimbMinutes != null;

              return (
                <div className="perf-config-group" style={{ marginTop: '20px' }}>
                  <div className="perf-config-badge-row">
                    <span className="perf-config-pill normal">Climb to Cruise</span>
                    <span className="perf-config-label">
                      Profile from {isNaN(fieldElev) ? '--' : `${fieldElev.toLocaleString()} ft MSL`} ({isNaN(pressureAltitude) ? '--' : `${pressureAltitude.toLocaleString()} ft Pressure Altitude`}) to {!isNaN(cruiseAltitude) ? `${cruiseAltitude.toLocaleString()} ft MSL` : '--'} ({isNaN(cruisePressureAltitude) ? '--' : `${cruisePressureAltitude.toLocaleString()} ft Pressure Altitude`})
                    </span>
                  </div>

                  <div className="distance-cards-grid climb-profile-cards-grid">
                    {/* Time to Climb */}
                    <div className="distance-card">
                      <div className="distance-card-label">Time to Climb</div>
                      <div className={`distance-card-value climb-roc ${!hasProfile ? 'empty' : ''}`}>
                        {hasProfile ? performance.timeToClimbMinutes : '--'}
                      </div>
                      <div className="distance-card-unit">MINUTES</div>
                      {performance?.timeDistanceFuelFigure && (
                        <span className="distance-card-source">{performance.timeDistanceFuelFigure}</span>
                      )}
                    </div>

                    {/* Distance to Climb */}
                    <div className="distance-card">
                      <div className="distance-card-label">Distance to Climb</div>
                      <div className={`distance-card-value climb-gradient ${!hasProfile ? 'empty' : ''}`}>
                        {hasProfile ? performance.distanceToClimbNm : '--'}
                      </div>
                      <div className="distance-card-unit">NAUTICAL MILES</div>
                      {hasProfile && performance.stillAirDistanceNm !== performance.distanceToClimbNm && (
                        <div className="distance-card-base-hint">
                          Still air: {performance.stillAirDistanceNm} NM ({isHeadwind ? `-${(performance.stillAirDistanceNm! - performance.distanceToClimbNm!).toFixed(1)} NM wind` : `+${(performance.distanceToClimbNm! - performance.stillAirDistanceNm!).toFixed(1)} NM wind`})
                        </div>
                      )}
                      {performance?.timeDistanceFuelFigure && (
                        <span className="distance-card-source">{performance.timeDistanceFuelFigure}</span>
                      )}
                    </div>

                    {/* Fuel to Climb */}
                    <div className="distance-card">
                      <div className="distance-card-label">Fuel to Climb</div>
                      <div className={`distance-card-value obstacle-50ft ${!hasProfile ? 'empty' : ''}`}>
                        {hasProfile ? performance.fuelToClimbGallons : '--'}
                      </div>
                      <div className="distance-card-unit">GALLONS</div>
                      {hasProfile && (
                        <div className="distance-card-base-hint">
                          Enroute climb fuel burn
                        </div>
                      )}
                      {performance?.timeDistanceFuelFigure && (
                        <span className="distance-card-source">{performance.timeDistanceFuelFigure}</span>
                      )}
                    </div>
                  </div>

                  {getChartId(aircraftData.climb.timeDistanceFuelFigure) && !isNaN(pressureAltitude) && !isNaN(cruisePressureAltitude) && (
                    <button
                      style={{marginTop: '8px', fontSize: '12px', padding: '4px 8px', cursor: 'pointer', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px'}}
                      onClick={() => {
                        setActiveChart(getChartId(aircraftData.climb.timeDistanceFuelFigure));
                        // Read at departure and at cruise, both at the OAT input; the result is the difference
                        setChartInputs({
                          traces: [
                            { label: `Departure ${Math.round(pressureAltitude).toLocaleString()} ft`, inputs: { oat: tempInC, altitude: pressureAltitude } },
                            { label: `Cruise ${Math.round(cruisePressureAltitude).toLocaleString()} ft`, inputs: { oat: tempInC, altitude: cruisePressureAltitude } },
                          ],
                          summary: `${tempInC.toFixed(0)}°C · ${Math.round(pressureAltitude).toLocaleString()} → ${Math.round(cruisePressureAltitude).toLocaleString()} ft PA`,
                          resultText: hasProfile
                            ? `${performance.timeToClimbMinutes} min · ${performance.stillAirDistanceNm} NM (still air) · ${performance.fuelToClimbGallons} gal to climb`
                            : 'No result for these inputs',
                        });
                      }}>View Chart 📊</button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── TAKE-OFF / LANDING OUTPUT CARDS ─── */}
        {operation !== 'climb' && (
          <div className="perf-outputs-wrapper">
            {(() => {
              const groups = operationTables.reduce((acc, tbl) => {
                if (!acc[tbl.configuration]) acc[tbl.configuration] = [];
                acc[tbl.configuration].push(tbl);
                return acc;
              }, {} as Record<string, PerformanceTable[]>);

              const hasMultipleConfigs = Object.keys(groups).length > 1;

              return Object.entries(groups).map(([config, tables]) => (
                <div className="perf-config-group" key={config}>
                  <div className="perf-config-badge-row">
                    <span className={`perf-config-pill ${operation === 'takeoff' && hasMultipleConfigs && config.includes('25°') ? 'shortfield' : 'normal'}`}>
                      {config}
                    </span>
                    <span className="perf-config-label">
                      {operation === 'takeoff' && hasMultipleConfigs && config.includes('25°') ? 'Short Field Take-Off' : operation === 'takeoff' ? 'Normal Take-Off' : 'Normal Landing'}
                    </span>
                  </div>
                  <div className="distance-cards-grid">
                    {tables.map(tbl => {
                      const result = tableResults.get(tbl.id);
                      const isRoll = tbl.metric === 'groundRoll';
                      const is50ft = tbl.metric === 'clearance50ft';
                      return (
                        <div className="distance-card" key={tbl.id}>
                          <div className="distance-card-label">{isRoll ? `Ground Roll • ${config}` : `50 FT Obstacle • ${config}`}</div>
                          <div className={`distance-card-value ${isRoll ? 'ground-roll' : 'obstacle-50ft'} ${!result ? 'empty' : ''}`}>
                            {result ? result.value.toLocaleString() : '--'}
                          </div>
                          <div className="distance-card-unit">
                            {is50ft ? 'TOTAL FEET' : 'FEET'}
                          </div>
                          {safetyBuffer > 0 && result && (
                            <div>
                              <span className="distance-card-buffer-badge">
                                +{safetyBuffer}% Buffer
                              </span>
                            </div>
                          )}
                          {tbl.figure && <span className="distance-card-source">{tbl.figure}</span>}
                          {getChartId(tbl.figure) && (
                            <button 
                              style={{marginTop: '8px', fontSize: '12px', padding: '4px 8px', cursor: 'pointer', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px'}}
                              onClick={() => {
                                const wind = isHeadwind ? windKnots : -windKnots;
                                const windText = !wind ? '0 kt' : `${Math.abs(wind)} kt ${wind > 0 ? 'headwind' : 'tailwind'}`;
                                setActiveChart(getChartId(tbl.figure));
                                setChartInputs({
                                  traces: [{ inputs: { oat: tempInC, altitude: pressureAltitude, weight, wind } }],
                                  summary: `${tempInC.toFixed(0)}°C · ${Math.round(pressureAltitude)} ft PA · ${weight} lbs · ${windText}`,
                                  // Before the safety buffer, so it compares like-for-like with the chart reading
                                  resultText: result ? `${Math.round(result.baseValue)} ft` : 'No result for these inputs',
                                });
                              }}>View Chart 📊</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      <footer className="footer">
        <p>
          <strong>Disclaimer:</strong> This application is for demonstration and educational purposes only. Do not use for real-world flight planning. Always consult the official Pilot's Operating Handbook (POH) for your specific aircraft.
        </p>
      </footer>
      {activeChart && chartInputs && (
        <NomogramViewer 
          chartId={activeChart} 
          {...chartInputs} 
          onClose={() => setActiveChart(null)} 
        />
      )}
    </div>
  );
}

export default App;
