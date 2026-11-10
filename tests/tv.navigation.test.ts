import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '../src/tv/navigation';

describe('TV remote navigation', () => {
  const grid = [
    { left: 0, top: 0, width: 100, height: 60 },
    { left: 120, top: 0, width: 100, height: 60 },
    { left: 0, top: 80, width: 100, height: 60 },
    { left: 120, top: 80, width: 100, height: 60 },
  ];
  it('moves across rows and columns using only the remote arrows', () => {
    expect(nextFocusIndex(grid, 0, 'ArrowRight')).toBe(1);
    expect(nextFocusIndex(grid, 1, 'ArrowDown')).toBe(3);
    expect(nextFocusIndex(grid, 3, 'ArrowLeft')).toBe(2);
    expect(nextFocusIndex(grid, 2, 'ArrowUp')).toBe(0);
  });
  it('keeps focus at an edge instead of wrapping into an unrelated action', () => {
    expect(nextFocusIndex(grid, 0, 'ArrowLeft')).toBe(-1);
    expect(nextFocusIndex(grid, 1, 'ArrowUp')).toBe(-1);
    expect(nextFocusIndex(grid, 3, 'ArrowDown')).toBe(-1);
  });
  it('recovers when a focused control has been removed', () => {
    expect(nextFocusIndex(grid, -1, 'ArrowDown')).toBe(0);
    expect(nextFocusIndex([], -1, 'ArrowDown')).toBe(-1);
  });
});
