/** Thin wrappers around the Cloud Functions callables this app uses (functions/src/*.ts). */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

function fn<Req, Res>(name: string) {
  return (data: Req): Promise<Res> => {
    if (!functions) return Promise.reject(new Error('Remote sharing is not configured.'));
    return httpsCallable<Req, Res>(functions, name)(data).then((r) => r.data);
  };
}

export const claimPairingCode = fn<{ code: string; displayName?: string }, { frameId: string; frameName: string; familyId: string; familyName: string }>('claimPairingCode');
export const revokeMember = fn<{ familyId: string; memberUid: string }, { ok: true }>('revokeMember');
export const disconnectFrame = fn<{ frameId: string }, { ok: true }>('disconnectFrame');
export const createPhotoRecord = fn<
  { familyId: string; frameId: string; albumId?: string | null; storagePath: string; filename: string; mimeType: string; size: number; width?: number; height?: number },
  { photoId: string }
>('createPhotoRecord');
export const updateFrameSettings = fn<{ frameId: string; patch: Record<string, unknown> }, { ok: true; appliedKeys: string[] }>('updateFrameSettings');
export const getHouseholdSummary = fn<
  { frameId: string; month: string },
  { month: string; isOwner: boolean; services: Array<{ serviceId: string; serviceName: string; type: string; present: number; leave: number; paidLeave: number; halfDay: number; delivered: number; skipped: number; quantity: number; eligibleDays: number; amount?: number; deduction?: number; dailyRate?: number; lines?: string[]; payment?: { paid: number; remaining: number; status: string } }> }
>('getHouseholdSummary');
