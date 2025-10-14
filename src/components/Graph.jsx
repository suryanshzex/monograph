import React, { useMemo, useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildMathFunctions } from '../lib/math.js';
import { PLOT_WIDTH, PLOT_HEIGHT, PLOT_PAD, PLOT_INNER_W, PLOT_INNER_H } from '../lib/plot.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const samplesForWidth = (plotW) => Math.min(2000, Math.max(500, Math.floor(plotW)));
const TAYLOR_SAMPLES = 240;

function sampleFunction(f, min, max, n) {
  const data = new Array(n);
  const dx = (max - min) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = min + i * dx;
    let y;
    try { y = f(x); } catch { y = NaN; }
    data[i] = { x, y: Number.isFinite(y) ? y : NaN };
  }
  return data;
}

function sanitize(points) {
  const n = points.length;
  if (!n) return points;
  const out = points.map(p => ({ x: p.x, y: p.y }));
  let last = Number.isFinite(out[0].y) ? out[0].y : null;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(out[i].y)) last = out[i].y;
    else if (last != null) out[i].y = last;
  }
  let next = Number.isFinite(out[n - 1].y) ? out[n - 1].y : null;
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isFinite(out[i].y)) next = out[i].y;
    else if (next != null) out[i].y = next;
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i].y)) out[i].y = 0;
  return out;
}

