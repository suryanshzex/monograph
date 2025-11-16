const BASE = import.meta?.env?.VITE_FX_API_URL || 'http://127.0.0.1:8000/api';

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

export const computeQuery = (query) => post('/compute', { query });
export const taylorPoly = (expr, a, degree) => post('/taylor', { expr, a, degree });