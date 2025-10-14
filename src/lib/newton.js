export function newtonRaphson({
  f,
  df,
  x0,
  maxIter = 10,
  tol = 1e-8
}) {
  const steps = [];
  let x = Number(x0);
  if (!Number.isFinite(x)) {
    return { steps, converged: false, root: NaN, fAtRoot: NaN };
  }
  for (let i = 0; i < maxIter; i++) {
    const fx = f(x);
    const dfx = df(x);
    if (!Number.isFinite(fx) || !Number.isFinite(dfx)) {
      break;
    }
    if (Math.abs(dfx) < 1e-14) {
      steps.push({ i, x, fx, dfx, xNext: NaN, reason: 'small-derivative' });
      break;
    }
    const xNext = x - fx / dfx;
    steps.push({ i, x, fx, dfx, xNext });
    if (!Number.isFinite(xNext)) break;
    if (Math.abs(xNext - x) < tol) {
      x = xNext;
      break;
    }
    x = xNext;
  }
  const last = steps[steps.length - 1];
  const root = last?.xNext ?? x;
  const fAtRoot = f(root);
  const converged =
    Number.isFinite(root) &&
    Number.isFinite(fAtRoot) &&
    (steps.length >= 1) &&
    (Math.abs(last?.xNext - last?.x) < tol);
  return { steps, converged, root, fAtRoot };
}