import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getTheme, subscribeToTheme } from '../components/theme';
import { loadTurnstile } from './turnstile-loader';
import './turnstile.css';

// A failed check reloads itself after 2, 4, 8 and 16 seconds, then every 30 seconds, until it passes.
export const retryDelay = (failures) => Math.min(30000, 2000 * 2 ** Math.max(0, Math.min(failures - 1, 4)));

export default function Turnstile({ siteKey, onVerify, onExpire, resetSignal }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onVerify, onExpire });
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [failures, setFailures] = useState(0);
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => 'dark');
  useEffect(() => { callbacksRef.current = { onVerify, onExpire }; }, [onVerify, onExpire]);
  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    let api;
    let timer;
    callbacksRef.current.onVerify('');
    const fail = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      callbacksRef.current.onVerify('');
      setFailures((value) => value + 1);
      setState('error');
    };
    const ready = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setFailures(0);
      setState('ready');
    };
    loadTurnstile().then((loaded) => {
      if (cancelled || !containerRef.current) return;
      api = loaded;
      timer = window.setTimeout(fail, 15000);
      widgetIdRef.current = api.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size: 'flexible',
        appearance: 'always',
        callback: (token) => { if (!cancelled) { callbacksRef.current.onVerify(token); ready(); } },
        'before-interactive-callback': ready,
        'after-interactive-callback': ready,
        'error-callback': fail,
        'timeout-callback': fail,
        'unsupported-callback': fail,
        'expired-callback': () => { if (!cancelled) { callbacksRef.current.onVerify(''); callbacksRef.current.onExpire?.(); } },
      });
    }).catch(fail);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (widgetIdRef.current !== null && api) api.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey, theme, attempt]);
  useEffect(() => {
    if (resetSignal === undefined) return;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    callbacksRef.current.onVerify('');
  }, [resetSignal]);
  useEffect(() => {
    if (state !== 'error') return undefined;
    const timer = window.setTimeout(() => { setState('loading'); setAttempt((value) => value + 1); }, retryDelay(failures));
    return () => window.clearTimeout(timer);
  }, [state, failures]);
  return <div className="luri-turnstile-wrap" aria-label="人机验证">
    <div ref={containerRef} />
    {state === 'error' && <div className="luri-turnstile-error" role="status"><small>人机验证加载失败，正在自动重试…</small></div>}
  </div>;
}
