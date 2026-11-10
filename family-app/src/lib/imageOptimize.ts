/**
 * Resizes an oversized phone photo before upload (V2 build §30). Preserves orientation (via
 * createImageBitmap's built-in EXIF handling in modern browsers) and never upscales a smaller image.
 * Quality is high (0.86) — this optimizes for "avoid unnecessary 10-30 MB uploads", not for squeezing
 * file size at the cost of visible quality on a Full-HD frame.
 */
import { PHOTO_MAX_DIMENSION } from '@shared/types';

export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function optimizeImageForUpload(file: File): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 8 * 1024 * 1024) {
      // Already a reasonably-sized JPEG — skip re-encoding to avoid a needless quality generation loss.
      return { blob: file, width: bitmap.width, height: bitmap.height };
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, width: bitmap.width, height: bitmap.height };
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
    return blob ? { blob, width, height } : { blob: file, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
