export const AVATAR_PICK_LIMIT = 10 * 1024 * 1024;
export const AVATAR_UPLOAD_LIMIT = 262144;
export const AVATAR_TOO_LARGE = 'Choose an image under 10 MB.';
export const AVATAR_PREPARED_TOO_LARGE = 'The prepared image must be 256 KiB or smaller.';
export const AVATAR_PREPARE_FAILED = 'Could not prepare the image.';
export const AVATAR_NEEDS_LIVE = 'Avatar upload needs the live app.';

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), type));
}

/** Center-crop to 256×256. The returned blob is the only thing that may be uploaded. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (file.size > AVATAR_PICK_LIMIT) throw new Error(AVATAR_TOO_LARGE);
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(AVATAR_PREPARE_FAILED);
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, 256, 256);
    const webp = await canvasBlob(canvas, 'image/webp');
    const output = webp && webp.type === 'image/webp' ? webp : await canvasBlob(canvas, 'image/png');
    if (!output || (output.type !== 'image/webp' && output.type !== 'image/png')) throw new Error(AVATAR_PREPARE_FAILED);
    if (output.size > AVATAR_UPLOAD_LIMIT) throw new Error(AVATAR_PREPARED_TOO_LARGE);
    return output;
  } finally {
    bitmap.close?.();
  }
}

/** Prepare first, then hand the canvas blob to the caller. Never forwards the original File. */
export async function uploadAvatarFile<T>(file: File, upload: (blob: Blob) => Promise<T>): Promise<T> {
  const blob = await prepareAvatar(file);
  return upload(blob);
}
