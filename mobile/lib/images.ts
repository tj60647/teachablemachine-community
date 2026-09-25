export type CameraSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;
export function squareCanvas(
  source: CameraSource,
  size = 224,
  flip = false,
): HTMLCanvasElement {
  const video = source as HTMLVideoElement;
  const img = source as HTMLImageElement;
  const width = video.videoWidth || img.naturalWidth || source.width;
  const height = video.videoHeight || img.naturalHeight || source.height;
  if (!width || !height)
    throw new Error('The camera is still starting. Try again in a moment.');
  const side = Math.min(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Image processing is unavailable in this browser.');
  if (flip) {
    context.translate(size, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    source,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  return canvas;
}
export function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          'This image could not be opened. Try a JPG, PNG, or WebP image.',
        ),
      );
    image.src = url;
  });
}
export async function importImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type))
    throw new Error('Use JPG, PNG, WebP, GIF, or BMP images.');
  if (file.size > 25 * 1024 * 1024)
    throw new Error('Choose images smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    return squareCanvas(await decodeImage(url)).toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}
