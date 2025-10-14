import { parse, derivative, evaluate } from 'mathjs';

function normalizeAbsBarsAndPi(expr) {
  if (typeof expr !== 'string') return '';
  let s = expr.replace(/π/gi, 'pi');
  let out = '';
  let open = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '|') {
      if (!open) { out += 'abs('; open = true; }
      else { out += ')'; open = false; }
    } else out += ch;
  }
  if (open) out += '|';
  return out;
}

function rewriteEHatToExpString(input) {
  const s = input;
  let i = 0, out = '';
  const isIdentStart = (c) => /[A-Za-z_]/.test(c);
  const isIdentChar  = (c) => /[A-Za-z0-9_]/.test(c);
  const isSpace      = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const skipSpaces = () => { while (i < s.length && isSpace(s[i])) i++; };
  function captureBalanced(open, close) {
    if (s[i] !== open) return '';
    let start = i, depth = 0;
    while (i < s.length) {
      const ch = s[i++];
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) break;
      }
    }
    return s.slice(start, i);
  }
  function captureGroupOrCallOrAtom() {
    skipSpaces();
    if (s[i] === '(') return captureBalanced('(', ')');
    if (s[i] === '|') {
      const start = i++;
      while (i < s.length && s[i] !== '|') {
        if (s[i] === '(') captureBalanced('(', ')'); else i++;
      }
      if (i < s.length && s[i] === '|') i++;
      return s.slice(start, i);
    }
    if (isIdentStart(s[i])) {
      const start = i++;
      while (i < s.length && isIdentChar(s[i])) i++;
      const name = s.slice(start, i);
      const save = i;
      skipSpaces();
      if (s[i] === '(') return name + captureBalanced('(', ')');
      i = save;
      return name;
    }
    if ((s[i] >= '0' && s[i] <= '9') || s[i] === '.') {
      const start = i++;
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) i++;
      return s.slice(start, i);
    }
    return s[i++];
  }
  function captureExponentFactor() {
    skipSpaces();
    let sign = '';
    if (s[i] === '+' || s[i] === '-') sign = s[i++];
    const body = captureGroupOrCallOrAtom();
    return sign + body;
  }
  function captureCaretChain() {
    let result = captureExponentFactor();
    for (;;) {
      const save = i;
      skipSpaces();
      if (s[i] !== '^') { i = save; break; }
      i++;
      result += '^' + captureExponentFactor();
    }
    return result;
  }
  while (i < s.length) {
    const prev = i > 0 ? s[i - 1] : '';
    if ((s[i] === 'e' || s[i] === 'E') && !isIdentChar(prev)) {
      const save = i;
      let j = i + 1;
      while (j < s.length && isSpace(s[j])) j++;
      if (s[j] === '^') {
        i = j + 1;
        const captured = captureCaretChain();
        if (captured.length > 0) { out += 'exp(' + captured + ')'; continue; }
        i = save;
      }
    }
    out += s[i++];
  }
  return out;
}

export function normalizeImplicitMul(expr) {
  return normalizeAbsBarsAndPi(expr ?? '');
}

export function detectParams(expr) {
  try {
    const normalized = normalizeImplicitMul(expr || '0');
    const node = parse(normalized);
    const params = new Set();
    node.traverse((n, _path, parent) => {
      if (n && n.isSymbolNode) {
        const name = String(n.name);
        const lower = name.toLowerCase();
        if (lower === 'x' || lower === 'e' || lower === 'pi') return;
        if (parent && parent.isFunctionNode && parent.fn === n) return;
        if (/^[a-z]$/i.test(name)) params.add(lower);
      }
    });
    return Array.from(params).sort();
  } catch {
    return [];
  }
}

function toFiniteNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v && typeof v.toNumber === 'function') {
    try {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : NaN;
    } catch {}
  }
  if (v && typeof v.valueOf === 'function') {
    try {
      const n = v.valueOf();
      if (typeof n === 'number') return Number.isFinite(n) ? n : NaN;
    } catch {}
  }
  if (v && typeof v.re === 'number' && typeof v.im === 'number') {
    return Math.abs(v.im) < 1e-12 && Number.isFinite(v.re) ? v.re : NaN;
  }
  return NaN;
}

export function buildMathFunctions(expr, vars = {}) {
  const raw = (expr ?? '').trim();
  if (!raw) {
    const nan = (_x) => NaN;
    return { f: nan, df: nan, d1expr: '', d2expr: '', error: null };
  }
  try {
    const normalized = normalizeImplicitMul(raw);
    const rewritten = rewriteEHatToExpString(normalized);
    const node = parse(rewritten);
    const compiled = node.compile();
    const scopeBase = {
      e: Math.E,
      pi: Math.PI,
      ln: (x) => Math.log(x),
      log10: (x) => Math.log10(x),
      log2: (x) => Math.log2(x),
      ...vars
    };
    const f = (x) => {
      try {
        const val = compiled.evaluate({ x, ...scopeBase });
        const n = toFiniteNumber(val);
        return Number.isFinite(n) ? n : NaN;
      } catch {
        try {
          const val2 = evaluate(rewritten, { x, ...scopeBase });
          const n2 = toFiniteNumber(val2);
          return Number.isFinite(n2) ? n2 : NaN;
        } catch {
          return NaN;
        }
      }
    };
    let dcompiled = null;
    try {
      const dnode = derivative(node, 'x');
      dcompiled = dnode.compile();
    } catch {
      dcompiled = null;
    }
    const df = dcompiled
      ? (x) => {
          try {
            const val = dcompiled.evaluate({ x, ...scopeBase });
            const n = toFiniteNumber(val);
            return Number.isFinite(n) ? n : NaN;
          } catch {
            return NaN;
          }
        }
      : (x) => {
          const h = Math.max(1e-6, Math.abs(x) * 1e-6 + 1e-6);
          const a = f(x - h);
          const b = f(x + h);
          const d = (b - a) / (2 * h);
          return Number.isFinite(d) ? d : NaN;
        };
    return { f, df, d1expr: '', d2expr: '', error: null };
  } catch (e) {
    return { f: (_x) => NaN, df: (_x) => NaN, d1expr: '', d2expr: '', error: e?.message || 'Invalid expression' };
  }
}