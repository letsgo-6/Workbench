import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { materialsApi } from '@/lib/api/materials';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { AppError } from '@/lib/ipc';
import { thumbnails } from '../materials/useMaterialImport';
import { homeBus } from './scene/bus';
import type { HomeEvents } from './scene/events';
export function useHomeDrop(
  active: boolean,
  events: HomeEvents | undefined,
  open: (id: string) => void,
) {
  const [dragging, setDragging] = useState(false),
    dropping = useRef(false);
  const drop = useEffectEvent(async (paths: string[]) => {
    if (!active || dropping.current || !paths.length) return;
    dropping.current = true;
    homeBus.emit({ type: 'saving', nodes: ['material'] });
    try {
      const result = await materialsApi.importFiles(paths);
      if (result.added) {
        void thumbnails(result.materials ?? [result.material]);
        await events?.handle({ type: 'committed', nodes: ['material'] });
        toast.success(t('home.imported', { count: result.added }), {
          action: {
            label: t('capture.view'),
            onClick: () => open(result.material.id),
          },
        });
      } else events?.release(['material']);
    } catch (error) {
      events?.release(['material']);
      toast.error(
        error instanceof AppError && error.code === 'VALIDATION'
          ? t('material.invalidFile')
          : error instanceof Error
            ? error.message
            : t('material.invalidFile'),
      );
    } finally {
      dropping.current = false;
    }
  });
  useEffect(() => {
    let closed = false,
      unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === 'drop') {
          setDragging(false);
          void drop(e.payload.paths);
        } else
          setDragging(e.payload.type === 'enter' || e.payload.type === 'over');
      })
      .then((fn) => {
        if (closed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      closed = true;
      unlisten?.();
    };
  }, []);
  return active && dragging;
}
