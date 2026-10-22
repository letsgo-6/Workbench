import { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { materialsApi, assetUrl } from '@/lib/api/materials';
import type { Material } from '@/types/bindings/Material';
import { t } from '@/i18n';
import { useMotionLevel } from './useMotionLevel';
export function moveAsset(ids: string[], id: string, index: number) {
  const next = ids.filter((value) => value !== id);
  next.splice(Math.max(0, index), 0, id);
  return next;
}
export function AssetManager({
  item,
  selected,
  onSelect,
  onAction,
  onAdd,
  onCover,
  onRemoved,
}: {
  item: Material;
  selected?: string;
  onSelect: (id: string) => void;
  onAction: (action: () => Promise<unknown>) => Promise<unknown>;
  onAdd: () => void;
  onCover: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const drag = useRef<string | null>(null);
  const pointerTarget = useRef<number | null>(null);
  const motion = useMotionLevel();
  const [removing, setRemoving] = useState<string | null>(null);
  const run = (operation: () => Promise<unknown>) => {
    void onAction(operation).catch(() => {});
  };
  const reorder = (id: string, index: number) =>
    run(() =>
      materialsApi.reorder(
        item.id,
        moveAsset(
          item.assets.map((a) => a.id),
          id,
          index,
        ),
      ),
    );
  return (
    <section className="asset-manager" aria-label={t('material.addFiles')}>
      <p className="muted">{t('material.orderHint')}</p>
      <div className="asset-strip">
        {item.assets.map((asset, index) => (
          <div
            className={`asset-tile ${asset.id === selected ? 'active' : ''}`}
            key={asset.id}
            data-asset-index={index}
            draggable
            onDragStart={(event) => {
              drag.current = asset.id;
              event.dataTransfer.setData('text/plain', asset.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (drag.current) reorder(drag.current, index);
              drag.current = null;
            }}
          >
            <button
              className="asset-drag-handle"
              aria-label={t('material.dragOrder')}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = asset.id;
                pointerTarget.current = index;
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest('[data-asset-index]');
                if (target)
                  pointerTarget.current = Number(
                    target.getAttribute('data-asset-index'),
                  );
              }}
              onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                event.currentTarget.releasePointerCapture(event.pointerId);
                if (
                  drag.current &&
                  pointerTarget.current !== null &&
                  pointerTarget.current !== index
                )
                  reorder(drag.current, pointerTarget.current);
                drag.current = null;
                pointerTarget.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
                pointerTarget.current = null;
              }}
            >
              <GripVertical />
            </button>
            <button
              className="asset-thumb"
              onClick={() => onSelect(asset.id)}
              title={asset.originalName}
            >
              {!asset.missing &&
              (asset.thumbPath || asset.mediaKind !== 'video') &&
              !(
                asset.mediaKind === 'gif' &&
                motion === 'off' &&
                !asset.thumbPath
              ) ? (
                <img
                  src={assetUrl(asset.thumbPath ?? asset.path)}
                  alt={asset.originalName}
                  loading="lazy"
                />
              ) : (
                <span>
                  {t(
                    asset.missing
                      ? 'material.fileMissing'
                      : asset.mediaKind === 'gif'
                        ? 'material.gif'
                        : 'material.video',
                  )}
                </span>
              )}
            </button>
            {item.coverAssetId === asset.id && (
              <span className="asset-cover-label">{t('material.isCover')}</span>
            )}
            <div className="asset-actions">
              <Button
                size="icon-sm"
                variant="ghost"
                title={t('material.cover')}
                aria-label={t('material.cover')}
                onClick={() =>
                  run(async () => {
                    await materialsApi.cover(item.id, asset.id);
                    onCover(asset.id);
                  })
                }
              >
                <Star />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('material.removeFile')}
                onClick={() => setRemoving(asset.id)}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="asset-order-actions">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={index === 0}
                aria-label={t('material.moveEarlier')}
                onClick={() => reorder(asset.id, index - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={index === item.assets.length - 1}
                aria-label={t('material.moveLater')}
                onClick={() => reorder(asset.id, index + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ))}
        <Button className="asset-add" variant="outline" onClick={onAdd}>
          <Plus />
          {t('material.addFiles')}
        </Button>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t('material.removeConfirm')}
        description={t('material.retainedHint')}
        onConfirm={async () => {
          if (removing) {
            await onAction(async () => {
              await materialsApi.removeAsset(removing);
              onRemoved(removing);
              setRemoving(null);
            });
          }
        }}
      />
    </section>
  );
}
