import re
import os
from typing import List, Tuple, Optional
from flask import Flask, request, jsonify
from flask_cors import CORS
from sympy import (
    symbols, sympify, solveset, S, FiniteSet, Poly, nroots, nsolve,
    latex, factor, expand, diff, integrate, series, Integral
)
from sympy.core.sympify import SympifyError
from sympy.utilities.lambdify import lambdify
from sympy import factorial as sym_factorial
from math import isfinite

x = symbols('x')
app = Flask(__name__)
CORS(app)

def ltx(expr) -> str:
    return latex(expr, mul_symbol=' ')  # no \cdot

def clean_expr(expr: str) -> str:
    s = (expr or '').strip()
    s = s.replace('^', '**')
    s = re.sub(r'\bpi\b', 'pi', s)
    s = re.sub(r'\be\b', 'E', s)
    return s

def safe_sympify(s: str):
    try:
        return sympify(s, convert_xor=True)
    except Exception:
        return None

def parse_bounds_phrase(s: str) -> Optional[Tuple[str, str, str]]:
    m = re.search(r'\bfrom\s+(.+?)\s+to\s+(.+?)\s*$', s, flags=re.IGNORECASE)
    if not m:
        m = re.search(r'\bbetween\s+(.+?)\s+and\s+(.+?)\s*$', s, flags=re.IGNORECASE)
    if not m:
        return None
    a, b = m.group(1).strip(), m.group(2).strip()
    rest = s[:m.start()].strip()
    return (clean_expr(a), clean_expr(b), rest)

def parse_query(raw: str):
    s = (raw or '').strip()
    low = s.lower()
    if not s:
        return {"intent": "error", "error": "Empty input", "raw": raw}

    # taylor f at a [degree|order n]
    m = re.match(r'^taylor\s+(.+?)\s+at\s+(.+?)(?:\s+(?:degree|order)\s+(\d+))?\s*$', s, re.IGNORECASE)
    if m:
        expr = clean_expr(m.group(1))
        a = clean_expr(m.group(2))
        deg = int(m.group(3)) if m.group(3) else 10
        return {"intent": "taylor", "expr": expr, "a": a, "degree": deg, "raw": raw}

    # integrate/integral (+ definite if bounds)
    if low.startswith('integrate ') or low.startswith('integral ') or low.startswith('definite integral ') or low.startswith('find integral ') or low.startswith('antiderivative '):
        t = re.sub(r'^(integrate|integral|definite integral|find integral|antiderivative)\s+', '', s, flags=re.IGNORECASE).strip()
        binfo = parse_bounds_phrase(t)
        if binfo:
            a, b, expr_part = binfo
            return {"intent": "integral_def", "expr": clean_expr(expr_part), "a": a, "b": b, "raw": raw}
        return {"intent": "integral", "expr": clean_expr(t), "raw": raw}

    # derivative / differentiate / find derivative of / d/dx
    m = re.match(r'^(?:find\s+)?derivative\s+(?:of\s+)?(.+)$', s, re.IGNORECASE)
    if m:
        return {"intent": "derivative", "expr": clean_expr(m.group(1)), "raw": raw}
    if low.startswith('differentiate ') or low.startswith('d/dx '):
        expr = re.sub(r'^(differentiate|d/dx)\s+', '', s, flags=re.IGNORECASE)
        return {"intent": "derivative", "expr": clean_expr(expr), "raw": raw}

    # factor / expand
    if low.startswith('factor '):
        return {"intent": "factor", "expr": clean_expr(s[7:]), "raw": raw}
    if low.startswith('expand '):
        return {"intent": "expand", "expr": clean_expr(s[7:]), "raw": raw}

    # roots/zeros
    m = re.match(r'^(?:roots|zeros|find roots|find zeros)\s+(?:of\s+)?(.+)$', s, re.IGNORECASE)
    if m:
        expr = clean_expr(m.group(1))
        return {"intent": "solve", "left": expr, "right": '0', "raw": raw}

    # solve (equation or expression = 0)
    if low.startswith('solve '):
        t = s[6:].strip()
        if '=' in t:
            left, right = t.split('=', 1)
        else:
            left, right = t, '0'
        return {"intent": "solve", "left": clean_expr(left), "right": clean_expr(right), "raw": raw}

    # bare equation
    if '=' in s:
        left, right = s.split('=', 1)
        return {"intent": "solve", "left": clean_expr(left), "right": clean_expr(right), "raw": raw}

    return {"intent": "error", "error": "Try: solve x^2-4=0, roots of sin x, derivative sin x, integrate x^2, integrate sin x from 0 to pi, factor x^4-1, expand (x+1)^3, taylor e^x at 0 degree 10", "raw": raw}

