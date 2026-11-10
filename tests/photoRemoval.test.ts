import { describe, expect, it, vi } from 'vitest';
import { removeSharedPhoto } from '../family-app/src/lib/removePhoto';
import type { CloudPhoto } from '../shared/types';

const photo = { familyId: 'family', photoId: 'photo' } as CloudPhoto;
describe('phone photo removal authorization order', () => {
  it('never deletes bytes if metadata removal is rejected', async () => {
    const operations = { removeMetadata: vi.fn(async () => { throw new Error('permission-denied'); }), removeBytes: vi.fn() };
    await expect(removeSharedPhoto('family', photo, operations)).rejects.toThrow('permission-denied');
    expect(operations.removeBytes).not.toHaveBeenCalled();
  });
  it('waits for metadata authorization before deleting storage', async () => {
    let finish!: () => void;
    const operations = { removeMetadata: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), removeBytes: vi.fn(async () => {}) };
    const result = removeSharedPhoto('family', photo, operations);
    expect(operations.removeBytes).not.toHaveBeenCalled(); finish();
    await expect(result).resolves.toBe(true);
    expect(operations.removeBytes).toHaveBeenCalledOnce();
  });
  it('reports failed storage cleanup separately from a successful library removal', async () => {
    const operations = { removeMetadata: vi.fn(async () => {}), removeBytes: vi.fn(async () => { throw new Error('Network unavailable'); }) };
    await expect(removeSharedPhoto('family', photo, operations)).resolves.toBe(false);
  });
  it('accepts already-removed storage objects', async () => {
    const operations = { removeMetadata: vi.fn(async () => {}), removeBytes: vi.fn(async () => { throw { code: 'storage/object-not-found' }; }) };
    await expect(removeSharedPhoto('family', photo, operations)).resolves.toBe(true);
  });
  it('rejects a mismatched family before making any requests', async () => {
    const operations = { removeMetadata: vi.fn(), removeBytes: vi.fn() };
    await expect(removeSharedPhoto('other', photo, operations)).rejects.toThrow('different family');
    expect(operations.removeMetadata).not.toHaveBeenCalled();
  });
});
