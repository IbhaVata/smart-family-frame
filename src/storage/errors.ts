export type StorageErrorKind = 'quota' | 'unavailable' | 'not-found' | 'unknown';

export class StorageError extends Error {
  kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export function toStorageError(e: unknown, context = 'Storage'): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = (e as { message?: string } | null)?.message ?? String(e);
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) {
    return new StorageError('quota', 'The frame is out of storage space. Delete some photos and try again.', e);
  }
  if (name === 'InvalidStateError' || name === 'UnknownError' || /blocked|closing|not available|unavailable/i.test(msg)) {
    return new StorageError('unavailable', `${context} is not available right now (${msg}).`, e);
  }
  return new StorageError('unknown', `${context} failed: ${msg}`, e);
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
