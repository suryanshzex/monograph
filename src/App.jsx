import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Graph from './components/Graph.jsx';
import InfoPanel from './components/InfoPanel.jsx';
import InputTool from './components/InputTool.jsx';
import { taylorFromExpr } from './lib/taylor.js';
import { buildMathFunctions, detectParams, normalizeImplicitMul } from './lib/math.js';
import { prettyExpr, formatNumberSmart, parseNumberExpr } from './lib/format.js';
import { PLOT_INNER_W, PLOT_INNER_H } from './lib/plot.js';
import './InputStyles.css';

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
  const s = input; let out = ''; let i = 0;
  const isIdentChar = (ch) => /[A-Za-z0-9_]/.test(ch);
  while (i < s.length) {
    const ch = s[i];
    if ((ch === 'e' || ch === 'E') && i + 1 < s.length && s[i + 1] === '^') {
      const prev = i > 0 ? s[i - 1] : '';
      if (isIdentChar(prev)) { out += ch; i++; continue; }
      let j = i + 2; let expStr = '';
      if (j < s.length && s[j] === '(') {
        let depth = 1; j++; const start = j;
        while (j < s.length && depth > 0) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
        expStr = s.slice(start, j - 1);
      } else {
        const start = j; let depth = 0;
        while (j < s.length) {
          const c = s[j];
          if (c === '(') { depth++; j++; continue; }
          if (c === ')') { if (depth === 0) break; depth--; j++; continue; }
          if (depth === 0 && /[+\-*/:,]/.test(c)) break;
          j++;
        }
        expStr = s.slice(start, j).trim();
      }
      out += `exp(${expStr})`; i = j; continue;
    }
    out += ch; i++;
  }
  return out;
}

