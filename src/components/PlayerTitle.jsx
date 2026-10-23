import { useEffect, useRef } from 'react';

// Observe real text overflow, including font loading and viewport/view changes.
export function observePlayerTitle(title, text, { ResizeObserver, fonts, eventTarget }) {
  let disposed = false;
  const measure = () => {
    if (disposed) return;
    const distance = Math.max(0, Math.ceil(text.getBoundingClientRect().width - title.clientWidth));
    const moving = title.clientWidth > 0 && distance > 1;
    title.dataset.overflow = String(moving);
    title.style.setProperty('--player-title-offset', `${-distance}px`);
    title.style.setProperty('--player-title-duration', `${Math.max(6, distance / (24 * 0.6) + 3)}s`);
  };
  const observer = ResizeObserver ? new ResizeObserver(measure) : null;
  observer?.observe(title);
  observer?.observe(text);
  eventTarget.addEventListener('resize', measure);
  fonts?.addEventListener?.('loadingdone', measure);
  fonts?.ready?.then(measure);
  measure();
  return () => {
    disposed = true;
    observer?.disconnect();
    eventTarget.removeEventListener('resize', measure);
    fonts?.removeEventListener?.('loadingdone', measure);
  };
}

export default function PlayerTitle({ children }) {
  const titleRef = useRef(null);
  const textRef = useRef(null);
  useEffect(() => observePlayerTitle(titleRef.current, textRef.current, {
    ResizeObserver: window.ResizeObserver,
    fonts: document.fonts,
    eventTarget: window,
  }), [children]);
  return <b key={children} ref={titleRef} className="music-player__title" title={children}><span ref={textRef} className="music-player__title-text">{children}</span></b>;
}
