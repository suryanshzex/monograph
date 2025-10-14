import { evaluate } from 'mathjs';

export function formatNumberSmart(n, opts = {}) {
  const { maxDecimals = 6, clampZero = 1e-9, trim = true } = opts;
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < clampZero) n = 0;
  const abs = Math.abs(n);
  let decimals = maxDecimals;
  if (abs >= 1000) decimals = 0;
  else if (abs >= 100) decimals = Math.min(decimals, 1);
  else if (abs >= 10) decimals = Math.min(decimals, 3);
  else if (abs >= 1) decimals = Math.min(decimals, 4);
  else if (abs >= 0.1) decimals = Math.min(decimals, 5);
  let s = n.toFixed(decimals);
  if (trim && s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

export function parseNumberExpr(str) {
  if (typeof str !== 'string') return NaN;
  let s = str.trim();
  if (s === '') return NaN;
  s = s.replace(/π/gi, 'pi');
  s = s.replace(/(\d)([a-zA-Z])/g, '$1*$2');
  s = s.replace(/([a-zA-Z])(\d)/g, '$1*$2');
  try {
    const v = evaluate(s);
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

export function prettyExpr(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replaceAll('pi', 'π')
    .replaceAll('*', '·')
    .replace(/([0-9])x/g, '$1·x')
    .replace(/x\^([0-9]+)/g, 'x^$1');
}