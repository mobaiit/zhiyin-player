import { useCallback, useEffect, useRef, useState } from 'react';

const navigationHasFocus = () => document.activeElement?.closest?.('[data-auto-hide-navigation]');

export default function useAutoHideNavigation({ suspended = false, idleMs = 3200, breakpoint = 960 } = {}) {
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef(null);
  const positionsRef = useRef(new WeakMap());

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const canHide = () => media.matches && !suspended;
    const reveal = () => setHidden(false);
    const schedule = () => {
      clearTimer();
      if (!canHide()) return;
      timerRef.current = window.setTimeout(() => {
        if (!navigationHasFocus() && !document.querySelector('[aria-modal="true"]')) setHidden(true);
      }, idleMs);
    };
    const scrollPosition = (target) => {
      if (target === document || target === document.documentElement || target === document.body) return window.scrollY;
      return Number(target?.scrollTop || 0);
    };
    const handleScroll = (event) => {
      if (!canHide()) { reveal(); return; }
      const target = event.target === document ? document : event.target;
      const next = scrollPosition(target);
      const previous = positionsRef.current.get(target) ?? next;
      positionsRef.current.set(target, next);
      if (next > previous + 10 && next > 32) setHidden(true);
      else if (next < previous - 8) reveal();
      schedule();
    };
    const handlePointerMove = (event) => {
      if (event.clientY <= 88) reveal();
      schedule();
    };
    const handleInteraction = () => { reveal(); schedule(); };
    const handleMedia = () => { reveal(); schedule(); };

    if (suspended) reveal();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('focusin', handleInteraction);
    media.addEventListener('change', handleMedia);
    schedule();
    return () => {
      clearTimer();
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('focusin', handleInteraction);
      media.removeEventListener('change', handleMedia);
    };
  }, [breakpoint, clearTimer, idleMs, suspended]);

  return hidden;
}
