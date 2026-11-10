import type { CloudPhoto } from '../../../shared/types';

/** Metadata is the removal signal. Never destroy bytes before the server authorizes that removal. */
export async function removeSharedPhoto(familyId: string, photo: CloudPhoto, operations: { removeMetadata(): Promise<void>; removeBytes(): Promise<void> }): Promise<boolean> {
  if (photo.familyId !== familyId) throw new Error('This photo belongs to a different family.');
  await operations.removeMetadata();
  try {
    await operations.removeBytes();
    return true;
  } catch (error) {
    return (error as { code?: string })?.code === 'storage/object-not-found';
  }
}
