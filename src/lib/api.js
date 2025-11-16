import { computeLocal, buildTaylor } from './engine.js';

export async function computeQuery(query) {
  return computeLocal(query);
}

export async function taylorPoly(expr, a, degree) {
  const t = buildTaylor(expr, a, degree);
  return {
    expr, a, degree,
    polynomial: t.polynomial,
    latex: t.latex
  };
}