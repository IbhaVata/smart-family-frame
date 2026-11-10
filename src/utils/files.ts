export const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function mimeFromExtension(ext: string): string | null {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return null;
  }
}

export interface FileValidation {
  ok: boolean;
  mimeType: string;
  reason?: string;
}

/** Accepts JPG/JPEG/PNG/WEBP by MIME type, falling back to the extension when the browser reports none. */
export function validatePhotoFile(file: { name: string; type: string; size: number }): FileValidation {
  const ext = extensionOf(file.name);
  let mime = (file.type || '').toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mime)) {
    const fromExt = mimeFromExtension(ext);
    if (fromExt && (mime === '' || mime === 'application/octet-stream')) mime = fromExt;
  }
  if (!SUPPORTED_IMAGE_TYPES.has(mime)) {
    return { ok: false, mimeType: mime, reason: `"${file.name}" is not a supported image. Use JPG, PNG or WEBP.` };
  }
  if (file.size <= 0) return { ok: false, mimeType: mime, reason: `"${file.name}" is empty.` };
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, mimeType: mime, reason: `"${file.name}" is larger than 40 MB.` };
  }
  return { ok: true, mimeType: mime };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
