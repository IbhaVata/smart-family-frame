import { describe, it, expect, vi } from 'vitest';

describe('memory fallback when IndexedDB is unavailable', () => {
  it('keeps the app usable and reports the problem', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.resetModules();
    const backendMod = await import('@/storage/backend');
    const repos = await import('@/storage/repositories');
    const r = await backendMod.initBackend();
    expect(r.backend.kind).toBe('memory');
    expect(r.error).toMatch(/IndexedDB is not available/);
    await repos.noteRepo.put({ id: 'n', title: 't', message: 'm', pinned: false, createdAt: 1, updatedAt: 1 });
    expect((await repos.noteRepo.list()).length).toBe(1);
    await repos.photoRepo.add({ id: 'p', filename: 'p.png', mimeType: 'image/png', createdAt: 1, favorite: false, size: 1 }, new Blob(['x']), null);
    expect((await repos.photoRepo.getBlob('p'))).not.toBeNull();
    await repos.restoreContent({ settings: await repos.settingsRepo.load(), events: [], notes: [], reminders: [], schedules: [] });
    expect((await repos.noteRepo.list()).length).toBe(0);
    vi.unstubAllGlobals();
  });
});
