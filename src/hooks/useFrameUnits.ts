import { useLayoutEffect, useRef } from 'react';

/**
 * Measures the frame container and exposes --fu (1% of width) and --fv (1% of height) as CSS variables,
 * so the frame layouts scale identically in fullscreen (any resolution) and in the small live preview.
 */
export function useFrameUnits<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      el.style.setProperty('--fu', `${w / 100}px`);
      el.style.setProperty('--fv', `${h / 100}px`);
    };
    apply(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}
