import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { computeQuery } from '../lib/api.js';

function K({ latex, block=false, className='' }) {
  if (!latex) return null;
  let html;
  try { html = katex.renderToString(latex, { displayMode: block, throwOnError: false }); }
  catch { html = latex; }
  return <span className={`k ${block ? 'blk' : ''} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function InputTool({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [resp, setResp] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inflight = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
    else { setQuery(''); setResp(null); setErr(null); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResp(null); setErr(null); return; }
    debounceRef.current = setTimeout(async () => {
      const tag = ++inflight.current;
      setLoading(true); setErr(null);
      try {
        const r = await computeQuery(query);
        if (inflight.current !== tag) return;
        if (r.intent === 'error') { setErr(r.error || 'Invalid'); setResp(null); }
        else setResp(r);
      } catch (e) {
        if (inflight.current === tag) { setErr(e.message); setResp(null); }
      } finally {
        if (inflight.current === tag) setLoading(false);
      }
    }, 500);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open]);

  useEffect(() => {
    const onEsc = e => { if (open && e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const stopGlobal = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f' || (k === 'k' && (e.metaKey || e.ctrlKey))) {
      e.stopPropagation();
      if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
    }
  };

  const Body = useMemo(() => {
    if (loading) return <div className="cp-row">Working…</div>;
    if (err) return <div className="cp-row err">{err}</div>;
    if (!resp) return null;

    switch (resp.intent) {
      case 'solve': {
        const lhs = resp.left_latex || resp.left || '';
        const rhs = resp.right_latex || resp.right || '';
        const exact = resp.solutions_exact_latex || [];
        const nums = resp.solutions_numeric || [];
        return (
          <>
            <div className="cp-row big"><K latex={`${lhs} = ${rhs}`} block /></div>
            {exact.length > 0 && (
              <div className="cp-row">
                Exact:&nbsp;{exact.map((ltx, i) => <span key={i} className="mr12"><K latex={ltx} /></span>)}
              </div>
            )}
            {nums.length > 0 && <div className="cp-row">Numeric: {nums.join(', ')}</div>}
            {exact.length === 0 && nums.length === 0 && <div className="cp-row">No solutions found</div>}
          </>
        );
      }
      case 'factor':
        return (
          <>
            <div className="cp-row big"><K latex={resp.expr_latex} block /></div>
            {resp.factored_latex && <div className="cp-row">Factored: <K latex={resp.factored_latex} /></div>}
            {resp.expanded_latex && <div className="cp-row">Expanded: <K latex={resp.expanded_latex} /></div>}
          </>
        );
      case 'expand':
        return (
          <>
            <div className="cp-row big"><K latex={resp.expr_latex} block /></div>
            {resp.expanded_latex && <div className="cp-row">Expanded: <K latex={resp.expanded_latex} /></div>}
            {resp.factored_latex && <div className="cp-row">Factored: <K latex={resp.factored_latex} /></div>}
          </>
        );
      case 'derivative':
        return (
          <>
            <div className="cp-row">f(x) = <K latex={resp.expr_latex} /></div>
            <div className="cp-row big">f′(x) = <K latex={resp.derivative_latex} /></div>
          </>
        );
      case 'integral':
        return (
          <>
            <div className="cp-row big"><K latex={resp.integral_op_latex} block /></div>
            <div className="cp-row">= <K latex={resp.integral_latex} /></div>
          </>
        );
      case 'integral_def':
        return (
          <>
            <div className="cp-row big"><K latex={resp.integral_op_latex} block /></div>
            {resp.integral_value_latex && <div className="cp-row">= <K latex={resp.integral_value_latex} /></div>}
          </>
        );
      case 'taylor':
        return (
          <>
            <div className="cp-row">f(x) = <K latex={resp.expr_latex} /></div>
            <div className="cp-row">a = <K latex={resp.a_latex} /> • degree = {resp.degree}</div>
            <div className="cp-row big"><K latex={resp.taylor_latex} block /></div>
          </>
        );
      default:
        return <div className="cp-row err">Unsupported</div>;
    }
  }, [loading, err, resp]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="cp-root" aria-modal="true" role="dialog">
          <motion.div
            className="cp-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="cp-center">
            <motion.div
              className="cp-shell"
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 560, damping: 44 }}
            >
              <input
                ref={inputRef}
                className="cp-input mono"
                placeholder="input query • eg: solve x^2 - 4 = 0"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={stopGlobal}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                autocomplete="off"
              />
              <div className="cp-results">{Body}</div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}