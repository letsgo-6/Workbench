import type { MaterialAsset } from '@/types/bindings/MaterialAsset';
import { assetUrl } from '@/lib/api/materials';
export function thumbnailSize(width: number, height: number) {
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height))
    throw Error('Invalid dimensions');
  const scale = Math.min(1, 480 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
function event(
  target: HTMLImageElement | HTMLVideoElement,
  success: 'load' | 'loadedmetadata' | 'loadeddata' | 'seeked',
  start: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(Error('Media load timeout')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      target.removeEventListener(success, loaded);
      target.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(Error('Media decode failed'));
    target.addEventListener(success, loaded, { once: true });
    target.addEventListener('error', failed, { once: true });
    start();
  });
}
export async function makeThumbnail(asset: MaterialAsset) {
  const video =
    asset.mediaKind === 'video' ? document.createElement('video') : null;
  const image = video ? null : new Image();
  const source = video ?? image;
  if (!source) throw Error('No media source');
  source.crossOrigin = 'anonymous';
  try {
    await event(source, video ? 'loadedmetadata' : 'load', () => {
      source.src = assetUrl(asset.path);
    });
    const width = video ? video.videoWidth : (image?.naturalWidth ?? 0);
    const height = video ? video.videoHeight : (image?.naturalHeight ?? 0);
    const duration =
      video && Number.isFinite(video.duration) ? video.duration : undefined;
    if (video) {
      const seek = Math.min(1, (duration ?? 0) * 0.1);
      if (seek > 0)
        await event(video, 'seeked', () => {
          video.currentTime = seek;
        });
      else if (video.readyState < 2)
        await event(video, 'loadeddata', () => video.load());
    }
    const size = thumbnailSize(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Canvas unavailable');
    context.drawImage(source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(Error('WebP encode failed')),
        'image/webp',
        0.82,
      ),
    );
    return {
      blob,
      width,
      height,
      durationMs:
        duration === undefined ? undefined : Math.round(duration * 1000),
    };
  } finally {
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } else source.removeAttribute('src');
  }
}
