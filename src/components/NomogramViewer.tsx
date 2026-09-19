import React, { useState, useRef } from 'react';
import nomogramMetaRaw from '../data/nomogram_meta.json';
import { canTrace, traceChart } from '../engine/nomogram';
import type { NomogramInputs, NomogramMeta } from '../engine/nomogram';

const nomogramMeta = nomogramMetaRaw as unknown as Record<string, NomogramMeta & { imagePath: string; dimensions: { width: number; height: number } }>;

const TRACE_COLORS = ['#e11d48', '#2563eb'];

export interface ChartTraceRequest {
  /** Shown on the chart where the trace crosses to the altitude line (e.g. 'Cruise 6,000 ft') */
  label?: string;
  inputs: NomogramInputs;
}

interface NomogramViewerProps {
  chartId: string;
  onClose: () => void;
  /** Conditions to trace: one for most charts, departure and cruise for the time, fuel and distance to climb chart */
  traces: ChartTraceRequest[];
  /** The conditions used, for the header */
  summary: string;
  /** The app's calculated result, the only number shown */
  resultText: string;
}

const windText = (wind?: number) => (!wind ? '0 kt' : `${Math.abs(wind)} kt ${wind > 0 ? 'headwind' : 'tailwind'}`);

export const NomogramViewer: React.FC<NomogramViewerProps> = ({ chartId, onClose, traces, summary, resultText }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const meta = nomogramMeta[chartId];

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(Math.max(0.5, s - e.deltaY * 0.005), 5));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  if (!meta) return null;

  const drawn = canTrace(meta)
    ? traces.map((request, i) => ({ ...request, color: TRACE_COLORS[i % TRACE_COLORS.length], trace: traceChart(meta, request.inputs) }))
    : [];
  const offChart = drawn.some(d => d.trace.offChart);

  const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const inputLabel = (input: string, inputs: NomogramInputs) =>
    input === 'oat' ? `${inputs.oat.toFixed(0)}°C` : input === 'weight' ? `${inputs.weight} lbs` : windText(inputs.wind);
  const labelBox = (key: string, x: number, y: number, text: string, color: string) => {
    const width = text.length * 7.5 + 12;
    return (
      <g key={key}>
        <rect x={x - width / 2} y={y - 15} width={width} height={20} rx={3} fill="#fff" stroke={color} strokeWidth={1.5} />
        <text x={x} y={y} textAnchor="middle" fill={color} fontSize={13} fontWeight="bold">{text}</text>
      </g>
    );
  };
  // Traces that share an input (e.g. the same OAT) share one label
  const labelled = new Set<string>();

  return (
    <div className="nomogram-modal" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div className="nomogram-modal-header" style={{ padding: '10px 20px', backgroundColor: '#222', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>POH Chart: {chartId}</h3>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            {summary}
            {drawn.length > 0 ? (
              <>
                {' — '}
                <strong style={{ color: '#fda4af' }}>{resultText}</strong>
                {offChart && <span style={{ color: '#fbbf24' }}> · ⚠ Trace runs off the printed chart; reading is extrapolated</span>}
              </>
            ) : (
              <> — line tracing is not yet calibrated for this chart</>
            )}
          </div>
          {meta.chartWeight != null && (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              This chart is for {meta.chartWeight.toLocaleString()} lbs gross weight; its values are used at every weight (conservative at lighter weights).
            </div>
          )}
        </div>
        <div>
          <button onClick={() => setScale(s => Math.min(s + 0.2, 5))} style={{ marginRight: 10 }}>Zoom In</button>
          <button onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} style={{ marginRight: 10 }}>Zoom Out</button>
          <button onClick={() => { setScale(1); setPosition({x:0, y:0}); }} style={{ marginRight: 10 }}>Reset</button>
          <button onClick={onClose} style={{ cursor: 'pointer', padding: '5px 10px' }}>Close</button>
        </div>
      </div>

      <div
        className="nomogram-modal-body"
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }}
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          width: meta.dimensions.width,
          height: meta.dimensions.height
        }}>
          <img src={meta.imagePath} alt="Nomogram Chart" style={{ width: '100%', height: '100%', display: 'block' }} draggable="false" />

          {drawn.length > 0 && (
            <svg
              viewBox={`0 0 ${meta.dimensions.width} ${meta.dimensions.height}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              {drawn.map(({ trace, inputs, label, color }, t) => (
                <g key={t}>
                  {trace.segments.map(seg => (
                    <polyline
                      key={seg.step}
                      points={toPoints(seg.points)}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={0.85}
                    />
                  ))}
                  {trace.inputLines.map(({ input, points }) => (
                    <polyline
                      key={input}
                      points={toPoints(points)}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.5}
                      strokeDasharray="8 5"
                      strokeOpacity={0.85}
                    />
                  ))}
                  {trace.segments.map((s, i) => (
                    <circle key={i} cx={s.points[0][0]} cy={s.points[0][1]} r={4.5} fill={color} />
                  ))}
                  {trace.results.map(r => (
                    <circle key={r.name} cx={r.point[0]} cy={r.point[1]} r={6} fill="none" stroke={color} strokeWidth={3} />
                  ))}
                  {label && labelBox('label', trace.segments[0].points[0][0] + (label.length * 7.5 + 12) / 2 + 8, trace.segments[0].points[0][1] - 8, label, color)}
                  {trace.inputLines.map(({ input, points }) => {
                    const text = inputLabel(input, inputs);
                    const key = `${input}:${text}`;
                    if (labelled.has(key)) return null;
                    labelled.add(key);
                    return labelBox(input, points[0][0], points[0][1] - 15, text, color);
                  })}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};
