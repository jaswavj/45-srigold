export async function compressImage(file: File, maxDim = 1280, maxBytes = 350_000): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Select an image file');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not compress image');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.82;
  let blob: Blob | null = null;
  while (quality >= 0.4) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= maxBytes) break;
    quality -= 0.12;
  }
  if (!blob) {
    throw new Error('Could not compress image');
  }
  const base = (file.name || 'item').replace(/\.[^.]+$/, '') || 'item';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
