import { Images, Plus, Upload, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState, Failure, Loading } from '@/components/common/Feedback';
import { BulkTagsDialog } from '../content/BulkTagsDialog';
import { appApi } from '@/lib/api/app';
import { flushAll } from '@/hooks/useAutosave';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { WorksMasonry } from './WorksMasonry';
import { ComponentGrid } from './ComponentGrid';
import { MaterialDrawer } from './MaterialDrawer';
import { PromptDialog } from './PromptDialog';
import { useMaterialLibrary } from './useMaterialLibrary';
export function MaterialPage() {
  const {
    id,
    kind,
    tab,
    filter,
    setFilter,
    q,
    tag,
    setTag,
    starred,
    setStarred,
    prompt,
    setPrompt,
    bulkTags,
    setBulkTags,
    selection,
    setSelection,
    motion,
    scroll,
    sentinel,
    tags,
    works,
    components,
    list,
    search,
    items,
    action,
    open,
    create,
    importer,
    nextPage,
    fresh,
    close,
    refs,
    error,
    pending,
    cardActions,
    location,
    navigate,
  } = useMaterialLibrary();
  return (
    <div className="material-page" data-motion={motion}>
      <header className="material-page-header">
        <div>
          <h1>{t('material.title')}</h1>
          <p className="muted">{t('material.subtitle')}</p>
        </div>
        <div className="toolbar-actions">
          <Button
            variant="outline"
            disabled={importer.busy}
            onClick={() => void importer.choose()}
          >
            <Upload />
            {t('material.importFiles')}
          </Button>
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(() => create())}
          >
            <Plus />
            {t(kind === 'work' ? 'material.addWork' : 'material.addComponent')}
          </Button>
        </div>
      </header>
      <div className="material-toolbar">
        <ToggleGroup
          type="single"
          value={tab}
          onValueChange={(value) => {
            if (value)
              void flushAll()
                .then(() => navigate(`/materials?tab=${value}`))
                .catch((error: Error) => toast.error(error.message));
          }}
          aria-label={t('material.kind')}
        >
          <ToggleGroupItem value="works">
            {t('material.worksCount', {
              count: works.isPending ? '…' : (works.data?.total ?? 0),
            })}
          </ToggleGroupItem>
          <ToggleGroupItem value="components">
            {t('material.componentsCount', {
              count: components.isPending ? '…' : (components.data?.total ?? 0),
            })}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="material-filter">
          <Search />
          <Input
            id="list-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('material.filter')}
            aria-label={t('material.filter')}
          />
        </div>
        <select
          aria-label={t('common.tags')}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {tags.data?.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name}
            </option>
          ))}
        </select>
        <label className="material-star-filter">
          <input
            type="checkbox"
            checked={starred}
            onChange={(event) => setStarred(event.target.checked)}
          />
          {t('common.starred')}
        </label>
      </div>
      {!!selection.length && (
        <div className="material-batch">
          <span>{t('common.selected', { count: selection.length })}</span>
          <Button size="sm" variant="outline" onClick={() => setBulkTags([])}>
            {t('common.bulkTag')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              action.mutate(async () => {
                await appApi.bulkDelete(refs);
                setSelection([]);
                if (id && selection.includes(id)) close();
                toast.success(t('common.deleted'), {
                  action: {
                    label: t('common.undo'),
                    onClick: () =>
                      void Promise.all(refs.map((ref) => appApi.restore(ref))),
                  },
                });
              })
            }
          >
            {t('common.delete')}
          </Button>
        </div>
      )}
      <div className="material-page-body">
        <main className="material-gallery" ref={scroll}>
          <button
            className="material-drop-hint"
            disabled={importer.busy}
            onClick={() => void importer.choose()}
          >
            <Images />
            {t(importer.busy ? 'material.importing' : 'material.dropHint')}
          </button>
          {error ? (
            <Failure
              error={error}
              retry={() => {
                if (q) void search.refetch();
                else void list.refetch();
              }}
            />
          ) : pending ? (
            <Loading />
          ) : !items.length ? (
            <div className="filtered-empty">
              <EmptyState
                title={t(
                  q || tag || starred
                    ? 'material.noMatches'
                    : kind === 'work'
                      ? 'material.emptyWorks'
                      : 'material.emptyComponents',
                )}
                description={t(
                  q || tag || starred
                    ? 'common.noMatchesHint'
                    : 'material.emptyHint',
                )}
              />
              {(q || tag || starred) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('');
                    setTag('');
                    setStarred(false);
                  }}
                >
                  {t('common.clearFilters')}
                </Button>
              )}
            </div>
          ) : kind === 'work' ? (
            <WorksMasonry items={items} {...cardActions} />
          ) : (
            <ComponentGrid
              items={items}
              {...cardActions}
              onPrompt={(item) => {
                if (item.prompt.trim()) setPrompt(item);
                else void open(item.id, false, true);
              }}
            />
          )}
          <div ref={sentinel} className="material-page-sentinel">
            {list.isFetchingNextPage && t('app.loading')}
            {!q && list.hasNextPage && (
              <Button variant="ghost" onClick={() => nextPage()}>
                {t('common.loadMore')}
              </Button>
            )}
          </div>
        </main>
        {id && (
          <MaterialDrawer
            id={id}
            fresh={fresh}
            focusPrompt={
              (location.state as { focusPrompt?: boolean } | null)
                ?.focusPrompt === true
            }
            onClose={close}
            onAdd={() => void importer.choose(id)}
          />
        )}
      </div>
      {importer.dragging && (
        <div className="material-drop-overlay">
          <Images />
          <strong>{t('material.dropping')}</strong>
        </div>
      )}
      {prompt && (
        <PromptDialog
          item={prompt}
          onClose={() => setPrompt(null)}
          onEdit={() => {
            void open(prompt.id, false, true);
            setPrompt(null);
          }}
        />
      )}
      <BulkTagsDialog
        tags={bulkTags}
        setTags={setBulkTags}
        busy={action.isPending}
        confirm={() =>
          action.mutate(async () => {
            await appApi.bulkTags(refs, bulkTags ?? []);
            setBulkTags(null);
            setSelection([]);
          })
        }
      />
    </div>
  );
}
