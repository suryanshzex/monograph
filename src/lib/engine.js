import nerdamer from 'nerdamer';
import 'nerdamer/Algebra';
import 'nerdamer/Calculus';
import 'nerdamer/Solve';
import 'nerdamer/Extra';
import { normalizeImplicitMul } from './math.js';

const toTex = (exprStr) => {
  try { return nerdamer(exprStr).toTeX(); } catch { return String(exprStr); }
};

const toTexExpr = (expr) => {
  try { return nerdamer(expr).toTeX(); } catch { return String(expr); }
};

const clean = (s = '') => {
  let out = s.trim()
    .replace(/π/g, 'pi')
    .replace(/\be\b/g, 'e');
  out = normalizeImplicitMul(out);
  return out;
};

const parseBounds = (s) => {
  const m1 = s.match(/\bfrom\s+(.+?)\s+to\s+(.+?)\s*$/i);
  const m2 = s.match(/\bbetween\s+(.+?)\s+and\s+(.+?)\s*$/i);
  const m = m1 || m2;
  if (!m) return null;
  const a = clean(m[1]);
  const b = clean(m[2]);
  const rest = s.slice(0, m.index).trim();
  return { a, b, rest: rest };
};

export function parseQuery(raw) {
  const s = (raw || '').trim();
  const low = s.toLowerCase();
  if (!s) return { intent: 'error', error: 'Empty input', raw };

  const mt = s.match(/^taylor\s+(.+?)\s+at\s+(.+?)(?:\s+(?:degree|order)\s+(\d+))?\s*$/i);
  if (mt) {
    return { intent: 'taylor', expr: clean(mt[1]), a: clean(mt[2]), degree: mt[3] ? parseInt(mt[3],10) : 10, raw };
  }

  if (/^(integrate|integral|definite integral|find integral|antiderivative)\s+/i.test(s)) {
    const t = s.replace(/^(integrate|integral|definite integral|find integral|antiderivative)\s+/i, '').trim();
    const binfo = parseBounds(t);
    if (binfo) {
      return { intent: 'integral_def', expr: clean(binfo.rest), a: binfo.a, b: binfo.b, raw };
    }
    return { intent: 'integral', expr: clean(t), raw };
  }

  const md = s.match(/^(?:find\s+)?derivative\s+(?:of\s+)?(.+)$/i)
         || (/^differentiate\s+/i.test(s) ? [null, s.replace(/^differentiate\s+/i,'')] : null)
         || (/^d\/dx\s+/i.test(s) ? [null, s.replace(/^d\/dx\s+/i,'')] : null);
  if (md) return { intent: 'derivative', expr: clean(md[1]), raw };

  if (/^factor\s+/i.test(s)) return { intent: 'factor', expr: clean(s.slice(7)), raw };
  if (/^expand\s+/i.test(s)) return { intent: 'expand', expr: clean(s.slice(7)), raw };

  const mr = s.match(/^(?:roots|zeros|find roots|find zeros)\s+(?:of\s+)?(.+)$/i);
  if (mr) return { intent: 'solve', left: clean(mr[1]), right: '0', raw };

  if (/^solve\s+/i.test(s)) {
    const t = s.slice(6).trim();
    if (t.includes('=')) {
      const [L, R] = t.split('=', 1);
      return { intent: 'solve', left: clean(L), right: clean(t.slice(L.length+1)), raw };
    }
    return { intent: 'solve', left: clean(t), right: '0', raw };
  }

  if (s.includes('=')) {
    const [L, R] = s.split('=', 1);
    return { intent: 'solve', left: clean(L), right: clean(s.slice(L.length+1)), raw };
  }

  return { intent: 'error', error: 'Try: solve x^2-4=0, derivative sin x, integrate sin x from 0 to pi, factor x^4-1, expand (x+1)^3, taylor e^x at 0 degree 10', raw };
}

const toNumber = (str) => {
  if (typeof str === 'number') return str;
  if (typeof str !== 'string') return NaN;
  const s = str.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  const frac = s.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  try {
    const v = nerdamer(s);
    const n = Number(v.evaluate().valueOf());
    return Number.isFinite(n) ? n : NaN;
  } catch { return NaN; }
};

const evalAt = (exprStr, xVal) => {
  try {
    const v = nerdamer(exprStr).evaluate({ x: xVal });
    const n = Number(v.evaluate().valueOf());
    return Number.isFinite(n) ? n : NaN;
  } catch { return NaN; }
};

const numericRootsScan = (eqExprStr, span=50, steps=2000) => {
  const xs = Array.from({length: steps+1}, (_,i)=> -span + (2*span*i/steps));
  const ys = xs.map(x=>evalAt(eqExprStr, x));
  const roots = [];
  for (let i=1;i<xs.length;i++){
    const y0=ys[i-1], y1=ys[i];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0===0) { roots.push(xs[i-1]); continue; }
    if (y0*y1<0){
      const t = xs[i-1] - y0*(xs[i]-xs[i-1])/(y1 - y0);
      if (Number.isFinite(t)) roots.push(t);
    }
  }
  roots.sort((a,b)=>a-b);
  const out=[];
  for (const r of roots) if (!out.length || Math.abs(out[out.length-1]-r)>1e-6) out.push(r);
  return out;
};