function buildUniformPath(points, xToSvg, yToSvg) {
  if (!points.length) return '';
  let d = `M ${xToSvg(points[0].x)} ${yToSvg(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += ` L ${xToSvg(points[i].x)} ${yToSvg(points[i].y)}`;
  return d;
}

function robustYRange(series, fallback = [-1, 1]) {
  const ys = series.flatMap(s => s.map(p => p.y).filter(Number.isFinite));
  if (ys.length < 8) return fallback;
  const sorted = ys.slice().sort((a, b) => a - b);
  const q = (arr, t) => {
    const idx = (arr.length - 1) * t;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    const w = idx - lo;
    return arr[lo] * (1 - w) + arr[hi] * w;
  };
  let lo = q(sorted, 0.01), hi = q(sorted, 0.99);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return fallback;

  const span = hi - lo || 1;
  const ratio = Math.abs(hi) / Math.max(1e-12, Math.abs(lo));
  if (!Number.isFinite(ratio) || ratio > 1e6 || span > 1e12) {
    const start = Math.floor(sorted.length * 0.30);
    const end = Math.ceil(sorted.length * 0.70);
    const mid = sorted.slice(start, end);
    if (mid.length >= 4) {
      lo = q(mid, 0.03);
      hi = q(mid, 0.97);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return fallback;
  const pad = 0.08 * (hi - lo) || 1;
  return [lo - pad, hi + pad];
}

function niceStep(range, targetTicks = 8) {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / targetTicks;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5].map(m => m * pow10);
  return candidates.reduce((a, b) => Math.abs(b - rough) < Math.abs(a - rough) ? b : a, candidates[0]);
}

function genTicks(min, max, step) {
  const first = Math.ceil(min / step) * step;
  const ticks = [];
  for (let t = first; t <= max + 1e-12; t += step) ticks.push(+t.toFixed(12));
  return ticks;
}

export default function Graph({
  layers,
  domain,
  onDomainChange,
  onYRangeChange,
  numberFmt,
  exprFmt,
  yRange,
  onYRangeComputed,
  taylorBuilder,
  showRoots = true,
  showExtrema = true,
  showIntersections = true,
  manualPoints = [],
  onManualPointsChange = () => {},
  onManualPointAdd = () => {}
}) {
  const width = PLOT_WIDTH, height = PLOT_HEIGHT, pad = PLOT_PAD;
  const plotW = PLOT_INNER_W, plotH = PLOT_INNER_H;

  const N = samplesForWidth(plotW);
  const ND = Math.max(200, Math.floor(N * 0.55));

  const builtLayers = useMemo(() => {
    return layers.map(l => {
      try {
        const vars = l.params ? Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, v.value])) : {};
        const mf = buildMathFunctions(l.expr || '0', vars);
        return { ...l, ...mf };
      } catch {
        return { ...l, f: (_x) => NaN, df: (_x) => NaN, error: 'Invalid expression' };
      }
    });
  }, [layers]);

  const seriesPerLayer = useMemo(() => {
    return builtLayers.map((bl) => {
      const f = bl.f || ((_x) => NaN);
      const df = bl.df || ((_x) => NaN);
      const dataF = sampleFunction(f, domain.min, domain.max, N);
      const dataD = sampleFunction(df, domain.min, domain.max, ND);
      const span = Math.max(1e-9, domain.max - domain.min);
      const h = span / ND;
      const d2 = (x) => {
        let fm, f0, fp;
        try { fm = f(x - h); } catch { fm = NaN; }
        try { f0 = f(x); } catch { f0 = NaN; }
        try { fp = f(x + h); } catch { fp = NaN; }
        const v = (fp - 2 * f0 + fm) / (h * h);
        return Number.isFinite(v) ? v : NaN;
      };
      const dataD2 = sampleFunction(d2, domain.min, domain.max, ND);
      return { id: bl.id, dataF, dataD, dataD2 };
    });
  }, [builtLayers, domain, N, ND]);

  const computedY = useMemo(() => {
    const all = seriesPerLayer.flatMap(s => s.dataF);
    return robustYRange([all], [-2, 2]);
  }, [seriesPerLayer]);
  useEffect(() => { onYRangeComputed && onYRangeComputed(computedY); }, [computedY, onYRangeComputed]);
  const yRangeUsed = yRange ? [yRange.min, yRange.max] : computedY;

  const sx = (domain.max - domain.min) / plotW || 1;
  const sy = (yRangeUsed[1] - yRangeUsed[0]) / plotH || sx;

  const xToSvg = (x) => pad + (x - domain.min) / sx;
  const yToSvg = (y) => {
    const yMax = yRangeUsed[1];
    return pad + (yMax - y) / sy;
  };
  const svgToX = (px) => domain.min + (px - pad) * sx;
  const svgToY = (py) => {
    const yMax = yRangeUsed[1];
    return yMax - (py - pad) * sy;
  };

  const ticks = useMemo(() => {
    const xStep = niceStep(domain.max - domain.min, 8);
    const yStep = niceStep(yRangeUsed[1] - yRangeUsed[0], 8);
    return {
      xStep, yStep,
      xTicks: genTicks(domain.min, domain.max, xStep),
      yTicks: genTicks(yRangeUsed[0], yRangeUsed[1], yStep)
    };
  }, [domain, yRangeUsed]);

  const pathsPerLayer = useMemo(() => {
    return seriesPerLayer.map((srs, idx) => {
      const color = layers[idx]?.color || '#fff';
      const opacity = layers[idx]?.opacity ?? 1;
      const exprTrim = (layers[idx]?.expr || '').trim();
      const allNaN = srs.dataF.every(p => !Number.isFinite(p.y));
      const allZero = srs.dataF.length > 0 && srs.dataF.every(p => Number.isFinite(p.y) && Math.abs(p.y) < 1e-12);
      const hideBase = (exprTrim === '' || allNaN || allZero);

      const pF = hideBase ? '' : buildUniformPath(sanitize(srs.dataF), xToSvg, yToSvg);
      const pD = (!hideBase && layers[idx]?.showD1) ? buildUniformPath(sanitize(srs.dataD), xToSvg, yToSvg) : '';
      const pD2 = (!hideBase && layers[idx]?.showD2) ? buildUniformPath(sanitize(srs.dataD2), xToSvg, yToSvg) : '';

      return { id: layers[idx]?.id ?? idx, pF, pD, pD2, color, opacity, hideBase };
    });
  }, [seriesPerLayer, layers, xToSvg, yToSvg]);

  const rootsPerLayer = useMemo(() => {
    if (!showRoots) return layers.map((l, i) => ({ id: layers[i]?.id ?? i, roots: [] }));
    return seriesPerLayer.map((s, idx) => {
      const hideBase = pathsPerLayer[idx]?.hideBase;
      if (hideBase) return { id: layers[idx]?.id ?? idx, roots: [] };
      const roots = [];
      const d = s.dataF;
      for (let i = 1; i < d.length; i++) {
        const a = d[i - 1], b = d[i];
        if (!Number.isFinite(a?.y) || !Number.isFinite(b?.y)) continue;
        if (a.y === 0) roots.push({ x: a.x, y: 0 });
        if (a.y * b.y < 0) {
          const t = a.x - a.y * (b.x - a.x) / (b.y - a.y);
          roots.push({ x: t, y: 0 });
        }
      }
      return { id: layers[idx]?.id ?? idx, roots };
    });
  }, [showRoots, seriesPerLayer, layers, pathsPerLayer]);

  const extsPerLayer = useMemo(() => {
    if (!showExtrema) return layers.map((l, i) => ({ id: layers[i]?.id ?? i, exts: [] }));
    return seriesPerLayer.map((s, idx) => {
      const hideBase = pathsPerLayer[idx]?.hideBase;
      if (hideBase) return { id: layers[idx]?.id ?? idx, exts: [] };
      const exts = [];
      const dd = s.dataD;
      for (let i = 1; i < dd.length; i++) {
        const a = dd[i - 1], b = dd[i];
        if (!Number.isFinite(a?.y) || !Number.isFinite(b?.y)) continue;
        if (a.y * b.y < 0) {
          const t = a.x - a.y * (b.x - a.x) / (b.y - a.y);
          let y = NaN;
          try { y = builtLayers[idx]?.f(t); } catch { y = NaN; }
          if (Number.isFinite(y)) exts.push({ x: t, y });
        }
      }
      return { id: layers[idx]?.id ?? idx, exts };
    });
  }, [showExtrema, seriesPerLayer, builtLayers, layers, pathsPerLayer]);

  const intersections = useMemo(() => {
    if (!showIntersections || seriesPerLayer.length < 2) return [];
    const out = [];
    for (let i = 0; i < seriesPerLayer.length; i++) {
      if (pathsPerLayer[i]?.hideBase) continue;
      for (let j = i + 1; j < seriesPerLayer.length; j++) {
        if (pathsPerLayer[j]?.hideBase) continue;
        const A = seriesPerLayer[i].dataF, B = seriesPerLayer[j].dataF;
        const n = Math.min(A.length, B.length);
        for (let k = 1; k < n; k++) {
          const a0 = A[k - 1], a1 = A[k], b0 = B[k - 1], b1 = B[k];
          if (![a0, a1, b0, b1].every(p => Number.isFinite(p?.y))) continue;
          const d0 = a0.y - b0.y, d1 = a1.y - b1.y;
          if (d0 === 0) out.push({ x: a0.x, y: a0.y });
          else if (d0 * d1 < 0) {
            const t = d0 / (d0 - d1);
            out.push({ x: a0.x + t * (a1.x - a0.x), y: a0.y + t * (a1.y - a0.y) });
          }
        }
      }
    }
    return out;
  }, [showIntersections, seriesPerLayer, pathsPerLayer]);

  const [isPanning, setIsPanning] = useState(false);
  const panEndTimer = useRef(null);
  const [taylorFrozen, setTaylorFrozen] = useState(() => new Map());

  const pendingTaylorRecompute = useRef(null);
  const recomputeTaylor = useRef(() => {});
  recomputeTaylor.current = () => {
    if (!taylorBuilder) return;
    const next = new Map();
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      const id = L.id ?? i;
      const color = L.color || '#fff';
      const opacity = (L.opacity ?? 1) * 0.95;
      if (!L.showTaylor) { next.set(id, { id, pts: [], color, opacity }); continue; }
      try {
        const terms = Math.max(1, Math.floor(Number(L.taylorDegree ?? 1)));
        const tfun = taylorBuilder(L.expr || '0', Number(L.taylorA0Val ?? 0), terms);
        const pts = sanitize(sampleFunction(tfun, domain.min, domain.max, TAYLOR_SAMPLES));
        next.set(id, { id, pts, color, opacity });
      } catch {
        next.set(id, { id, pts: [], color, opacity });
      }
    }
    setTaylorFrozen(prev => {
      const merged = new Map(prev);
      for (const [id, v] of next.entries()) merged.set(id, v);
      for (const id of Array.from(merged.keys())) if (!next.has(id)) merged.delete(id);
      return merged;
    });
  };

  useEffect(() => {
    if (isPanning) return;
    if (pendingTaylorRecompute.current) clearTimeout(pendingTaylorRecompute.current);
    pendingTaylorRecompute.current = setTimeout(() => { recomputeTaylor.current(); }, 60);
    return () => { if (pendingTaylorRecompute.current) clearTimeout(pendingTaylorRecompute.current); };
  }, [isPanning, taylorBuilder, domain.min, domain.max, ...layers.map(l => `${l.id}|${l.expr}|${l.taylorDegree}|${l.taylorA0Val}|${l.showTaylor}|${l.color}|${l.opacity}`)]);

  const svgRef = useRef(null);
  const [hoverPointId, setHoverPointId] = useState(null);

  const dragRef = useRef({
    dragging: false,
    action: 'none',
    lastPx: 0, lastPy: 0,
    domain: { ...domain },
    y: { min: yRangeUsed[0], max: yRangeUsed[1] },
    axisLocked: null,
    pointId: null,
    pointStart: { x: 0, y: 0 }
  });
  useEffect(() => { dragRef.current.domain = { ...domain }; }, [domain]);
  useEffect(() => { dragRef.current.y = { min: yRangeUsed[0], max: yRangeUsed[1] }; }, [yRangeUsed]);

  const inside = (px, py) => px >= pad && px <= pad + plotW && py >= pad && py <= pad + plotH;

  const hitManualPoint = (px, py) => {
    const r = 14;
    for (const p of manualPoints) {
      const dx = xToSvg(p.x) - px, dy = yToSvg(p.y) - py;
      if (dx*dx + dy*dy <= r*r) return p.id;
    }
    return null;
  };

  const onPointerDown = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (!inside(px, py)) return;

    if ((e.button === 0 || (e.buttons & 1)) && e.altKey) {
      onManualPointAdd(svgToX(px), svgToY(py));
      return;
    }

    if (e.button === 0 || (e.buttons & 1)) {
      const hitId = hitManualPoint(px, py);
      if (hitId != null) {
        dragRef.current.dragging = true;
        dragRef.current.action = 'point';
        dragRef.current.pointId = hitId;
        const p = manualPoints.find(m => m.id === hitId);
        dragRef.current.pointStart = { x: p?.x ?? svgToX(px), y: p?.y ?? svgToY(py) };
        dragRef.current.axisLocked = null;
        svgRef.current.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    if (e.button === 0 || e.button === 1 || (e.buttons & 1) || (e.buttons & 4)) {
      dragRef.current.dragging = true;
      dragRef.current.action = 'pan';
      dragRef.current.lastPx = px;
      dragRef.current.lastPy = py;
      dragRef.current.axisLocked = null;
      setIsPanning(true);
      svgRef.current.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  const onPointerMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;

    if (!dragRef.current.dragging) {
      const hitId = inside(px, py) ? hitManualPoint(px, py) : null;
      setHoverPointId(hitId);
    }

    if (!dragRef.current.dragging) return;

    if (dragRef.current.action === 'point' && dragRef.current.pointId != null) {
      const freeX = svgToX(px), freeY = svgToY(py);
      let nextX = freeX, nextY = freeY;

      if (e.shiftKey) {
        const dx = freeX - dragRef.current.pointStart.x;
        const dy = freeY - dragRef.current.pointStart.y;
        dragRef.current.axisLocked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (dragRef.current.axisLocked === 'x') nextY = dragRef.current.pointStart.y;
        else nextX = dragRef.current.pointStart.x;
      } else {
        dragRef.current.axisLocked = null;
      }

      onManualPointsChange(manualPoints.map(p =>
        p.id === dragRef.current.pointId ? { ...p, x: nextX, y: nextY } : p
      ));
      return;
    }

    if (dragRef.current.action === 'pan') {
      let dxPx = px - dragRef.current.lastPx;
      let dyPx = py - dragRef.current.lastPy;

      if (e.shiftKey) {
        if (!dragRef.current.axisLocked) {
          dragRef.current.axisLocked = Math.abs(dxPx) >= Math.abs(dyPx) ? 'x' : 'y';
        }
        if (dragRef.current.axisLocked === 'x') dyPx = 0;
        if (dragRef.current.axisLocked === 'y') dxPx = 0;
      } else {
        dragRef.current.axisLocked = null;
      }

      const dX = -dxPx * sx;
      const dY =  dyPx * sy;

      if (onDomainChange) {
        const nx = { min: dragRef.current.domain.min + dX, max: dragRef.current.domain.max + dX };
        onDomainChange(nx);
        dragRef.current.domain = nx;
      }
      if (onYRangeChange) {
        const ny = { min: dragRef.current.y.min + dY, max: dragRef.current.y.max + dY };
        onYRangeChange(ny);
        dragRef.current.y = ny;
      }

      dragRef.current.lastPx = px;
      dragRef.current.lastPy = py;

      if (!isPanning) setIsPanning(true);
    }
  };

  const finishPanSoon = () => {
    if (panEndTimer.current) clearTimeout(panEndTimer.current);
    panEndTimer.current = setTimeout(() => setIsPanning(false), 120);
  };

  const onPointerUp = (e) => {
    dragRef.current.dragging = false;
    if (dragRef.current.action === 'pan') finishPanSoon();
    dragRef.current.action = 'none';
    dragRef.current.pointId = null;
    dragRef.current.axisLocked = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const onPointerLeave = () => {
    setHoverPointId(null);
    if (dragRef.current.dragging) {
      dragRef.current.dragging = false;
      if (dragRef.current.action === 'pan') finishPanSoon();
      dragRef.current.action = 'none';
      dragRef.current.pointId = null;
      dragRef.current.axisLocked = null;
    }
  };

  const [coord, setCoord] = useState({ x: null, y: null, show: false });
  const updateCoord = (clientX, clientY) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    if (!inside(px, py)) return setCoord(c => ({ ...c, show: false }));
    setCoord({ x: svgToX(px), y: svgToY(py), show: true });
  };

  const uniformZoomAround = (factor, anchorPx, anchorPy) => {
    const anchorX = svgToX(anchorPx);
    const anchorY = svgToY(anchorPy);

    const sx2 = clamp(sx * factor, 1e-12, 1e12);
    const sy2 = clamp(sy * factor, 1e-12, 1e12);

    const newMinX = anchorX - (anchorPx - pad) * sx2;
    const newMaxX = newMinX + plotW * sx2;

    const newMaxY = anchorY + (anchorPy - pad) * sy2;
    const newMinY = newMaxY - plotH * sy2;

    onDomainChange && onDomainChange({ min: newMinX, max: newMaxX });
    onYRangeChange && onYRangeChange({ min: newMinY, max: newMaxY });
  };

  const onWheel = (e) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (!inside(px, py)) return;
    const sign = e.deltaY > 0 ? 1 : -1;
    const factor = Math.exp(sign * Math.min(0.12, Math.abs(e.deltaY) * 0.00045));
    uniformZoomAround(factor, px, py);
    updateCoord(e.clientX, e.clientY);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (ev) => ev.preventDefault();
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  return (
    <div className="graph" style={{ cursor: hoverPointId ? 'grab' : 'default' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label="Function graph"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { onPointerMove(e); updateCoord(e.clientX, e.clientY); }}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        <defs>
          <linearGradient id="fdash" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <clipPath id="plot-clip">
            <rect x={pad} y={pad} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        <rect x={pad} y={pad} width={plotW} height={plotH} fill="transparent" stroke="rgba(255,255,255,0.1)" />

        <g pointerEvents="none">
          {ticks.xTicks.map((tx, idx) => (
            <line key={`gx-${idx}`} x1={xToSvg(tx)} y1={pad} x2={xToSvg(tx)} y2={height - pad} stroke="rgba(255,255,255,0.06)" />
          ))}
          {ticks.yTicks.map((ty, idx) => (
            <line key={`gy-${idx}`} x1={pad} y1={yToSvg(ty)} x2={width - pad} y2={yToSvg(ty)} stroke="rgba(255,255,255,0.06)" />
          ))}
        </g>

        <g pointerEvents="none">
          {ticks.xTicks.map((tx, i) => (
            <text key={`xl-${i}`} x={xToSvg(tx)} y={height - pad + 20} textAnchor="middle" fontSize="11" fill="rgba(235,235,235,0.95)">{numberFmt(tx)}</text>
          ))}
          {ticks.yTicks.map((ty, i) => (
            <text key={`yl-${i}`} x={pad - 10} y={yToSvg(ty) + 4} textAnchor="end" fontSize="11" fill="rgba(235,235,235,0.95)">{numberFmt(ty)}</text>
          ))}
        </g>

        <line x1={pad} x2={width - pad} y1={yToSvg(0)} y2={yToSvg(0)} stroke="rgba(255,255,255,0.35)" pointerEvents="none" />
        <line y1={pad} y2={height - pad} x1={xToSvg(0)} x2={xToSvg(0)} stroke="rgba(255,255,255,0.35)" pointerEvents="none" />

        <g clipPath="url(#plot-clip)">
          <AnimatePresence>
            {pathsPerLayer.map((p) => p.pF ? (
              <motion.path
                key={`f-${p.id}`}
                d={p.pF}
                fill="none"
                stroke={p.color}
                strokeWidth="2.0"
                strokeOpacity={p.opacity}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            ) : null)}
          </AnimatePresence>

          <AnimatePresence>
            {pathsPerLayer.map((p, i) => p.pD ? (
              <motion.path
                key={`d1-${p.id}`}
                d={p.pD}
                fill="none"
                stroke="url(#fdash)"
                strokeDasharray="6 8"
                strokeOpacity={(pathsPerLayer[i]?.opacity ?? 1) * 0.9}
                strokeWidth="1.6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            ) : null)}
          </AnimatePresence>

          <AnimatePresence>
            {pathsPerLayer.map((p, i) => p.pD2 ? (
              <motion.path
                key={`d2-${p.id}`}
                d={p.pD2}
                fill="none"
                stroke="rgba(244,244,244,0.92)"
                strokeDasharray="3 6"
                strokeOpacity={(pathsPerLayer[i]?.opacity ?? 1) * 0.9}
                strokeWidth="1.4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            ) : null)}
          </AnimatePresence>

          {Array.from(taylorFrozen.values()).map(val => {
            if (!val.pts || val.pts.length < 2) return null;
            const dNow = buildUniformPath(val.pts, xToSvg, yToSvg);
            return (
              <motion.path
                key={`taylor-${val.id}`}
                d={dNow}
                fill="none"
                stroke={val.color}
                strokeOpacity={val.opacity}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="2 10"
                animate={{ d: dNow, opacity: val.opacity }}
                transition={{ duration: isPanning ? 0 : 0.3, ease: 'easeOut' }}
              />
            );
          })}

          <AnimatePresence>
            {showIntersections && intersections.map((p, i) => (
              <motion.circle
                key={`ix-${i}`}
                cx={xToSvg(p.x)} cy={yToSvg(p.y)} r="4.2"
                fill="#0b0b0b" stroke="#a78bfa" strokeWidth="1.6"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {showRoots && rootsPerLayer.map(layer => (
              <g key={`roots-${layer.id}`} pointerEvents="none">
                {layer.roots.map((p, i) => (
                  <motion.circle
                    key={`root-${layer.id}-${i}`}
                    cx={xToSvg(p.x)} cy={yToSvg(p.y)} r="4"
                    fill="#0b0b0b" stroke="#60a5fa" strokeWidth="1.6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  />
                ))}
              </g>
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {showExtrema && extsPerLayer.map(layer => (
              <g key={`exts-${layer.id}`} pointerEvents="none">
                {layer.exts.map((p, i) => (
                  <motion.circle
                    key={`ext-${layer.id}-${i}`}
                    cx={xToSvg(p.x)} cy={yToSvg(p.y)} r="4.2"
                    fill="#0b0b0b" stroke="#f472b6" strokeWidth="1.6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  />
                ))}
              </g>
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {manualPoints.map(p => {
              const hovered = hoverPointId === p.id;
              return (
                <motion.g key={`mp-${p.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <circle
                    cx={xToSvg(p.x)}
                    cy={yToSvg(p.y)}
                    r={hovered ? 6.5 : 5}
                    fill={hovered ? '#181818' : '#111'}
                    stroke={hovered ? '#ffd166' : '#fff'}
                    strokeWidth={hovered ? 2 : 1.6}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>

      {coord.show && (
        <div className="coord-hud">
          <span className="mono">x: {numberFmt(coord.x)} • y: {numberFmt(coord.y)}</span>
        </div>
      )}
    </div>
  );
}