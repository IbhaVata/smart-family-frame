import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/app/store';
import { watchRemoteCollection } from '../src/cloud/contentSync';
const mocks = vi.hoisted(() => ({ next: undefined as undefined | ((s: unknown) => void), stop: vi.fn() }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), onSnapshot: (_ref: unknown, next: (s: unknown) => void) => { mocks.next = next; return mocks.stop; } }));

describe('ordered content updates', () => {
  it('finishes an older write before applying the newer update', async () => {
    let finish!: () => void;
    const repo = { put: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    repo.put.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const store = createStore<{ id: string; title: string }[]>([]);
    const stop = await watchRemoteCollection({ db: {} as never, path: 'frames/test/notes', repo, store, label: 'notes', parse: (id, data) => ({ id, title: data.title }) });
    const change = (title: string) => ({ type: 'modified', doc: { id: 'same', data: () => ({ title }) } });
    mocks.next?.({ docChanges: () => [change('old'), change('new')] });
    await vi.waitFor(() => expect(repo.put).toHaveBeenCalledOnce());
    finish();
    await vi.waitFor(() => expect(store.get()).toEqual([{ id: 'same', title: 'new' }]));
    stop();
  });
  it('does not publish an outstanding write to a stopped session', async () => {
    let finish!: () => void;
    const repo = { put: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), remove: vi.fn(async () => {}) };
    const store = createStore<{ id: string }[]>([]);
    const stop = await watchRemoteCollection({ db: {} as never, path: 'frames/test/notes', repo, store, label: 'notes', parse: (id) => ({ id }) });
    mocks.next?.({ docChanges: () => [{ type: 'added', doc: { id: 'old-session', data: () => ({}) } }] });
    await vi.waitFor(() => expect(repo.put).toHaveBeenCalledOnce());
    stop(); finish(); await Promise.resolve(); await Promise.resolve();
    expect(store.get()).toEqual([]);
  });
});
