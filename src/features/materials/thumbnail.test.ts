import { it, expect, vi, afterEach } from 'vitest';
import { makeThumbnail } from './thumbnail';
import type { MaterialAsset } from '@/types/bindings/MaterialAsset';
vi.mock('@/lib/api/materials', () => ({ assetUrl: (path: string) => path }));
const asset: MaterialAsset = {
  id: 'a',
  mediaKind: 'image',
  mime: 'image/png',
  originalName: 'image.png',
  sizeBytes: 100,
  width: null,
  height: null,
  durationMs: null,
  path: 'owned.png',
  thumbPath: null,
  missing: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('draws an image at 480px and encodes WebP at quality 0.82', async () => {
  class ImageMock extends EventTarget {
    crossOrigin = '';
    naturalWidth = 1920;
    naturalHeight = 1080;
    set src(_value: string) {
      queueMicrotask(() => this.dispatchEvent(new Event('load')));
    }
    removeAttribute() {}
  }
  vi.stubGlobal('Image', ImageMock);
  const canvas = document.createElement('canvas');
  const draw = vi.fn();
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  const blob = new Blob(['RIFF1234WEBP'], { type: 'image/webp' });
  const encode = vi
    .spyOn(canvas, 'toBlob')
    .mockImplementation((callback) => callback(blob));
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) =>
    tag === 'canvas' ? canvas : create(tag),
  );
  const result = await makeThumbnail(asset);
  expect([canvas.width, canvas.height]).toEqual([480, 270]);
  expect(result.width).toBe(1920);
  expect(result.height).toBe(1080);
  expect(draw).toHaveBeenCalledOnce();
  expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
});
it('seeks to min(1 second, 10 percent duration), reads dimensions and releases video', async () => {
  const video = document.createElement('video');
  let sought = 0;
  Object.defineProperties(video, {
    src: {
      set: () =>
        queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
    duration: { value: 5 },
    currentTime: {
      get: () => sought,
      set: (value: number) => {
        sought = value;
        queueMicrotask(() => video.dispatchEvent(new Event('seeked')));
      },
    },
  });
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(video, 'load').mockImplementation(() => {});
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['webp'])),
  );
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) =>
    tag === 'video' ? video : tag === 'canvas' ? canvas : create(tag),
  );
  const result = await makeThumbnail({ ...asset, mediaKind: 'video' });
  expect(sought).toBe(0.5);
  expect(result.durationMs).toBe(5000);
  expect([result.width, result.height]).toEqual([1280, 720]);
  expect(pause).toHaveBeenCalled();
  expect(load).toHaveBeenCalled();
});
