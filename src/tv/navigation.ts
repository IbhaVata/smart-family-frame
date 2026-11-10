export type Direction = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
interface Rect { left: number; top: number; width: number; height: number }
/** Prefer candidates in the same row/column, then the nearest candidate in the requested direction. */
export function nextFocusIndex(rects: Rect[], current: number, direction: Direction): number {
  const from = rects[current];
  if (!from) return rects.length ? 0 : -1;
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best = -1;
  let score = Infinity;
  rects.forEach((r, i) => {
    if (i === current) return;
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const forward = (horizontal ? dx : dy) * sign;
    if (forward <= 1) return;
    const across = Math.abs(horizontal ? dy : dx);
    const candidate = forward + across * 4;
    if (candidate < score) { score = candidate; best = i; }
  });
  return best;
}
export function moveTvFocus(root: HTMLElement, direction: Direction): void {
  const dialogs = root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const scope = dialogs[dialogs.length - 1] ?? root;
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
    .filter((el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]'));
  const current = buttons.indexOf(document.activeElement as HTMLElement);
  const next = nextFocusIndex(buttons.map((b) => b.getBoundingClientRect()), current, direction);
  if (next >= 0) buttons[next]?.focus();
}
