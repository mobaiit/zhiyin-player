import { useEffect, useRef } from 'react';

const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export function activateOverlayFocus(panel, onClose, trigger) {
  const previousFocus = trigger || document.activeElement;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const targets = () => [...panel.querySelectorAll(focusableSelector)].filter((node) => node.getClientRects().length);
  if (!panel.contains(document.activeElement)) (targets()[0] || panel).focus();
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const items = targets();
    if (!items.length) { event.preventDefault(); panel.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
}

// One focus boundary for drawers, dialogs and mobile navigation. No visual layers.
export default function useOverlayFocus(open, panelRef, onClose, triggerRef) {
  const closeRef = useRef(onClose);
  const initialFocus = useRef(typeof document === 'undefined' ? null : document.activeElement);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !panelRef.current) return undefined;
    return activateOverlayFocus(panelRef.current, () => closeRef.current(), triggerRef?.current || initialFocus.current);
  }, [open, panelRef, triggerRef]);
}
