import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getTheme, subscribeToTheme } from '../components/theme';
import { loadTurnstile } from './turnstile-loader';
import './turnstile.css';

export default function Turnstile({ siteKey, onVerify, onExpire, resetSignal }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onVerify, onExpire });
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
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
      setState('error');
    };
    const ready = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
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
  const retry = () => { setState('loading'); setAttempt((value) => value + 1); };
  return <div className="luri-turnstile-wrap" aria-label="人机验证">
    <div ref={containerRef} />
    {state === 'loading' && <small role="status">正在加载人机验证…</small>}
    {state === 'error' && <div className="luri-turnstile-error" role="alert"><small>人机验证未完成，请检查网络后重试。</small><button type="button" onClick={retry}>重新加载验证</button></div>}
  </div>;
}
