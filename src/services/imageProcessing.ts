/** Decodes an image file, reads its dimensions and produces a small thumbnail. Browser-only. */

export interface DecodedImage {
  width: number;
  height: number;
  thumbnail: Blob | null;
}

const THUMB_MAX = 360;

async function decodeWithBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function decodeWithImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be decoded.'));
    };
    img.src = url;
  });
}

function makeThumbnail(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
}

/** Throws if the file is not a decodable image (corrupted or unsupported). */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await decodeWithBitmap(blob);
      try {
        const thumbnail = await makeThumbnail(bmp, bmp.width, bmp.height);
        return { width: bmp.width, height: bmp.height, thumbnail };
      } finally {
        bmp.close();
      }
    } catch {
      // fall through to <img> decoding (some browsers reject certain encodings in createImageBitmap)
    }
  }
  const img = await decodeWithImageElement(blob);
  const thumbnail = await makeThumbnail(img, img.naturalWidth, img.naturalHeight);
  return { width: img.naturalWidth, height: img.naturalHeight, thumbnail };
}
