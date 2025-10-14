import React, { useEffect } from 'react';

export default function InfoPanel({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="info-overlay" onClick={onClose} />
      <div className="info-modal" role="dialog" aria-modal="true" aria-label="Info">
        <div className="info-body">
          <section>
            <h4>variables</h4>
            <ul className="info-list">
              <li>x</li>
              <li>single-letter parameters like a, b, c</li>
            </ul>
          </section>

          <section>
            <h4>constants</h4>
            <ul className="info-list">
              <li>pi or π</li>
              <li>e</li>
            </ul>
          </section>

          <section>
            <h4>operators</h4>
            <ul className="info-list">
              <li>+, −, ×, ÷, ^</li>
              <li>parentheses ( )</li>
              <li>absolute value |x|</li>
            </ul>
          </section>

          <section>
            <h4>functions</h4>
            <ul className="info-list grid">
              <li>sin, cos, tan</li>
              <li>asin, acos, atan</li>
              <li>sqrt, abs</li>
              <li>exp</li>
              <li>log, ln, log10, log2</li>
              <li>floor, ceil</li>
              <li>min, max</li>
            </ul>
          </section>

          <section>
            <h4>log tips</h4>
            <ul className="info-list">
              <li>log(x) and ln(x) are natural log</li>
              <li>log(x, base) for custom base</li>
              <li>log10(x), log2(x) helpers</li>
            </ul>
          </section>

          <section>
            <h4>examples</h4>
            <ul className="info-list code">
              <li>sin(x) + cos(2x)</li>
              <li>abs(x) + 0.5</li>
              <li>exp(x^2)</li>
              <li>log(x, 3)</li>
              <li>|x| + floor(x)</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}