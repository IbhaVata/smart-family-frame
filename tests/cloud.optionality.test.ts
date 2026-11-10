import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';

describe('V2 cloud optionality', () => {
  beforeEach(async () => {
    const { resetCloudConfigCacheForTests } = await import('@/cloud/env');
    resetCloudConfigCacheForTests();
  });

  it('getCloudConfig() returns null when no Firebase env vars are set (the default state)', async () => {
    const { getCloudConfig, isCloudConfigured } = await import('@/cloud/env');
    expect(getCloudConfig()).toBeNull();
    expect(isCloudConfigured()).toBe(false);
  });

  it('getCloudServices() resolves to null instead of throwing when unconfigured', async () => {
    const { getCloudServices, resetCloudServicesForTests } = await import('@/cloud/firebaseApp');
    resetCloudServicesForTests();
    await expect(getCloudServices()).resolves.toBeNull();
  });

  it('startSyncEngine() never throws when unconfigured and sets status to not_configured', async () => {
    const { startSyncEngine } = await import('@/cloud/syncEngine');
    const { remoteSharingStore } = await import('@/app/stores');
    await expect(startSyncEngine()).resolves.toBeUndefined();
    expect(remoteSharingStore.get().status).toBe('not_configured');
  });

  it('getFrameIdentity() generates and persists a stable FRAME-XXXXXX id using only local storage', async () => {
    const { initBackend } = await import('@/storage/backend');
    await initBackend();
    const { getFrameIdentity, resetFrameIdentityCacheForTests } = await import('@/cloud/frameIdentity');
    resetFrameIdentityCacheForTests();
    const first = await getFrameIdentity();
    expect(first.frameId).toMatch(/^FRAME-[A-Z2-9]{6}$/);
    expect(first.familyId).toBeNull();
    resetFrameIdentityCacheForTests();
    const second = await getFrameIdentity();
    expect(second.frameId).toBe(first.frameId); // stable across "restarts" (cache reset simulates a reload)
  });

  it('ensureDeviceAuth() resolves to null instead of throwing when cloud is not configured', async () => {
    const { ensureDeviceAuth } = await import('@/cloud/frameIdentity');
    await expect(ensureDeviceAuth()).resolves.toBeNull();
  });
});
