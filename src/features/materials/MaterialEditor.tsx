import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Star, Trash2 } from 'lucide-react';
import { materialsApi } from '@/lib/api/materials';
import { appApi } from '@/lib/api/app';
import { useAutosave } from '@/hooks/useAutosave';
import { useAction } from '../content/hooks';
import { SaveIndicator } from '@/components/common/SaveIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Material } from '@/types/bindings/Material';
import type { MaterialInput } from '@/types/bindings/MaterialInput';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { AssetManager } from './AssetManager';
import { MediaPreview } from './MediaPreview';
import { MaterialTextFields } from './MaterialTextFields';
function editable(item: Material): MaterialInput {
  return {
    kind: item.kind,
    title: item.title,
    url: item.url,
    noteMd: item.noteMd,
    prompt: item.prompt,
    coverAssetId: item.coverAssetId,
    tags: item.tags.map((tag) => tag.name),
  };
}
export function MaterialEditor({
  item,
  fresh,
  focusPrompt,
  onClose,
  onAdd,
}: {
  item: Material;
  fresh: boolean;
  focusPrompt: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const [draft, setDraft] = useState(() => editable(item));
  const [selected, setSelected] = useState<string>();
  const title = useRef<HTMLInputElement>(null);
  const { status, flush, controller } = useAutosave(draft, (value) =>
    materialsApi.update(item.id, value),
  );
  const action = useAction(async (operation: () => Promise<unknown>) => {
    await flush();
    return operation();
  });
  const update = <K extends keyof MaterialInput>(
    key: K,
    value: MaterialInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (fresh) title.current?.focus();
  }, [fresh]);
  useEffect(
    () => () => {
      if (fresh)
        void controller
          .flush()
          .then(() => materialsApi.discardEmpty(item.id))
          .catch((error: Error) => toast.error(error.message));
    },
    [controller, fresh, item.id],
  );
  useEffect(() => {
    if (draft.title.trim() || !draft.url) return;
    let active = true;
    const url = draft.url;
    void appApi
      .linkTitle(url)
      .then((value) => {
        if (active && value)
          setDraft((current) =>
            current.url === url && !current.title.trim()
              ? { ...current, title: value }
              : current,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [draft.title, draft.url]);
  const active =
    item.assets.find((asset) => asset.id === selected) ??
    item.assets.find((asset) => asset.id === draft.coverAssetId) ??
    item.assets[0];
  const move = (direction: number) => {
    const index = item.assets.findIndex((asset) => asset.id === active?.id);
    const asset =
      item.assets[
        (index + direction + item.assets.length) % item.assets.length
      ];
    if (asset) setSelected(asset.id);
  };
  const close = () => {
    void flush()
      .then(onClose)
      .catch((error: Error) => toast.error(error.message));
  };
  const run = (operation: () => Promise<unknown>) => action.mutate(operation);
  return (
    <div
      className="material-editor"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !(
            event.target instanceof Element &&
            event.target.closest('[role="dialog"]')
          )
        ) {
          event.stopPropagation();
          close();
        }
        if (
          !(event.target instanceof Element) ||
          event.target.closest(
            'input,textarea,[contenteditable="true"],video,button',
          )
        )
          return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <header className="material-drawer-header">
        <SaveIndicator status={status} retry={() => run(flush)} />
        <div className="toolbar-actions">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t(item.isStarred ? 'common.unstar' : 'common.star')}
            onClick={() =>
              run(() => materialsApi.star(item.id, !item.isStarred))
            }
          >
            <Star fill={item.isStarred ? 'currentColor' : 'none'} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('common.delete')}
            onClick={() =>
              run(async () => {
                await materialsApi.delete(item.id);
                onClose();
                toast.success(t('common.deleted'), {
                  action: {
                    label: t('common.undo'),
                    onClick: () =>
                      void appApi.restore({
                        entityType: 'material',
                        id: item.id,
                      }),
                  },
                });
              })
            }
          >
            <Trash2 />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('material.close')}
            onClick={close}
          >
            <X />
          </Button>
        </div>
      </header>
      <div className="material-drawer-content">
        <label className="material-field">
          <span>{t('common.title')}</span>
          <Input
            ref={title}
            value={draft.title}
            maxLength={200}
            onChange={(event) => update('title', event.target.value)}
          />
        </label>
        <label className="material-field">
          <span>{t('material.kind')}</span>
          <select
            value={draft.kind}
            onChange={(event) => update('kind', event.target.value)}
          >
            <option value="work">{t('material.work')}</option>
            <option value="component">{t('material.component')}</option>
          </select>
        </label>
        <div className="material-main-preview" tabIndex={0}>
          <MediaPreview key={active?.id ?? 'empty'} asset={active} detail />
          {item.assets.length > 1 && (
            <div className="material-preview-nav">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t('material.previous')}
                onClick={() => move(-1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {Math.max(
                  1,
                  item.assets.findIndex((a) => a.id === active?.id) + 1,
                )}{' '}
                / {item.assets.length}
              </span>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t('material.next')}
                onClick={() => move(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
        <AssetManager
          item={{ ...item, coverAssetId: draft.coverAssetId }}
          selected={active?.id}
          onSelect={setSelected}
          onAction={(operation) => action.mutateAsync(operation)}
          onAdd={onAdd}
          onCover={(id) => update('coverAssetId', id)}
          onRemoved={(id) => {
            if (draft.coverAssetId === id) update('coverAssetId', null);
          }}
        />
        <MaterialTextFields
          item={item}
          draft={draft}
          setDraft={setDraft}
          focusPrompt={focusPrompt}
        />
      </div>
    </div>
  );
}