export default function App() {
  const [domain, setDomain] = useState(defaultDomain);
  const [layers, setLayers] = useState([{
    id: 1, expr: 'sin(x)', color: '#ffffff', opacity: 1,
    showD1: false, showD2: false, showTaylor: false, taylorDegree: 5, taylorA0Expr: '0', params: {}
  }]);

  const [showSettings, setShowSettings] = useState(false);
  const [yRange, setYRange] = useState(null);
  const [lastDataYRange, setLastDataYRange] = useState([-2, 2]);
  const [showRoots, setShowRoots] = useState(true);
  const [showExtrema, setShowExtrema] = useState(true);
  const [showIntersections, setShowIntersections] = useState(true);
  const [manualPoints, setManualPoints] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  const buildError = useMemo(() => {
    try {
      for (const l of layers) {
        const exprFixed = rewriteEHatChain(l.expr || '');
        const exprN = normalizeImplicitMul(exprFixed);
        const vars = l.params ? Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, v.value])) : {};
        const m = buildMathFunctions(exprN, vars);
        if (m.error) return m.error;
      }
      return null;
    } catch (e) {
      return e?.message || 'Invalid expression';
    }
  }, [layers]);

  useEffect(() => {
    if (yRange == null) {
      const s = (domain.max - domain.min) / PLOT_INNER_W;
      const ySpan = s * PLOT_INNER_H;
      setYRange({ min: -ySpan/2, max: ySpan/2 });
    }
  }, []);

  const center = useCallback(() => {
    const s = (domain.max - domain.min) / PLOT_INNER_W;
    const xSpan = s * PLOT_INNER_W;
    const ySpan = s * PLOT_INNER_H;
    setDomain({ min: -xSpan / 2, max: xSpan / 2 });
    setYRange({ min: -ySpan / 2, max: ySpan / 2 });
  }, [domain]);

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommand(v => !v);
        return;
      }
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') setShowSettings(v => !v);
      if (k === 'c') center();
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') { e.preventDefault(); zoomButtons(0.9); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') { e.preventDefault(); zoomButtons(1.1); }
      if (k === 'i') setShowInfo(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [center, zoomButtons, showCommand]);

  const updateLayerById = (id, patch) => setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const updateLayerExpr = (id, expr) => {
    setLayers(ls => ls.map(l => {
      if (l.id !== id) return l;
      let nextParams = { ...(l.params || {}) };
      try {
        const keys = detectParams(expr);
        for (const k of keys) if (!nextParams[k]) nextParams[k] = { value: 1, min: -10, max: 10, step: 0.1 };
        Object.keys(nextParams).forEach(k => { if (!keys.includes(k)) delete nextParams[k]; });
      } catch {}
      return { ...l, expr };
    }));
  };

  const addLayer = () => setLayers(ls => {
    const id = (ls.at(-1)?.id || 1) + 1;
    return [...ls, { id, expr: 'sin(x)', color: randLayerColor(), opacity: 1, showD1: false, showD2: false, showTaylor: false, taylorDegree: 5, taylorA0Expr: '0', params: {} }];
  });
  const removeLayer = (id) => setLayers(ls => ls.filter(l => l.id !== id));
  const updateLayerColor = (id, color) => updateLayerById(id, { color });

  const addManualPoint = (x = 0, y = 0) => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
    const label = `P${manualPoints.length + 1}`;
    const p = { id, x, y, label, xStr: fmt5(x), yStr: fmt5(y) };
    setManualPoints(ps => [...ps, p]);
    return p;
  };
  const removeManualPoint = (id) => setManualPoints(ps => ps.filter(p => p.id !== id));
  const onManualPointChange = (id, which, str) => {
    setManualPoints(ps => ps.map(p => {
      if (p.id !== id) return p;
      const parsed = parseNumberExpr(str);
      if (Number.isFinite(parsed)) return which === 'x' ? { ...p, x: parsed, xStr: str } : { ...p, y: parsed, yStr: str };
      return which === 'x' ? { ...p, xStr: str } : { ...p, yStr: str };
    }));
  };
  const onManualPointBlur = (id, which) => {
    setManualPoints(ps => ps.map(p => {
      if (p.id !== id) return p;
      const v = which === 'x' ? p.x : p.y;
      if (!Number.isFinite(v)) return p;
      return which === 'x' ? { ...p, xStr: fmt5(v) } : { ...p, yStr: fmt5(v) };
    }));
  };

  const layersForGraph = useMemo(() => {
    return layers.map(l => {
      const exprFixed = rewriteEHatChain(l.expr || '');
      const exprNormalized = normalizeImplicitMul(exprFixed);
      const a0 = parseNumberExpr(l.taylorA0Expr);
      return { ...l, expr: exprNormalized, taylorA0Val: Number.isFinite(a0) ? a0 : 0 };
    });
  }, [layers]);

  return (
    <div className="app shell mono-theme">
      <header className="hero">
        <h1 className="logo brand-mono">monograph</h1>
        <div className="actions">
          <button className="btn" onClick={() => setShowSettings(true)} title="Settings (S)">settings</button>
          <button className="btn" onClick={center} title="Center (C)">center</button>
          <button className="btn" onClick={() => setShowCommand(true)} title="Command (Cmd/Ctrl+K)">command</button>
        </div>
      </header>

      <div className="layout">
        <aside className="points-panel">
          <div className="pp-head">Points & features</div>
          <div className="pp-row toggles">
            <button className={`chip toggle ${showRoots ? 'on' : ''}`} onClick={() => setShowRoots(v => !v)}>roots</button>
            <button className={`chip toggle ${showExtrema ? 'on' : ''}`} onClick={() => setShowExtrema(v => !v)}>extrema</button>
            <button className={`chip toggle ${showIntersections ? 'on' : ''}`} onClick={() => setShowIntersections(v => !v)}>intersections</button>
          </div>

          <div className="pp-head small">Manual points</div>
          <div className="pp-list">
            <AnimatePresence initial={false}>
              {manualPoints.map(p => (
                <motion.div key={p.id} className="pp-item" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span className="pp-tag">{p.label || 'P'}</span>
                  <input className="input inline mono small" type="text" value={p.xStr}
                         onChange={(e) => onManualPointChange(p.id, 'x', e.target.value)} onBlur={() => onManualPointBlur(p.id, 'x')} placeholder="x" />
                  <input className="input inline mono small" type="text" value={p.yStr}
                         onChange={(e) => onManualPointChange(p.id, 'y', e.target.value)} onBlur={() => onManualPointBlur(p.id, 'y')} placeholder="y" />
                  <button className="chip danger tiny" onClick={() => removeManualPoint(p.id)} title="Remove point">remove</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="pp-row">
            <button className="chip" onClick={() => addManualPoint()}>+ add point</button>
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
            onManualPointAdd={()=>{}}
          />
          <InfoPanel open={showInfo} onOpen={() => setShowInfo(true)} onClose={() => setShowInfo(false)} />
        </main>
      </div>

      <footer className="footer lifted">
        <span>Shortcuts: Cmd/Ctrl+K command • S settings • Drag pan (Shift lock) • Wheel zoom • +/- • Alt-click add point</span>
        <div className="made-with">made with 💜 by <a href="https://suryanshzex.com" target="_blank" rel="noopener noreferrer">@suryanshzex</a></div>
      </footer>

      <InputTool open={showCommand} onClose={() => setShowCommand(false)} />
    </div>
  );
}