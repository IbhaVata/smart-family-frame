import { createStore } from '@/app/store';

/** Lets the frame controls (and keyboard) drive whichever slideshow is currently mounted. */
export type SlideshowCommand = 'next' | 'prev';
const listeners = new Set<(cmd: SlideshowCommand) => void>();

export const slideshowBus = {
  emit(cmd: SlideshowCommand): void {
    for (const l of Array.from(listeners)) l(cmd);
  },
  subscribe(fn: (cmd: SlideshowCommand) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const slideshowPausedStore = createStore<boolean>(false);
export function togglePaused(): void {
  slideshowPausedStore.set((p) => !p);
}
export function setPaused(p: boolean): void {
  slideshowPausedStore.set(p);
}
