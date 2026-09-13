import React, { useState, useMemo } from 'react';
import type { PerformanceTable } from '../engine/types';

interface DataTableViewerProps {
  tables: PerformanceTable[];
  currentWeight: number;
  currentAltitude: number;
  currentTempC: number;
}

export const DataTableViewer: React.FC<DataTableViewerProps> = ({
  tables,
  currentWeight,
  currentAltitude,
  currentTempC,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Get all unique configurations
  const configs = useMemo(() => {
    const c = new Set<string>();
    tables.forEach(t => c.add(t.configuration));
    return Array.from(c);
  }, [tables]);

  const [activeConfigIndex, setActiveConfigIndex] = useState<number>(0);

  // Active tables for the selected config
  const activeConfig = configs[activeConfigIndex] || configs[0];
  const activeTables = useMemo(() => tables.filter(t => t.configuration === activeConfig), [tables, activeConfig]);

  const hasRoll = activeTables.some(t => t.metric === 'groundRoll');
  const hasClearance = activeTables.some(t => t.metric === 'clearance50ft');
  const hasClimb = activeTables.some(t => t.metric === 'rateOfClimb');

  const [metricView, setMetricView] = useState<'roll' | 'clearance'>('roll');

  const activeTable = useMemo(() => {
    if (hasClimb) return activeTables.find(t => t.metric === 'rateOfClimb') || activeTables[0];
    if (metricView === 'roll' && hasRoll) return activeTables.find(t => t.metric === 'groundRoll') || activeTables[0];
    if (metricView === 'clearance' && hasClearance) return activeTables.find(t => t.metric === 'clearance50ft') || activeTables[0];
    return activeTables[0];
  }, [activeTables, hasClimb, metricView, hasRoll, hasClearance]);

  const [selectedWeightIndex, setSelectedWeightIndex] = useState<number>(() => {
    if (!activeTable) return 0;
    let closestIdx = 0;
    let minDiff = Math.abs(activeTable.weights[0] - currentWeight);
    activeTable.weights.forEach((w, idx) => {
      const diff = Math.abs(w - currentWeight);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    return closestIdx;
  });

  // Find bounding indices for highlighting
  const findBounds = (arr: number[], val: number) => {
    if (!arr || arr.length === 0) return [0, 0];
    if (isNaN(val)) return [-1, -1];
    if (val <= arr[0]) return [0, 0];
    if (val >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1];
    for (let i = 0; i < arr.length - 1; i++) {
      if (val >= arr[i] && val <= arr[i + 1]) {
        return [i, i + 1];
      }
    }
    return [0, 0];
  };

  const altBounds = activeTable ? findBounds(activeTable.altitudes, currentAltitude) : [0, 0];
  const tempBounds = activeTable ? findBounds(activeTable.temperatures, currentTempC) : [0, 0];

  if (!tables || tables.length === 0) return null;

  return (
    <div className="data-tables-wrapper">
      <div style={{ textAlign: 'center', margin: '20px 0 10px' }}>
        <button
          type="button"
          className="table-toggle-btn"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? '▲ Hide Underlying POH Data Tables' : '▼ Show Underlying POH Data Tables'}
        </button>
      </div>

      {isOpen && activeTable && (
        <div className="data-tables-panel">
          <div className="data-tables-header">
            <div>
              <h3 style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 700 }}>
                {activeTable.label}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                {hasClimb
                  ? 'Zero wind, flaps up, full throttle climb rate directly from POH.'
                  : 'Zero wind, paved, level, dry runway baseline values directly from POH.'}
              </p>
            </div>

            {/* Metric & Flap View Toggles */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {configs.length > 1 && (
                <div className="mini-toggle-group">
                  {configs.map((cfg, idx) => (
                    <button
                      key={cfg}
                      type="button"
                      className={`mini-toggle-btn ${activeConfigIndex === idx ? 'active' : ''}`}
                      onClick={() => setActiveConfigIndex(idx)}
                    >
                      {cfg}
                    </button>
                  ))}
                </div>
              )}

              {hasClimb ? (
                <div className="mini-toggle-group">
                  <button type="button" className="mini-toggle-btn active" style={{ cursor: 'default' }}>
                    Rate of Climb (FPM)
                  </button>
                </div>
              ) : (
                <div className="mini-toggle-group">
                  {hasRoll && (
                    <button
                      type="button"
                      className={`mini-toggle-btn ${metricView === 'roll' ? 'active' : ''}`}
                      onClick={() => setMetricView('roll')}
                    >
                      Ground Roll
                    </button>
                  )}
                  {hasClearance && (
                    <button
                      type="button"
                      className={`mini-toggle-btn ${metricView === 'clearance' ? 'active' : ''}`}
                      onClick={() => setMetricView('clearance')}
                    >
                      50ft Obstacle
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Weight Selection Tabs */}
          <div className="table-weight-tabs">
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', alignSelf: 'center', marginRight: '8px' }}>
              Gross Weight:
            </span>
            {activeTable.weights.map((w, idx) => (
              <button
                key={w}
                type="button"
                className={`table-weight-btn ${idx === selectedWeightIndex ? 'active' : ''}`}
                onClick={() => setSelectedWeightIndex(idx)}
              >
                {w.toLocaleString()} lbs
              </button>
            ))}
            <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center', marginLeft: 'auto' }}>
              Current Input: <strong>{currentWeight.toLocaleString()} lbs</strong>
            </span>
          </div>

          {/* Responsive Table Scroll Container */}
          <div className="table-scroll-container">
            <table className="poh-data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '130px' }}>
                    Press Alt \ Temp
                  </th>
                  {activeTable.temperatures.map((tempC, tIdx) => {
                    const tempF = Math.round((tempC * 9) / 5 + 32);
                    const isColHighlighted = tIdx === tempBounds[0] || tIdx === tempBounds[1];
                    return (
                      <th
                        key={tempC}
                        className={isColHighlighted ? 'col-bounded' : ''}
                      >
                        <div>{tempC}&deg;C</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
                          ({tempF}&deg;F)
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeTable.altitudes.map((alt, aIdx) => {
                  const isRowHighlighted = aIdx === altBounds[0] || aIdx === altBounds[1];
                  return (
                    <tr
                      key={alt}
                      className={isRowHighlighted ? 'row-bounded' : ''}
                    >
                      <td className="alt-cell">
                        <strong>{alt.toLocaleString()} ft</strong>
                      </td>
                      {activeTable.temperatures.map((_, tIdx) => {
                        const val = activeTable.data?.[selectedWeightIndex]?.[aIdx]?.[tIdx] ?? 0;
                        const isInterpolationBoundingCell =
                          isRowHighlighted && (tIdx === tempBounds[0] || tIdx === tempBounds[1]);

                        return (
                          <td
                            key={tIdx}
                            className={`data-cell ${isInterpolationBoundingCell ? 'active-interpolating-cell' : ''}`}
                          >
                            {hasClimb ? (
                              <span className="cell-roc">{val.toLocaleString()} FPM</span>
                            ) : activeTable.metric === 'groundRoll' ? (
                              <span className="cell-roll">{val.toLocaleString()} ft</span>
                            ) : (
                              <span className="cell-clearance">{val.toLocaleString()} ft</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Legend & POH Notes */}
          <div className="table-footer-legend">
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: activeTable.metric === 'groundRoll' ? '#38bdf8' : '#34d399',
                    display: 'inline-block',
                  }}
                ></span>
                <span style={{ color: '#cbd5e1' }}>
                  {activeTable.metric === 'groundRoll' ? 'Ground Roll Distance (ft)' : 'Total Distance to Clear 50ft Obstacle (ft)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    border: '1px solid #38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    display: 'inline-block',
                  }}
                ></span>
                <span style={{ color: '#94a3b8' }}>Highlighted Cells = Active Interpolation Bounding Points</span>
              </div>
            </div>

            <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
              <strong>POH Adjustment Formulas:</strong> Intermediate weights, altitudes, and temperatures are trilinearly interpolated between the highlighted bounding cells. Headwind reduces distances by 10% per 9 knots; tailwind increases distances by 10% per 2 knots; dry grass runway increases ground roll by 15%.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
