import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { materialsApi } from '@/lib/api/materials';
import { AppError } from '@/lib/ipc';
import { t } from '@/i18n';
import { toast } from 'sonner';
import type { MaterialImportResult } from '@/types/bindings/MaterialImportResult';
import type { Material } from '@/types/bindings/Material';
import { makeThumbnail } from './thumbnail';
export function urlFromPaste(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return ['http:', 'https:'].includes(url.protocol) && !/\s/.test(text.trim())
      ? text.trim()
      : null;
  } catch {
    return null;
  }
}
function textTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,[contenteditable="true"],.cm-editor,[role="dialog"],[role="alertdialog"]',
    )
  );
}
function report(error: unknown) {
  toast.error(
    error instanceof AppError && error.code === 'VALIDATION'
      ? t('material.invalidFile')
      : error instanceof Error
        ? error.message
        : t('common.failure'),
  );
}
const thumbnailQueue: Material[] = [];
let makingThumbnails = false;
export async function thumbnails(items: Material[]) {
  thumbnailQueue.push(...items);
  if (makingThumbnails) return;
  makingThumbnails = true;
  try {
    while (thumbnailQueue.length) {
      const item = thumbnailQueue.shift();
      if (!item) continue;
      for (const asset of item.assets) {
        if (asset.thumbPath || asset.missing) continue;
        try {
          const thumb = await makeThumbnail(asset);
          await materialsApi.thumbnail(
            asset.id,
            thumb.blob,
            thumb.width,
            thumb.height,
            thumb.durationMs,
          );
        } catch {
          console.warn('Material thumbnail unavailable');
        }
      }
    }
  } finally {
    makingThumbnails = false;
  }
}
export function useMaterialImport({
  kind,
  materialId,
  onImported,
  onUrl,
}: {
  kind: 'work' | 'component';
  materialId?: string;
  onImported: (id: string) => void;
  onUrl: (url: string) => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const completed = useCallback(
    (result: MaterialImportResult) => {
      onImported(result.material.id);
      toast.success(
        t('material.imported', {
          added: result.added,
          skipped: result.skipped,
        }),
      );
      void thumbnails(result.materials ?? [result.material]);
    },
    [onImported],
  );
  const importPaths = useCallback(
    async (paths: string[], target?: string) => {
      setBusy(true);
      try {
        completed(await materialsApi.importFiles(paths, target, kind));
      } catch (error) {
        report(error);
      } finally {
        setBusy(false);
      }
    },
    [completed, kind],
  );
  const nativeDrop = useEffectEvent(
    (paths: string[], position: { x: number; y: number }) => {
      if (!paths.length) return;
      const over = document.elementFromPoint(
        position.x / window.devicePixelRatio,
        position.y / window.devicePixelRatio,
      );
      const target = over?.closest('[data-material-drawer]')
        ? materialId
        : undefined;
      void importPaths(paths, target);
    },
  );
  const paste = useEffectEvent(async (event: ClipboardEvent) => {
    if (textTarget(event.target) || busy) return;
    const image = Array.from(event.clipboardData?.items ?? [])
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (image) {
      event.preventDefault();
      setBusy(true);
      try {
        const ext =
          (
            {
              'image/png': 'png',
              'image/jpeg': 'jpg',
              'image/webp': 'webp',
              'image/gif': 'gif',
            } as Record<string, string>
          )[image.type] ?? 'invalid';
        completed(
          await materialsApi.importBytes(
            image,
            `clipboard.${ext}`,
            materialId,
            kind,
          ),
        );
      } catch (error) {
        report(error);
      } finally {
        setBusy(false);
      }
      return;
    }
    const url = urlFromPaste(event.clipboardData?.getData('text/plain') ?? '');
    if (url) {
      event.preventDefault();
      try {
        await onUrl(url);
      } catch (error) {
        report(error);
      }
    }
  });
  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      void paste(event);
    };
    window.addEventListener('paste', handler);
    let closed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          setDragging(false);
          nativeDrop(event.payload.paths, event.payload.position);
        } else
          setDragging(
            event.payload.type === 'enter' || event.payload.type === 'over',
          );
      })
      .then((fn) => {
        if (closed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      closed = true;
      unlisten?.();
      window.removeEventListener('paste', handler);
    };
  }, []);
  const choose = async (target?: string) => {
    try {
      const paths = await open({
        multiple: true,
        filters: [
          {
            name: t('material.fileFilter'),
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'],
          },
        ],
      });
      if (paths)
        await importPaths(Array.isArray(paths) ? paths : [paths], target);
    } catch (error) {
      report(error);
    }
  };
  return { busy, dragging, choose };
}