const factorial = (n)=> n<=1?1:n*factorial(n-1);

export function buildTaylor(expr, a, degree){
  const A = toNumber(a);
  const deg = Math.max(1, Math.min(50, Number(degree||10)));
  const terms = [];
  for (let k=0;k<=deg;k++){
    try{
      const d = k===0 ? nerdamer(expr) : nerdamer(`diff(${expr}, x, ${k})`);
      const valStr = d.evaluate({ x: A }).text();
      const val = toNumber(valStr);
      if (!Number.isFinite(val)) { terms.push('0'); continue; }
      if (k===0) terms.push(`${val}`);
      else {
        const denom = factorial(k);
       if (A===0) terms.push(`${val/denom}*x^${k}`);
        else terms.push(`${val/denom}*(x-(${A}))^${k}`);
      }
    } catch { terms.push('0'); }
  }
  const sum = terms.join('+');
  let poly = sum;
  try { poly = nerdamer(sum).expand().text(); } catch {}
  return {
    polynomial: poly,
    latex: toTex(poly)
  };
}

export async function computeLocal(query) {
  const resp = parseQuery(query);
  const intent = resp.intent;

  try {
    if (intent === 'solve') {
      const left = resp.left, right = resp.right;
      const eq = `(${left})-(${right})`;
      let exactLatex = [];
      try {
        const sol = nerdamer(`solve(${eq}, x)`);
        const solStr = (sol && typeof sol.text==='function') ? sol.text() : String(sol);
        const arr = solStr.replace(/^\[|\]$/g,'').split(',').map(s=>s.trim()).filter(Boolean);
        exactLatex = arr.map(s => toTexExpr(s));
      } catch {}
      const numeric = numericRootsScan(eq);
      return {
        intent: 'solve',
        left, right,
        left_latex: toTexExpr(left),
        right_latex: toTexExpr(right),
        solutions_exact_latex: exactLatex,
        solutions_numeric: numeric
      };
    }

    if (intent === 'factor' || intent === 'expand') {
      const expr = resp.expr;
      const expr_latex = toTexExpr(expr);
      let fact = '', expd = '';
      try { fact = nerdamer(`factor(${expr})`).text(); } catch {}
      try { expd = nerdamer(expr).expand().text(); } catch {}
      return {
        intent,
        expr,
        expr_latex,
        factored: fact,
        factored_latex: fact ? toTex(fact) : '',
        expanded: expd,
        expanded_latex: expd ? toTex(expd) : ''
      };
    }

    if (intent === 'derivative') {
      const expr = resp.expr;
      const d = nerdamer(`diff(${expr}, x)`).text();
      return {
        intent,
        expr,
        expr_latex: toTexExpr(expr),
        derivative: d,
        derivative_latex: toTex(d)
      };
    }

    if (intent === 'integral') {
      const expr = resp.expr;
      let F = '';
      try { F = nerdamer.integrate(expr, 'x').text(); } catch {}
      const op = `\\int ${toTexExpr(expr)}\\,dx`;
      return {
        intent,
        expr,
        expr_latex: toTexExpr(expr),
        integral_op_latex: op,
        integral: F ? `${F} + C` : '',
        integral_latex: F ? `${toTex(F)} + C` : ''
      };
    }

    if (intent === 'integral_def') {
      const { expr, a, b } = resp;
      let val = '';
      try { val = nerdamer(`defint(${expr}, x, ${a}, ${b})`).text(); } catch {}
      const needNumeric = !val || /defint\(/.test(val);
      if (needNumeric) {
        const f = (x)=>evalAt(expr, x);
        const A = toNumber(a), B = toNumber(b);
        const numeric = simpsonAdaptive(f, A, B);
        val = String(numeric);
      }
      const op = `\\int_{${toTexExpr(a)}}^{${toTexExpr(b)}} ${toTexExpr(expr)}\\,dx`;
      return {
        intent,
        expr,
        expr_latex: toTexExpr(expr),
        a_latex: toTexExpr(a),
        b_latex: toTexExpr(b),
        integral_op_latex: op,
        integral_value: val,
        integral_value_latex: toTexExpr(val)
      };
    }

    if (intent === 'taylor') {
      const { expr, a, degree } = resp;
      const t = buildTaylor(expr, a, degree ?? 10);
      return {
        intent,
        expr,
        expr_latex: toTexExpr(expr),
        a_latex: toTexExpr(a),
        degree: degree ?? 10,
        taylor_polynomial: t.polynomial,
        taylor_latex: t.latex
      };
    }

    return resp;
  } catch (e) {
    return { intent: 'error', error: e?.message || 'Computation error' };
  }
}

function simpsonAdaptive(f, a, b, eps=1e-7, maxDepth=16){
  const S = (f,a,b)=> (b-a)/6*(f(a)+4*f((a+b)/2)+f(b));
  const recurse=(f,a,b,eps,whole,depth)=>{
    const c=(a+b)/2;
    const left=S(f,a,c), right=S(f,c,b);
    const delta=left+right-whole;
    if (depth<=0 || Math.abs(delta)<15*eps) return left+right+delta/15;
    return recurse(f,a,c,eps/2,left,depth-1)+recurse(f,c,b,eps/2,right,depth-1);
  };
  const whole = S(f,a,b);
  return recurse(f,a,b,eps,whole,maxDepth);
}