import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatNumberSmart } from '../lib/format.js';

export default function MobileSidebar({
  show,
  onClose,
  showRoots,
  showExtrema,
  showIntersections,
  setShowRoots,
  setShowExtrema,
  setShowIntersections,
  center,
  openCommand,
  addManualPoint,
  manualPoints,
  onManualPointChange,
  onManualPointBlur,
  removeManualPoint,
  layers,
  updateLayerExpr,
  updateLayerById,
  updateLayerColor,
  addLayer,
  removeLayer,
  buildError
}) {
  return (
    <AnimatePresence>
      {show && (
        <div className="mobile-sidebar-shell">
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="mobile-sidebar-shell-inner"
            initial={{ x: -360 }}
            animate={{ x: 0 }}
            exit={{ x: -360 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="mobile-sidebar-panel">
              <div className="mobile-sidebar-top">
                <div className="mobile-sidebar-top-row">
                  <button
                    className={`chip toggle ${showRoots ? 'on' : ''}`}
                    onClick={() => setShowRoots(v => !v)}
                  >
                    roots
                  </button>
                  <button
                    className={`chip toggle ${showExtrema ? 'on' : ''}`}
                    onClick={() => setShowExtrema(v => !v)}
                  >
                    extrema
                  </button>
                  <button
                    className={`chip toggle ${showIntersections ? 'on' : ''}`}
                    onClick={() => setShowIntersections(v => !v)}
                  >
                    intersections
                  </button>
                </div>
                <div className="mobile-sidebar-top-row">
                  <button
                    className="chip"
                    onClick={() => { center(); onClose(); }}
                  >
                    center
                  </button>
                  <button
                    className="chip"
                    onClick={openCommand}
                  >
                    command
                  </button>
                  <button
                    className="chip"
                    onClick={() => addManualPoint(0, 0)}
                  >
                    + point
                  </button>
                </div>
              </div>

              <div className="mobile-sidebar-bottom">
                {buildError && (
                  <div className="drawer error polished">{buildError}</div>
                )}

                <div className="pp-head small">Manual points</div>
                <div className="pp-list">
                  {manualPoints.map(p => (
                    <div className="pp-item" key={p.id}>
                      <span className="pp-tag">{p.label || 'P'}</span>
                      <input
                        className="input inline mono small"
                        type="text"
                        value={p.xStr}
                        onChange={(e) => onManualPointChange(p.id, 'x', e.target.value)}
                        onBlur={() => onManualPointBlur(p.id, 'x')}
                        placeholder="x"
                      />
                      <input
                        className="input inline mono small"
                        type="text"
                        value={p.yStr}
                        onChange={(e) => onManualPointChange(p.id, 'y', e.target.value)}
                        onBlur={() => onManualPointBlur(p.id, 'y')}
                        placeholder="y"
                      />
                      <button
                        className="chip danger tiny"
                        onClick={() => removeManualPoint(p.id)}
                        title="Remove point"
                      >
                        remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pp-row">
                  <button
                    className="chip"
                    onClick={() => addManualPoint()}
                  >
                    + add point
                  </button>
                </div>

                <div className="divider" />

                {layers.map((l, idx) => (
                  <section className="panel-clean" key={l.id}>
                    <label>
                      {`function ${idx + 1}`}
                      <input
                        className="input bare mono"
                        type="text"
                        value={l.expr}
                        onChange={(e) => updateLayerExpr(l.id, e.target.value)}
                        placeholder={idx === 0 ? 'sin(x)' : 'a*x + b'}
                      />
                    </label>

                    {l.params && Object.keys(l.params).length > 0 && (
                      <>
                        <div className="pp-head small">Parameters</div>
                        {Object.entries(l.params).map(([k, meta]) => (
                          <div className="taylor-row" key={`${l.id}-param-${k}`}>
                            <span>{k}</span>
                            <input
                              className="input range pretty"
                              type="range"
                              min={meta.min}
                              max={meta.max}
                              step={meta.step}
                              value={meta.value}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                updateLayerById(l.id, {
                                  params: {
                                    ...l.params,
                                    [k]: { ...meta, value: v }
                                  }
                                });
                              }}
                            />
                            <span className="range-val mono">
                              {formatNumberSmart(meta.value, { maxDecimals: 4 })}
                            </span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="taylor-row" style={{ marginTop: 4 }}>
                      <span>graph opacity</span>
                      <input
                        className="input range pretty"
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={l.opacity ?? 1}
                        onChange={(e) =>
                          updateLayerById(l.id, {
                            opacity: parseFloat(e.target.value)
                          })
                        }
                      />
                      <span className="range-val mono">
                        {formatNumberSmart(l.opacity ?? 1, { maxDecimals: 2 })}
                      </span>
                    </div>

                    <div className="taylor-row two-cols" style={{ marginTop: 4 }}>
                      <span>graph color</span>
                      <input
                        className="input color subtle bare-color"
                        type="color"
                        value={l.color}
                        onChange={(e) => updateLayerColor(l.id, e.target.value)}
                        title="graph color"
                      />
                    </div>

                    <div className="pp-row toggles" style={{ marginTop: 6 }}>
                      <button
                        className={`chip toggle ${l.showD1 ? 'on' : ''}`}
                        onClick={() =>
                          updateLayerById(l.id, { showD1: !l.showD1 })
                        }
                      >
                        f′(x)
                      </button>
                      <button
                        className={`chip toggle ${l.showD2 ? 'on' : ''}`}
                        onClick={() =>
                          updateLayerById(l.id, { showD2: !l.showD2 })
                        }
                      >
                        f″(x)
                      </button>
                      <button
                        className={`chip toggle ${l.showTaylor ? 'on' : ''}`}
                        onClick={() =>
                          updateLayerById(l.id, { showTaylor: !l.showTaylor })
                        }
                      >
                        show taylor
                      </button>
                    </div>

                    <div className="taylor-row">
                      <span>taylor degree</span>
                      <input
                        className="input range pretty"
                        type="range"
                        min="1"
                        max="20"
                        value={l.taylorDegree}
                        onChange={(e) =>
                          updateLayerById(l.id, {
                            taylorDegree: Number(e.target.value)
                          })
                        }
                      />
                      <span className="range-val mono">{l.taylorDegree}</span>
                    </div>

                    <div className="taylor-row two-cols">
                      <span>taylor center</span>
                      <input
                        className="input bare mono"
                        type="text"
                        value={l.taylorA0Expr}
                        onChange={(e) =>
                          updateLayerById(l.id, { taylorA0Expr: e.target.value })
                        }
                        placeholder="e.g., 0, pi/2, 2"
                      />
                    </div>

                    {idx > 0 && (
                      <div className="inline-buttons">
                        <button
                          className="chip danger"
                          onClick={() => removeLayer(l.id)}
                          title="Remove function"
                        >
                          remove
                        </button>
                      </div>
                    )}
                    {idx < layers.length - 1 && <div className="divider" />}
                  </section>
                ))}

                <div className="inline-buttons" style={{ marginTop: 8 }}>
                  <button className="chip" onClick={addLayer}>
                    + add function
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}