def numeric_roots_fallback(eq_expr, span=50, steps=2000) -> List[float]:
    f = lambdify(x, eq_expr, 'math')
    xs = [(-span + 2*span*i/steps) for i in range(steps+1)]
    vals = []
    for xv in xs:
        try:
            yv = f(xv)
        except Exception:
            yv = None
        vals.append(yv if (yv is not None and isfinite(yv)) else None)

    roots = []
    for i in range(1, len(xs)):
        y0, y1 = vals[i-1], vals[i]
        if y0 is None or y1 is None:
            continue
        if y0 == 0:
            roots.append(xs[i-1]); continue
        if y0*y1 < 0:
            a, b = xs[i-1], xs[i]
            mid = (a+b)/2
            try:
                r = nsolve(eq_expr, mid, tol=1e-14, maxsteps=100)
                rv = float(r)
                if isfinite(rv):
                    roots.append(rv)
            except Exception:
                t = a - y0*(b-a)/(y1 - y0)
                if isfinite(t):
                    roots.append(float(t))
    out = []
    for r in sorted(roots):
        if not out or abs(out[-1]-r) > 1e-6:
            out.append(r)
    return out

@app.post("/api/compute")
def api_compute():
    data = request.get_json(force=True)
    raw = data.get("query", "")
    resp = parse_query(raw)

    try:
        intent = resp.get("intent")

        if intent == "solve":
            left = safe_sympify(resp.get("left"))
            right = safe_sympify(resp.get("right"))
            if left is None or right is None:
                resp["error"] = "Invalid expression"
            else:
                eq = left - right
                sol = solveset(eq, x, domain=S.Complexes)
                exact, exact_ltx, numeric = [], [], []
                if isinstance(sol, FiniteSet):
                    for r in sol:
                        exact.append(str(r))
                        exact_ltx.append(ltx(r))
                        if r.is_real:
                            numeric.append(float(r.evalf()))
                if not exact:
                    try:
                        p = Poly(eq, x)
                        for r in nroots(p):
                            rv = complex(r)
                            if abs(rv.imag) < 1e-12:
                                numeric.append(float(rv.real))
                    except Exception:
                        pass
                if not exact and not numeric:
                    try:
                        numeric = numeric_roots_fallback(eq)
                    except Exception:
                        pass
                resp["solutions_exact"] = exact
                resp["solutions_exact_latex"] = exact_ltx
                resp["solutions_numeric"] = sorted(numeric)
                resp["left_latex"] = ltx(left)
                resp["right_latex"] = ltx(right)

        elif intent in ("factor", "expand"):
            node = safe_sympify(resp.get("expr"))
            if node is None:
                resp["error"] = "Invalid expression"
            else:
                resp["expr_latex"] = ltx(node)
                if intent == "factor":
                    f = factor(node); e = expand(node)
                    resp["factored"] = str(f); resp["factored_latex"] = ltx(f)
                    resp["expanded"] = str(e); resp["expanded_latex"] = ltx(e)
                else:
                    e = expand(node); f = factor(node)
                    resp["expanded"] = str(e); resp["expanded_latex"] = ltx(e)
                    resp["factored"] = str(f); resp["factored_latex"] = ltx(f)

        elif intent == "derivative":
            node = safe_sympify(resp.get("expr"))
            if node is None:
                resp["error"] = "Invalid expression"
            else:
                d = diff(node, x)
                resp["expr_latex"] = ltx(node)
                resp["derivative"] = str(d)
                resp["derivative_latex"] = ltx(d)

        elif intent == "integral":
            node = safe_sympify(resp.get("expr"))
            if node is None:
                resp["error"] = "Invalid expression"
            else:
                op = Integral(node, x)
                F = integrate(node, x)
                resp["expr_latex"] = ltx(node)
                resp["integral_op_latex"] = ltx(op)
                resp["integral"] = str(F) + " + C"
                resp["integral_latex"] = ltx(F) + " + C"

        elif intent == "integral_def":
            node = safe_sympify(resp.get("expr"))
            a_node = safe_sympify(resp.get("a"))
            b_node = safe_sympify(resp.get("b"))
            if node is None or a_node is None or b_node is None:
                resp["error"] = "Invalid expression or bounds"
            else:
                op = Integral(node, (x, a_node, b_node))
                val = integrate(node, (x, a_node, b_node))
                resp["expr_latex"] = ltx(node)
                resp["a_latex"] = ltx(a_node)
                resp["b_latex"] = ltx(b_node)
                resp["integral_op_latex"] = ltx(op)
                resp["integral_value"] = str(val)
                resp["integral_value_latex"] = ltx(val)

        elif intent == "taylor":
            node = safe_sympify(resp.get("expr"))
            a_node = safe_sympify(resp.get("a", "0"))
            deg = int(resp.get("degree", 10))
            if node is None or a_node is None:
                resp["error"] = "Invalid expression"
            else:
                ser = series(node, x, a_node, deg + 1).removeO()
                # build explicit term list too (for clarity)
                terms = []
                for k in range(deg + 1):
                    try:
                        term = diff(node, x, k).subs(x, a_node) / sym_factorial(k) * (x - a_node)**k
                        terms.append(ltx(term.simplify()))
                    except Exception:
                        terms.append('')
                resp["expr_latex"] = ltx(node)
                resp["a_latex"] = ltx(a_node)
                resp["degree"] = deg
                resp["taylor_polynomial"] = str(ser)
                resp["taylor_latex"] = ltx(ser)
                resp["taylor_terms_latex"] = terms

    except Exception as e:
        resp["error"] = str(e)

    return jsonify(resp)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)