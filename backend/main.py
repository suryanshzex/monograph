from flask import Flask, request, jsonify
from flask_cors import CORS
from sympy import symbols, solveset, S, FiniteSet, latex

app = Flask(__name__)
CORS(app)  # You can tighten origins later
x = symbols('x')

@app.post("/api/compute")
def compute():
    data = request.get_json(force=True) or {}
    expr = data.get("query", "x^2-4=0")
    # Minimal example parse
    if "=" in expr:
        left, right = expr.split("=", 1)
    else:
        left, right = expr, "0"
    try:
        sol = solveset(symbols(left) - symbols(right), x, domain=S.Complexes)
    except Exception:
        sol = FiniteSet()
    exact = [str(r) for r in sol] if isinstance(sol, FiniteSet) else []
    return jsonify({"solutions": exact})

if __name__ == "__main__":
    # Local only (Railway will ignore this, gunicorn handles prod)
    app.run(host="127.0.0.1", port=8000, debug=True)