import { useState, useMemo, useEffect } from 'react';
import { c172nTakeoff, c172nLanding } from './data/c172n';
import { archer2TakeoffFlaps0, archer2TakeoffFlaps25, archer2Landing } from './data/archer2';
import { calculatePerformance } from './engine/performance';
import { DataTableViewer } from './components/DataTableViewer';
import { loadSavedState, saveAppState } from './utils/storage';
import './App.css';

function App() {
  const [initialState] = useState(() => loadSavedState());

  const [aircraft, setAircraft] = useState<'C172N' | 'Archer2'>(initialState.aircraft);
  const [operation, setOperation] = useState<'takeoff' | 'landing'>(initialState.operation);
  const [surfacePaved, setSurfacePaved] = useState<boolean>(initialState.surfacePaved);

  const [weight, setWeight] = useState<number>(initialState.weight);
  const [useAltCalc, setUseAltCalc] = useState<boolean>(initialState.useAltCalc);
  const [fieldElev, setFieldElev] = useState<number>(initialState.fieldElev);
  const [altimeterSetting, setAltimeterSetting] = useState<number>(initialState.altimeterSetting);
  const [manualPressureAlt, setManualPressureAlt] = useState<number>(initialState.manualPressureAlt);

  const [temperature, setTemperature] = useState<number>(initialState.temperature);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(initialState.tempUnit);
  const [windKnots, setWindKnots] = useState<number>(initialState.windKnots);
  const [isHeadwind, setIsHeadwind] = useState<boolean>(initialState.isHeadwind);
  const [safetyBuffer, setSafetyBuffer] = useState<number>(initialState.safetyBuffer || 0);

  // Automatically persist user input values on change
  useEffect(() => {
    saveAppState({
      aircraft,
      operation,
      surfacePaved,
      weight,
      useAltCalc,
      fieldElev,
      altimeterSetting,
      manualPressureAlt,
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
    useAltCalc,
    fieldElev,
    altimeterSetting,
    manualPressureAlt,
    temperature,
    tempUnit,
    windKnots,
    isHeadwind,
    safetyBuffer,
  ]);

  const isArcherTakeoff = aircraft === 'Archer2' && operation === 'takeoff';

  // Compute active primary dataset (Flaps 0° for Archer II takeoff baseline)
  const dataset = useMemo(() => {
    if (aircraft === 'C172N') {
      return operation === 'takeoff' ? c172nTakeoff : c172nLanding;
    } else {
      return operation === 'takeoff' ? archer2TakeoffFlaps0 : archer2Landing;
    }
  }, [aircraft, operation]);

  // Secondary dataset for Archer II takeoff (25° Flaps)
  const secondaryDataset = useMemo(() => {
    return isArcherTakeoff ? archer2TakeoffFlaps25 : undefined;
  }, [isArcherTakeoff]);

  const maxWeight = dataset.weights[dataset.weights.length - 1];
  const minWeight = dataset.weights[0];
  const isWeightValid = !isNaN(weight) && weight >= minWeight && weight <= maxWeight;

  // Compute Pressure Altitude
  const pressureAltitude = useMemo(() => {
    if (useAltCalc) {
      if (isNaN(fieldElev) || isNaN(altimeterSetting) || altimeterSetting < 26.0 || altimeterSetting > 32.0) {
        return NaN;
      }
      return Math.round(fieldElev + (29.92 - altimeterSetting) * 1000);
    }
    return isNaN(manualPressureAlt) ? NaN : manualPressureAlt;
  }, [useAltCalc, fieldElev, altimeterSetting, manualPressureAlt]);

  // Convert temperature to Celsius for engine calculation
  const tempInC = tempUnit === 'F' ? ((temperature - 32) * 5) / 9 : temperature;

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
    } else if (weight < minWeight) {
      errors.push(
        `Gross weight (${weight.toLocaleString()} lbs) is below minimum POH envelope (${minWeight.toLocaleString()} lbs for ${
          aircraft === 'C172N' ? 'Cessna 172N' : 'Piper Archer II'
        }).`
      );
    } else if (weight > maxWeight) {
      errors.push(
        `Gross weight (${weight.toLocaleString()} lbs) exceeds maximum certified takeoff/landing weight (${maxWeight.toLocaleString()} lbs for ${
          aircraft === 'C172N' ? 'Cessna 172N' : 'Piper Archer II'
        }).`
      );
    }

    // Altitude validation
    if (!useAltCalc) {
      if (isNaN(manualPressureAlt)) {
        errors.push('Pressure altitude is empty or not a valid number.');
      }
    } else {
      if (isNaN(fieldElev)) {
        errors.push('Field elevation is empty or not a valid number.');
      }
      if (isNaN(altimeterSetting)) {
        errors.push('Altimeter setting (QNH) is empty or not a valid number.');
      } else if (altimeterSetting < 26.0 || altimeterSetting > 32.0) {
        errors.push(`Altimeter setting (${altimeterSetting.toFixed(2)} inHg) must be between 26.00 and 32.00 inHg.`);
      }
    }

    // Temperature validation
    if (isNaN(temperature)) {
      errors.push('Outside air temperature is empty or not a valid number.');
    } else if (tempInC < -273.15) {
      errors.push('Outside air temperature cannot be below absolute zero (-273.15°C / -459.67°F).');
    }

    // Wind validation
    if (isNaN(windKnots)) {
      errors.push('Runway wind component is empty or not a valid number.');
    } else if (windKnots < 0) {
      errors.push('Runway wind component cannot be negative.');
    }

    return errors;
  }, [
    weight,
    minWeight,
    maxWeight,
    aircraft,
    useAltCalc,
    manualPressureAlt,
    fieldElev,
    altimeterSetting,
    temperature,
    tempInC,
    windKnots,
  ]);

  // Run calculation if all inputs are valid for primary dataset
  const performance = useMemo(() => {
    if (validationErrors.length > 0 || isNaN(pressureAltitude)) {
      return null;
    }
    return calculatePerformance(
      {
        weight,
        pressureAltitude,
        temperature: tempInC,
        windKnots: Math.max(0, windKnots),
        isHeadwind,
        surfacePaved,
        safetyBufferPercent: safetyBuffer,
      },
      dataset
    );
  }, [validationErrors, pressureAltitude, weight, tempInC, windKnots, isHeadwind, surfacePaved, safetyBuffer, dataset]);

  // Run calculation for Archer II 25° Flaps takeoff
  const performanceFlaps25 = useMemo(() => {
    if (!isArcherTakeoff || validationErrors.length > 0 || isNaN(pressureAltitude)) {
      return null;
    }
    return calculatePerformance(
      {
        weight,
        pressureAltitude,
        temperature: tempInC,
        windKnots: Math.max(0, windKnots),
        isHeadwind,
        surfacePaved,
        safetyBufferPercent: safetyBuffer,
      },
      archer2TakeoffFlaps25
    );
  }, [isArcherTakeoff, validationErrors, pressureAltitude, weight, tempInC, windKnots, isHeadwind, surfacePaved, safetyBuffer]);

  // Combined operational warnings from both calculations
  const operationalWarnings = useMemo(() => {
    const warnings = new Set<string>();
    if (performance) {
      performance.warnings.forEach((w) => warnings.add(w));
    }
    if (performanceFlaps25) {
      performanceFlaps25.warnings.forEach((w) => warnings.add(w));
    }
    return Array.from(warnings);
  }, [performance, performanceFlaps25]);

  // Density altitude (from performance calculation or calculated directly from PA and OAT)
  const currentDensityAltitude = useMemo(() => {
    if (performance) return performance.densityAltitude;
    if (performanceFlaps25) return performanceFlaps25.densityAltitude;
    if (!isNaN(pressureAltitude) && !isNaN(tempInC)) {
      const isaTemp = 15 - (pressureAltitude / 1000) * 2;
      return Math.round(pressureAltitude + 118.8 * (tempInC - isaTemp));
    }
    return null;
  }, [performance, performanceFlaps25, pressureAltitude, tempInC]);

  // High density altitude flag (DA > PA + 2,000 ft)
  const isHighDensityAltitude = useMemo(() => {
    if (operationalWarnings.some((w) => w.toLowerCase().includes('density altitude'))) {
      return true;
    }
    if (currentDensityAltitude !== null && !isNaN(pressureAltitude)) {
      return currentDensityAltitude > pressureAltitude + 2000;
    }
    return false;
  }, [operationalWarnings, currentDensityAltitude, pressureAltitude]);

  // Other operational warnings (excluding density altitude which is displayed above tabs)
  const otherOperationalWarnings = useMemo(() => {
    return operationalWarnings.filter((w) => !w.toLowerCase().includes('density altitude'));
  }, [operationalWarnings]);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Take-Off &amp; Landing Performance Calculator</h1>
        <p>POH Multi-Linear Interpolation &bull; 100% Client-Side Supplementary Flight Computer</p>
      </header>

      {/* 1. Aircraft Selection */}
      <div className="section-title">Select Aircraft</div>
      <div className="aircraft-grid">
        <div
          className={`aircraft-card ${aircraft === 'C172N' ? 'selected' : ''}`}
          onClick={() => {
            setAircraft('C172N');
            if (weight > 2400) setWeight(2400);
          }}
        >
          <div className="aircraft-card-name">Cessna 172N Skyhawk</div>
          <div className="aircraft-card-sub">POH Section 5 &bull; MTOW: 2,400 lbs &bull; Lycoming O-320-H2AD</div>
        </div>

        <div
          className={`aircraft-card ${aircraft === 'Archer2' ? 'selected' : ''}`}
          onClick={() => {
            setAircraft('Archer2');
            if (weight < 2000) setWeight(2200);
          }}
        >
          <div className="aircraft-card-name">Piper Archer II (PA-28-181)</div>
          <div className="aircraft-card-sub">POH Section 5 &bull; MTOW: 2,550 lbs &bull; Lycoming O-360-A4M</div>
        </div>
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
              <span className="form-label-hint">Max: {maxWeight.toLocaleString()} lbs</span>
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
                  : `Weight must be within envelope (${minWeight.toLocaleString()} \u2013 ${maxWeight.toLocaleString()} lbs)`}
              </div>
            )}
          </div>

          {/* Temperature */}
          <div className="form-field">
            <label className="form-label">
              <span>Outside Air Temp</span>
              <span className="form-label-hint">{tempUnit === 'C' ? '0°C to 40°C' : '32°F to 104°F'}</span>
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
          </div>

          {/* Altitude Input Mode */}
          <div className="form-field">
            <div className="form-label">
              <span>Altitude Mode</span>
              <div className="mini-toggle-group">
                <button
                  type="button"
                  className={`mini-toggle-btn ${!useAltCalc ? 'active' : ''}`}
                  onClick={() => {
                    if (useAltCalc) {
                      if (!isNaN(pressureAltitude)) {
                        setManualPressureAlt(pressureAltitude);
                      }
                      setUseAltCalc(false);
                    }
                  }}
                >
                  Pressure Alt
                </button>
                <button
                  type="button"
                  className={`mini-toggle-btn ${useAltCalc ? 'active' : ''}`}
                  onClick={() => setUseAltCalc(true)}
                >
                  Elevation + QNH
                </button>
              </div>
            </div>

            {!useAltCalc ? (
              <div>
                <label className="sub-input-label" htmlFor="manual-pa-input">
                  Pressure Altitude (ft)
                </label>
                <input
                  id="manual-pa-input"
                  type="number"
                  step={100}
                  placeholder="e.g. 2000"
                  value={isNaN(manualPressureAlt) ? '' : manualPressureAlt}
                  onChange={(e) => setManualPressureAlt(parseFloat(e.target.value))}
                />
                {isNaN(manualPressureAlt) && (
                  <div className="field-error">Pressure altitude is required</div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="sub-input-label" htmlFor="field-elev-input">
                      Field Elevation (ft)
                    </label>
                    <input
                      id="field-elev-input"
                      type="number"
                      step={100}
                      placeholder="e.g. 1000"
                      value={isNaN(fieldElev) ? '' : fieldElev}
                      onChange={(e) => setFieldElev(parseFloat(e.target.value))}
                    />
                    {isNaN(fieldElev) && (
                      <div className="field-error">Field elevation is required</div>
                    )}
                  </div>
                  <div>
                    <label className="sub-input-label" htmlFor="altimeter-input">
                      Altimeter (inHg)
                    </label>
                    <input
                      id="altimeter-input"
                      type="number"
                      step={0.01}
                      placeholder="29.92"
                      value={isNaN(altimeterSetting) ? '' : altimeterSetting}
                      onChange={(e) => setAltimeterSetting(parseFloat(e.target.value))}
                    />
                    {isNaN(altimeterSetting) && (
                      <div className="field-error">Altimeter setting is required</div>
                    )}
                    {!isNaN(altimeterSetting) && (altimeterSetting < 26.0 || altimeterSetting > 32.0) && (
                      <div className="field-error">Must be 26.00 &ndash; 32.00 inHg</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <span className="form-label-hint" style={{ marginTop: '6px' }}>
              Calculated Pressure Alt: <strong>{isNaN(pressureAltitude) ? '--' : `${pressureAltitude.toLocaleString()} ft`}</strong>
            </span>
          </div>

          {/* Wind Component */}
          <div className="form-field">
            <label className="form-label">
              <span>Runway Wind Component</span>
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

          {/* Custom Safety Buffer Slider */}
          <div className="form-field full-width">
            <div className="slider-label-row">
              <label className="form-label" htmlFor="safety-buffer-slider">
                <span>Custom Safety Buffer</span>
                <span className="form-label-hint">Manually add safety margin to all distance calculations</span>
              </label>
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

        {/* Operation Tabs (Take-Off vs Landing) */}
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

        {/* Other Operational Warnings Banner */}
        {otherOperationalWarnings.map((warning, idx) => (
          <div key={idx} className="warning-box">
            <span>&#9888;</span>
            <span>{warning}</span>
          </div>
        ))}

        {/* Simultaneous Distance Output Cards */}
        {isArcherTakeoff ? (
          <div className="perf-outputs-wrapper">
            {/* Output 1: Flaps Up (0°) Take-Off */}
            <div className="perf-config-group">
              <div className="perf-config-badge-row">
                <span className="perf-config-pill normal">Flaps Up (0°)</span>
                <span className="perf-config-label">Normal Take-Off</span>
              </div>
              <div className="distance-cards-grid">
                <div className="distance-card">
                  <div className="distance-card-label">Ground Roll &bull; Flaps Up (0°)</div>
                  <div className={`distance-card-value ground-roll ${!performance ? 'empty' : ''}`}>
                    {performance ? performance.groundRoll.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performance ? `FEET (+${safetyBuffer}% BUFFER)` : 'FEET'}
                  </div>
                  {safetyBuffer > 0 && performance && (
                    <div className="distance-card-base-hint">
                      Base POH: {performance.baseGroundRoll.toLocaleString()} ft
                    </div>
                  )}
                  {dataset.figures?.groundRoll && (
                    <span className="distance-card-source">{dataset.figures.groundRoll}</span>
                  )}
                </div>

                <div className="distance-card">
                  <div className="distance-card-label">50 FT Obstacle &bull; Flaps Up (0°)</div>
                  <div className={`distance-card-value obstacle-50ft ${!performance ? 'empty' : ''}`}>
                    {performance ? performance.clearance50ft.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performance ? `TOTAL FEET (+${safetyBuffer}% BUFFER)` : 'TOTAL FEET'}
                  </div>
                  {safetyBuffer > 0 && performance && (
                    <div className="distance-card-base-hint">
                      Base POH: {performance.baseClearance50ft.toLocaleString()} ft
                    </div>
                  )}
                  {dataset.figures?.clearance50ft && (
                    <span className="distance-card-source">{dataset.figures.clearance50ft}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Output 2: 25° Flaps Take-Off */}
            <div className="perf-config-group">
              <div className="perf-config-badge-row">
                <span className="perf-config-pill shortfield">{secondaryDataset?.configuration || '25° Flaps'}</span>
                <span className="perf-config-label">Short Field Take-Off</span>
              </div>
              <div className="distance-cards-grid">
                <div className="distance-card">
                  <div className="distance-card-label">Ground Roll &bull; {secondaryDataset?.configuration || '25° Flaps'}</div>
                  <div className={`distance-card-value ground-roll ${!performanceFlaps25 ? 'empty' : ''}`}>
                    {performanceFlaps25 ? performanceFlaps25.groundRoll.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performanceFlaps25 ? `FEET (+${safetyBuffer}% BUFFER)` : 'FEET'}
                  </div>
                  {safetyBuffer > 0 && performanceFlaps25 && (
                    <div className="distance-card-base-hint">
                      Base POH: {performanceFlaps25.baseGroundRoll.toLocaleString()} ft
                    </div>
                  )}
                  {secondaryDataset?.figures?.groundRoll && (
                    <span className="distance-card-source">{secondaryDataset.figures.groundRoll}</span>
                  )}
                </div>

                <div className="distance-card">
                  <div className="distance-card-label">50 FT Obstacle &bull; {secondaryDataset?.configuration || '25° Flaps'}</div>
                  <div className={`distance-card-value obstacle-50ft ${!performanceFlaps25 ? 'empty' : ''}`}>
                    {performanceFlaps25 ? performanceFlaps25.clearance50ft.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performanceFlaps25 ? `TOTAL FEET (+${safetyBuffer}% BUFFER)` : 'TOTAL FEET'}
                  </div>
                  {safetyBuffer > 0 && performanceFlaps25 && (
                    <div className="distance-card-base-hint">
                      Base POH: {performanceFlaps25.baseClearance50ft.toLocaleString()} ft
                    </div>
                  )}
                  {secondaryDataset?.figures?.clearance50ft && (
                    <span className="distance-card-source">{secondaryDataset.figures.clearance50ft}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="perf-outputs-wrapper">
            <div className="perf-config-group">
              <div className="perf-config-badge-row">
                <span className="perf-config-pill normal">
                  {dataset.configuration || (operation === 'takeoff' ? 'Flaps Up (0°)' : '40° Flaps')}
                </span>
                <span className="perf-config-label">
                  {operation === 'takeoff' ? 'Normal / Short Field Take-Off' : 'Normal / Short Field Landing'}
                </span>
              </div>
              <div className="distance-cards-grid">
                <div className="distance-card">
                  <div className="distance-card-label">Ground Roll</div>
                  <div className={`distance-card-value ground-roll ${!performance ? 'empty' : ''}`}>
                    {performance ? performance.groundRoll.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performance ? `FEET (+${safetyBuffer}% BUFFER)` : 'FEET'}
                  </div>
                  {safetyBuffer > 0 && performance && (
                    <div className="distance-card-base-hint">
                      Base POH: {performance.baseGroundRoll.toLocaleString()} ft
                    </div>
                  )}
                  {dataset.figures?.groundRoll && (
                    <span className="distance-card-source">{dataset.figures.groundRoll}</span>
                  )}
                </div>

                <div className="distance-card">
                  <div className="distance-card-label">50 FT Obstacle Clearance</div>
                  <div className={`distance-card-value obstacle-50ft ${!performance ? 'empty' : ''}`}>
                    {performance ? performance.clearance50ft.toLocaleString() : '--'}
                  </div>
                  <div className="distance-card-unit">
                    {safetyBuffer > 0 && performance ? `TOTAL FEET (+${safetyBuffer}% BUFFER)` : 'TOTAL FEET'}
                  </div>
                  {safetyBuffer > 0 && performance && (
                    <div className="distance-card-base-hint">
                      Base POH: {performance.baseClearance50ft.toLocaleString()} ft
                    </div>
                  )}
                  {dataset.figures?.clearance50ft && (
                    <span className="distance-card-source">{dataset.figures.clearance50ft}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 5. Underlying POH Data Tables Section */}
      <DataTableViewer
        dataset={dataset}
        alternateDataset={secondaryDataset}
        datasetLabel={dataset.configuration || 'Flaps Up (0°)'}
        alternateDatasetLabel={secondaryDataset?.configuration || '25° Flaps'}
        currentWeight={weight}
        currentAltitude={pressureAltitude}
        currentTempC={tempInC}
      />

      {/* 6. Aviation Disclaimer Footer */}
      <footer className="footer-disclaimer">
        <strong>SUPPLEMENTARY REFERENCE ONLY:</strong> This tool performs multilinear interpolation based on published
        POH performance tables. The Pilot in Command (PIC) is the sole authority for aircraft operation (14 CFR &sect; 91.3).
        Always verify critical calculations with the approved Aircraft Flight Manual / Pilot's Operating Handbook.
      </footer>
    </div>
  );
}

export default App;
