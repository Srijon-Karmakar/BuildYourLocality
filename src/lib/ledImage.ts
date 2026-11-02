import { LED_MAX_IMAGE_CHARS } from '../city/catalog';

/** Longest side, in pixels, a picture is shrunk to. LED screens are coarse, so small pictures lose nothing. */
const SIDES = [128, 96, 64, 48];

/**
 * Turns a picture chosen by the player into a small data URL that can live inside the saved world.
 * Resolves to the URL, or an error message when the file is not a usable picture.
 */
export async function pictureForLed(file: File): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'That file is not a picture.' };
  if (file.size > 12 * 1024 * 1024) return { error: 'That picture is too large (12 MB at most).' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: 'That picture could not be opened.' };
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'This browser cannot resize pictures.' };

  for (const side of SIDES) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Flat art stays crisp as PNG; photographs are far smaller as JPEG.
    for (const url of [canvas.toDataURL('image/png'), canvas.toDataURL('image/jpeg', 0.78)]) {
      if (url.length <= LED_MAX_IMAGE_CHARS) {
        bitmap.close();
        return { url };
      }
    }
  }
  bitmap.close();
  return { error: 'That picture is too detailed to keep. Try a simpler one.' };
}
