import { buildMathFunctions } from './math.js';

const EPS = 1e-10;
const MAX_TERMS = 24; 
const CACHE = new Map();

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function isSinX(expr) {
  const s = String(expr || '').replace(/\s+/g, '').toLowerCase();
  return s === 'sin(x)';
}

function polyEvalNonZero(coeffs, a0, x) {
  const dx = x - a0;
  let sum = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const { k, c } = coeffs[i];
    sum += c * Math.pow(dx, k);
  }
  return sum;
}

function d1(f, x, h) {
  let fm, fp;
  try { fm = f(x - h); } catch { fm = NaN; }
  try { fp = f(x + h); } catch { fp = NaN; }
  const v = (fp - fm) / (2 * h);
  return Number.isFinite(v) ? v : NaN;
}

function nthDerivativeCentral(f, a, n, h) {
  if (n === 0) {
    let y = NaN;
    try { y = f(a); } catch { y = NaN; }
    return Number.isFinite(y) ? y : NaN;
  }
  let g = (x) => {
    let y = NaN;
    try { y = f(x); } catch { y = NaN; }
    return y;
  };
  for (let i = 0; i < n; i++) {
    const prev = g;
    g = (x) => d1(prev, x, h);
  }
  return g(a);
}

function chooseStep(a) {
  const scale = Math.max(1, Math.abs(a));
  return Math.min(1e-2, 1e-3 * scale);
}

export function taylorFromExpr(expr, a0 = 0, terms = 1) {
  const T = Math.max(1, Math.min(MAX_TERMS, Math.floor(+terms || 1)));

  const cacheKey = `${String(expr || '')}__a0=${+a0}__T=${T}`;
  const cached = CACHE.get(cacheKey);
  if (cached) {
    const { coeffs } = cached;
    return (x) => polyEvalNonZero(coeffs, a0, x);
  }

  if (isSinX(expr) && Math.abs(a0) <= 1e-9) {
    const coeffs = [];
    for (let n = 0; n < T; n++) {
      const k = 2 * n + 1;
      const c = ((n % 2) === 0 ? 1 : -1) / factorial(k);
      coeffs.push({ k, c });
    }
    CACHE.set(cacheKey, { coeffs, a0, terms: T });
    return (x) => polyEvalNonZero(coeffs, a0, x);
  }

  const { f: baseF } = buildMathFunctions(expr || '0', {});
  const f = (x) => {
    try {
      const y = baseF(x);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  };

  const h = chooseStep(a0);
  const coeffs = [];
  let k = 0;
  const KMAX = Math.min(2 * T + 16, 80);
  while (coeffs.length < T && k <= KMAX) {
    const dka = nthDerivativeCentral(f, a0, k, h);
    if (Number.isFinite(dka)) {
      const ck = dka / factorial(k);
      if (Math.abs(ck) > EPS) coeffs.push({ k, c: ck });
    }
    k++;
  }

  if (coeffs.length === 0) {
    const zero = (_x) => 0;
    CACHE.set(cacheKey, { coeffs, a0, terms: T });
    return zero;
  }

  CACHE.set(cacheKey, { coeffs, a0, terms: T });
  return (x) => polyEvalNonZero(coeffs, a0, x);
}

export default taylorFromExpr;