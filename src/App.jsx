import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Graph from './components/Graph.jsx';
import InputTool from './components/InputTool.jsx';
import { taylorFromExpr } from './lib/taylor.js';
import { buildMathFunctions, detectParams, normalizeImplicitMul } from './lib/math.js';
import { prettyExpr, formatNumberSmart, parseNumberExpr } from './lib/format.js';
import { PLOT_INNER_W, PLOT_INNER_H } from './lib/plot.js';
import './InputStyles.css';
import './styles.css';

const defaultDomain = { min: -5, max: 5 };
const fmt5 = (n) => formatNumberSmart(n, { maxDecimals: 5 });

function randLayerColor(seed = Math.random()) {
  const hues = [210, 260, 300, 330, 180];
  const h = hues[Math.floor(seed * hues.length)];
  const s = 46 + Math.floor(seed * 6);
  const l = 72 + Math.floor(seed * 6);
  return `hsl(${h} ${s}% ${l}%)`;
}

function rewriteEHatChain(input) {
  if (!input || typeof input !== 'string') return input;
  const s = input;
  let out = '';
  let i = 0;
  const isIdentChar = (ch) => /[A-Za-z0-9_]/.test(ch);
  while (i < s.length) {
    const ch = s[i];
    if ((ch === 'e' || ch === 'E') && i + 1 < s.length && s[i + 1] === '^') {
      const prev = i > 0 ? s[i - 1] : '';
      if (isIdentChar(prev)) {
        out += ch;
        i += 1;
        continue;
      }
      let j = i + 2;
      let expStr = '';
      if (j < s.length && s[j] === '(') {
        let depth = 1;
        j += 1;
        const start = j;
        while (j < s.length && depth > 0) {
          if (s[j] === '(') depth += 1;
          else if (s[j] === ')') depth -= 1;
          j += 1;
        }
        expStr = s.slice(start, j - 1).trim();
      } else {
        const start = j;
        let depth = 0;
        while (j < s.length) {
          const c = s[j];
          if (c === '(') { depth += 1; j += 1; continue; }
          if (c === ')') {
            if (depth === 0) break;
            depth -= 1; j += 1; continue;
          }
          if (depth === 0 && (c === '+' || c === '-' || c === '*' || c === '/' || c === ',')) break;
          j += 1;
        }
        expStr = s.slice(start, j).trim();
      }
      out += `exp(${expStr || '1'})`;
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export default function App() {
  const [domain, setDomain] = useState(defaultDomain);
  const [layers, setLayers] = useState([{
    id: 1,
    expr: 'sin(x)',
    color: '#ffffff',
    opacity: 1,
    showD1: false,
    showD2: false,
    showTaylor: false,
    taylorDegree: 5,
    taylorA0Expr: '0',
    params: {}
  }]);
  const [yRange, setYRange] = useState(null);
  const [lastDataYRange, setLastDataYRange] = useState([-2, 2]);
  const [showRoots, setShowRoots] = useState(true);
  const [showExtrema, setShowExtrema] = useState(true);
  const [showIntersections, setShowIntersections] = useState(true);
  const [manualPoints, setManualPoints] = useState([]);
  const [showCommand, setShowCommand] = useState(false);
  const [commandError, setCommandError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [didAutoCenter, setDidAutoCenter] = useState(false);

  const buildError = useMemo(() => {
    try {
      for (const l of layers) {
        const exprFixed = rewriteEHatChain(l.expr || '');
        const exprN = normalizeImplicitMul(exprFixed);
        const vars = l.params
          ? Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, v.value]))
          : {};
        const m = buildMathFunctions(exprN, vars);
        if (m.error) return m.error;
      }
      return null;
    } catch (e) {
      return e?.message || 'Invalid expression';
    }
  }, [layers]);

  useEffect(() => {
    if (yRange == null) setYRange({ min: -5, max: 5 });
  }, [yRange]);

  const center = useCallback(() => {
    const s = (domain.max - domain.min) / PLOT_INNER_W;
    const xSpan = s * PLOT_INNER_W;
    const ySpan = s * PLOT_INNER_H;
    setDomain({ min: -xSpan / 2, max: xSpan / 2 });
    setYRange({ min: -ySpan / 2, max: ySpan / 2 });
  }, [domain]);

  useEffect(() => {
    if (didAutoCenter) return;
    if (yRange == null) return;
    center();
    setDidAutoCenter(true);
  }, [didAutoCenter, yRange, center]);

  const zoomButtons = useCallback((scale) => {
    setDomain(prev => {
      const spanX = prev.max - prev.min;
      const newSpanX = spanX * scale;
      const midX = (prev.min + prev.max) / 2;
      return { min: midX - newSpanX / 2, max: midX + newSpanX / 2 };
    });
    setYRange(prev => {
      const base = prev ?? { min: lastDataYRange[0], max: lastDataYRange[1] };
      const spanY = base.max - base.min;
      const newSpanY = spanY * scale;
      const midY = (base.min + base.max) / 2;
      return { min: midY - newSpanY / 2, max: midY + newSpanY / 2 };
    });
  }, [lastDataYRange]);

  useEffect(() => {
    const onKey = (e) => {
      if (showCommand && e.key === 'Escape') { setShowCommand(false); return; }
      if (showSettings && e.key === 'Escape') { setShowSettings(false); return; }
      if (showMobileSidebar && e.key === 'Escape') { setShowMobileSidebar(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandError('');
        setShowCommand(v => !v);
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'c') center();
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') { e.preventDefault(); zoomButtons(0.9); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') { e.preventDefault(); zoomButtons(1.1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [center, zoomButtons, showCommand, showSettings, showMobileSidebar]);

  const updateLayerById = (id, patch) =>
    setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const updateLayerExpr = (id, expr) => {
    setLayers(ls => ls.map(l => {
      if (l.id !== id) return l;
      let nextParams = { ...(l.params || {}) };
      try {
        const keys = detectParams(expr);
        for (const k of keys) {
          if (!nextParams[k]) nextParams[k] = { value: 1, min: -10, max: 10, step: 0.1 };
        }
        Object.keys(nextParams).forEach(k => {
          if (!keys.includes(k)) delete nextParams[k];
        });
      } catch {}
      return { ...l, expr };
    }));
  };

  const addLayer = () => setLayers(ls => {
    const id = (ls.at(-1)?.id || 1) + 1;
    return [
      ...ls,
      {
        id,
        expr: '',
        color: randLayerColor(),
        opacity: 1,
        showD1: false,
        showD2: false,
        showTaylor: false,
        taylorDegree: 5,
        taylorA0Expr: '0',
        params: {}
      }
    ];
  });

  const removeLayer = (id) => setLayers(ls => ls.filter(l => l.id !== id));
  const updateLayerColor = (id, color) => updateLayerById(id, { color });

  const addManualPoint = (x = 0, y = 0) => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());
    const label = `P${manualPoints.length + 1}`;
    const p = { id, x, y, label, xStr: fmt5(x), yStr: fmt5(y) };
    setManualPoints(ps => [...ps, p]);
    return p;
  };

  const removeManualPoint = (id) =>
    setManualPoints(ps => ps.filter(p => p.id !== id));

  const onManualPointChange = (id, which, str) => {
    setManualPoints(ps => ps.map(p => {
      if (p.id !== id) return p;
      const parsed = parseNumberExpr(str);
      if (Number.isFinite(parsed)) {
        return which === 'x'
          ? { ...p, x: parsed, xStr: str }
          : { ...p, y: parsed, yStr: str };
      }
      return which === 'x'
        ? { ...p, xStr: str }
        : { ...p, yStr: str };
    }));
  };

  const onManualPointBlur = (id, which) => {
    setManualPoints(ps => ps.map(p => {
      if (p.id !== id) return p;
      const v = which === 'x' ? p.x : p.y;
      if (!Number.isFinite(v)) return p;
      return which === 'x'
        ? { ...p, xStr: fmt5(v) }
        : { ...p, yStr: fmt5(v) };
    }));
  };

  const layersForGraph = useMemo(() => {
    return layers.map(l => {
      const exprFixed = rewriteEHatChain(l.expr || '');
      const exprNormalized = normalizeImplicitMul(exprFixed);
      const a0 = parseNumberExpr(l.taylorA0Expr);
      return {
        ...l,
        expr: exprNormalized,
        taylorA0Val: Number.isFinite(a0) ? a0 : 0
      };
    });
  }, [layers]);

  const handlePlotCommand = (exprRaw) => {
    setCommandError('');
    const trimmed = (exprRaw || '').trim();
    if (!trimmed) return;

    const degreeMatch =
      trimmed.match(/\bdegree\s+(\d+)\b/i) ||
      trimmed.match(/\border\s+(\d+)\b/i);
    if (degreeMatch) {
      const d = parseInt(degreeMatch[1], 10);
      if (!Number.isNaN(d) && d > 10) {
        setCommandError('Max degree is 10');
        return;
      }
    }

    const exprFixed = rewriteEHatChain(trimmed);
    const exprNormalized = normalizeImplicitMul(exprFixed);
    setLayers(ls => {
      if (ls.length === 0) {
        return [{
          id: 1,
          expr: exprNormalized,
          color: '#ffffff',
          opacity: 1,
          showD1: false,
          showD2: false,
          showTaylor: false,
          taylorDegree: 5,
          taylorA0Expr: '0',
          params: {}
        }];
      }
      const first = ls[0];
      let nextParams = { ...(first.params || {}) };
      try {
        const keys = detectParams(exprNormalized);
        for (const k of keys) {
          if (!nextParams[k]) {
            nextParams[k] = { value: 1, min: -10, max: 10, step: 0.1 };
          }
        }
        Object.keys(nextParams).forEach(k => {
          if (!keys.includes(k)) delete nextParams[k];
        });
      } catch {}
      const updated = { ...first, expr: exprNormalized, params: nextParams };
      return [updated, ...ls.slice(1)];
    });
  };

  return (
    <div className="app shell">
      <header className="hero">
        <div className="hero-left-wrap">
          <h1 className="logo.brand-mono logo brand-mono">monograph</h1>
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() => setShowSettings(true)}
            title="Settings (S)"
          >
            settings
          </button>
          <button
            className="btn"
            onClick={center}
            title="Center (C)"
          >
            center
          </button>
          <button
            className="btn"
            onClick={() => { setCommandError(''); setShowCommand(true); }}
            title="Command (Cmd/Ctrl+K)"
          >
            command
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="points-panel">
          <div className="pp-head">Points & features</div>
          <div className="pp-row toggles">
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
        </aside>

        <main className="stage centered lifted" style={{ position: 'relative' }}>
          <Graph
            layers={layersForGraph}
            domain={domain}
            onDomainChange={setDomain}
            onYRangeChange={setYRange}
            numberFmt={(n) => formatNumberSmart(n, { maxDecimals: 6 })}
            exprFmt={prettyExpr}
            yRange={yRange}
            onYRangeComputed={setLastDataYRange}
            taylorBuilder={taylorFromExpr}
            showRoots={showRoots}
            showExtrema={showExtrema}
            showIntersections={showIntersections}
            manualPoints={manualPoints}
            onManualPointsChange={setManualPoints}
            onManualPointAdd={addManualPoint}
            showYAxisIntercept={true}
          />
        </main>
      </div>

      <footer className="footer lifted">
        <span>
          Shortcuts: Cmd/Ctrl+K command • S settings • Left-drag pan (Shift =
          axis lock) • Wheel zoom (uniform) • +/− or numpad ± • Alt-click to add
          point • Drag on a curve to trace • Drag point + Shift to snap
        </span>
        <div className="made-with">
          made with 💜 by{' '}
          <a
            href="https://suryanshzex.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            @suryanshzex
          </a>
        </div>
      </footer>

      <div className="mobile-main">
        <div className="mobile-main-header">
          <button
            className="btn mobile-sidebar-toggle"
            onClick={() => setShowMobileSidebar(true)}
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <div className="mobile-main-header-box">
            <h1 className="logo brand-mono">monograph</h1>
          </div>
        </div>

        <div className="mobile-main-top-right">
          <button
            className="btn mobile-center-btn"
            onClick={center}
            aria-label="Center graph"
          >
            center
          </button>
        </div>

        <div className="mobile-main-graph">
          <Graph
            layers={layersForGraph}
            domain={domain}
            onDomainChange={setDomain}
            onYRangeChange={setYRange}
            numberFmt={(n) => formatNumberSmart(n, { maxDecimals: 6 })}
            exprFmt={prettyExpr}
            yRange={yRange}
            onYRangeComputed={setLastDataYRange}
            taylorBuilder={taylorFromExpr}
            showRoots={showRoots}
            showExtrema={showExtrema}
            showIntersections={showIntersections}
            manualPoints={manualPoints}
            onManualPointsChange={setManualPoints}
            onManualPointAdd={addManualPoint}
            showYAxisIntercept={true}
          />
        </div>

        <div className="mobile-footer">
          <span className="mobile-footer-text">
            made with 💜 by{' '}
            <a
              href="https://suryanshzex.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              @suryanshzex
            </a>
          </span>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              className="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              className="drawer sleek small"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="drawer-head">
                <h2>Settings</h2>
                <button className="btn" onClick={() => setShowSettings(false)}>
                  close
                </button>
              </div>

              {buildError && (
                <div className="error polished">{buildError}</div>
              )}

              <div className="settings-min compact">
                {layers.map((l, idx) => (
                  <section className="panel-clean" key={l.id}>
                    <label>
                      {`function ${idx + 1}`}
                      <input
                        className="input bare mono"
                        type="text"
                        value={l.expr}
                        onChange={(e) => updateLayerExpr(l.id, e.target.value)}
                        placeholder={idx === 0 ? 'sin(x)' : 'new function'}
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
                                setLayers(ls =>
                                  ls.map(L =>
                                    L.id !== l.id
                                      ? L
                                      : {
                                          ...L,
                                          params: {
                                            ...L.params,
                                            [k]: { ...meta, value: v }
                                          }
                                        }
                                  )
                                );
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            className="mobile-sidebar-shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="mobile-overlay"
              onClick={() => setShowMobileSidebar(false)}
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
                      onClick={() => { setShowMobileSidebar(false); setCommandError(''); setShowCommand(true); }}
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
                          placeholder={idx === 0 ? 'sin(x)' : 'new function'}
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
          </motion.div>
        )}
      </AnimatePresence>

      <InputTool
        open={showCommand}
        onClose={() => setShowCommand(false)}
        onPlot={handlePlotCommand}
        errorMessage={commandError}
      />
    </div>
  );
}