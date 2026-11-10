import { describe, it, expect, vi, beforeEach } from 'vitest';

const blobs = new Map<string, Blob>();
vi.mock('@/storage/repositories', () => ({
  photoRepo: {
    getBlob: vi.fn(async (id: string) => blobs.get(id) ?? null),
    getThumbnail: vi.fn(async (id: string) => (blobs.has(id) ? new Blob(['thumb-' + id]) : null)),
  },
}));

let created = 0;
let revoked = 0;
const live = new Set<string>();
beforeEach(() => {
  created = 0;
  revoked = 0;
  live.clear();
  blobs.clear();
  blobs.set('a', new Blob(['aaa']));
  blobs.set('b', new Blob(['bbb']));
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    created++;
    const u = `blob:mock/${created}/${(b as Blob).size}`;
    live.add(u);
    return u;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
    revoked++;
    live.delete(u);
  });
});

describe('object URL cache', () => {
  it('shares one URL between concurrent users and revokes only when the last one releases', async () => {
    const { acquirePhotoUrl, releasePhotoUrl } = await import('@/services/photoService');
    const [u1, u2] = await Promise.all([acquirePhotoUrl('a'), acquirePhotoUrl('a')]);
    expect(u1).toBe(u2);
    expect(created).toBe(1);
    releasePhotoUrl('a');
    expect(revoked).toBe(0);
    releasePhotoUrl('a');
    expect(revoked).toBe(1);
    expect(live.size).toBe(0);
  });
  it('StrictMode pattern (acquire, release, acquire) leaves exactly one live URL that is revoked on release', async () => {
    const { acquirePhotoUrl, releasePhotoUrl } = await import('@/services/photoService');
    const p1 = acquirePhotoUrl('b');
    releasePhotoUrl('b');
    const p2 = acquirePhotoUrl('b');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBeNull(); // released before it finished loading
    expect(r2).toMatch(/^blob:/);
    expect(live.size).toBe(1);
    releasePhotoUrl('b');
    expect(live.size).toBe(0);
  });
  it('a missing blob yields null without creating a URL; re-acquire after deletion works', async () => {
    const { acquirePhotoUrl, releasePhotoUrl } = await import('@/services/photoService');
    expect(await acquirePhotoUrl('missing')).toBeNull();
    expect(created).toBe(0);
    releasePhotoUrl('missing'); // no-op
    const u = await acquirePhotoUrl('a');
    expect(u).toMatch(/^blob:/);
    releasePhotoUrl('a');
    expect(live.size).toBe(0);
  });
  it('thumbnails use their own cache and fall back to the full blob', async () => {
    const { acquireThumbUrl, releaseThumbUrl, revokeAllPhotoUrls, acquirePhotoUrl } = await import('@/services/photoService');
    const t = await acquireThumbUrl('a');
    const f = await acquirePhotoUrl('a');
    expect(t).not.toBe(f);
    expect(live.size).toBe(2);
    releaseThumbUrl('a');
    expect(live.size).toBe(1);
    revokeAllPhotoUrls();
    expect(live.size).toBe(0);
  });
  it('1000 acquire/release cycles never accumulate URLs', async () => {
    const { acquirePhotoUrl, releasePhotoUrl } = await import('@/services/photoService');
    for (let i = 0; i < 1000; i++) {
      const id = i % 2 ? 'a' : 'b';
      await acquirePhotoUrl(id);
      releasePhotoUrl(id);
    }
    expect(live.size).toBe(0);
    expect(created).toBe(1000);
    expect(revoked).toBe(1000);
  });
});
