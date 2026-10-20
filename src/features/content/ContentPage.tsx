import { useCallback, useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { ThreePane } from '@/app/layout/ThreePane';
import { EmptyState, Failure, Loading } from '@/components/common/Feedback';
import { appApi, desktop } from '@/lib/api/app';
import {
  contentApi,
  routes,
  titleOf,
  bodyOf,
  type Entry,
} from '@/lib/api/content';
import { flushAll } from '@/hooks/useAutosave';
import { useUi } from '@/stores/ui';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { toast } from 'sonner';
import { toInput, emptyDraft } from './draft';
import { useContentList, useAction } from './hooks';
import { ContentDetail } from './ContentDetail';
import { ContentList } from './ContentList';
import { ContentHeader, type ContentFilters } from './ContentHeader';
import { ContentMenu } from './ContentMenu';
import { BulkTagsDialog } from './BulkTagsDialog';
import { ContentTools } from './ContentTools';
export function ContentPage({ kind }: { kind: EntityType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<ContentFilters>({
    q: '',
    tag: '',
    starred: false,
    tool: '',
    category: '',
    cards: false,
    grouped: false,
  });
  const { q, tag, starred, tool, category, cards, grouped } = filters;
  function setFilter<K extends keyof ContentFilters>(
    key: K,
    value: ContentFilters[K],
  ) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  const [context, setContext] = useState<{
    item: Entry;
    x: number;
    y: number;
  } | null>(null);
  const [bulkTags, setBulkTags] = useState<string[] | null>(null);
  const selection = useUi((s) => s.selection);
  const setSelection = useUi((s) => s.setSelection);
  const query = useContentList(kind, {
    tag: tag || null,
    starredOnly: starred,
    tool: tool || null,
    category: category || null,
    view: params.get('view') ?? 'all',
    dateFrom: kind === 'idea' ? params.get('date') || null : null,
    dateTo: kind === 'idea' ? params.get('date') || null : null,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = items.filter(
    (item) =>
      !q ||
      `${titleOf(item)} ${bodyOf(item)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const action = useAction(async (run: () => Promise<unknown>) => {
    await flushAll();
    return run();
  });
  const select = useCallback(
    (id: string, fresh = false) => {
      void flushAll()
        .then(() =>
          navigate(`/${routes[kind]}/${id}${location.search}`, {
            state: { fresh },
          }),
        )
        .catch((error: Error) => toast.error(error.message));
    },
    [kind, location.search, navigate],
  );
  const create = useCallback(async () => {
    await flushAll();
    const item = await contentApi(kind).create(toInput(kind, emptyDraft(kind)));
    select(item.id, true);
  }, [kind, select]);
  const importFile = useCallback(
    async (path: string) => {
      const read = await appApi.readSkill(path);
      const draft = {
        ...emptyDraft('skill'),
        title: read.parsed.name ?? '',
        description: read.parsed.description ?? '',
        body: read.content,
      };
      const item = await contentApi('skill').create(toInput('skill', draft));
      select(item.id);
      toast.success(t('common.importDone'));
    },
    [select],
  );
  useEffect(() => {
    const handler = () => {
      void create().catch((error: Error) => toast.error(error.message));
    };
    window.addEventListener('new-item', handler);
    return () => window.removeEventListener('new-item', handler);
  }, [create]);
  useEffect(() => {
    if (kind !== 'skill') return;
    const unlisten = desktop.onDrop((paths) => {
      const path = paths.find((p) => /\.md$/i.test(p));
      if (path)
        void importFile(path).catch((error: Error) =>
          toast.error(error.message),
        );
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [kind, importFile]);
  useEffect(() => {
    setSelection([]);
    return () => setSelection([]);
  }, [kind, setSelection]);
  useEffect(() => {
    if (q && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [q, hasNextPage, isFetchingNextPage, fetchNextPage]);
  useEffect(() => {
    const clear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection([]);
        setContext(null);
      }
    };
    window.addEventListener('keydown', clear);
    return () => window.removeEventListener('keydown', clear);
  }, [setSelection]);
  async function remove(itemId: string) {
    await contentApi(kind).delete(itemId);
    if (itemId === id) void navigate(`/${routes[kind]}`);
    toast(t('common.deleted'), {
      action: {
        label: t('common.undo'),
        onClick: () => {
          void appApi.restore({ entityType: kind, id: itemId });
        },
      },
    });
  }
  const fetchNext = useCallback(() => {
    if (!isFetchingNextPage) void fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage]);
  return (
    <>
      <ThreePane
        list={
          <>
            <ContentHeader
              kind={kind}
              total={query.data?.pages[0]?.total ?? 0}
              filters={filters}
              setFilter={setFilter}
              view={params.get('view') ?? 'all'}
              onView={(view) => setParams({ view })}
              onCreate={() => action.mutate(create)}
              onImport={() =>
                action.mutate(async () => {
                  const path = await desktop.importMd();
                  if (typeof path === 'string') await importFile(path);
                })
              }
              tools={items.flatMap((i) => ('tools' in i ? i.tools : []))}
              selectionCount={selection.length}
              onBulkTags={() => setBulkTags([])}
              onBulkDelete={() =>
                action.mutate(async () => {
                  await appApi.bulkDelete(
                    selection.map((id) => ({ entityType: kind, id })),
                  );
                  setSelection([]);
                })
              }
            />
            <ContentTools
              kind={kind}
              date={params.get('date') ?? ''}
              onDate={(date) =>
                setParams((p) => {
                  if (date) p.set('date', date);
                  else p.delete('date');
                  return p;
                })
              }
            />
            {query.isPending ? (
              <Loading />
            ) : query.error ? (
              <Failure error={query.error} retry={() => void query.refetch()} />
            ) : !filtered.length ? (
              <EmptyState onCreate={() => action.mutate(create)} />
            ) : (
              <ContentList
                kind={kind}
                items={filtered}
                onDelete={(id) => action.mutate(() => remove(id))}
                selectedId={id}
                onSelect={select}
                cards={cards}
                grouped={grouped}
                hasNext={Boolean(hasNextPage)}
                fetchNext={fetchNext}
                onContext={(item, x, y) => setContext({ item, x, y })}
              />
            )}
            <footer className="list-footer">{t('common.bulkHint')}</footer>
          </>
        }
        detail={
          !id ? (
            <EmptyState
              title={t('common.select')}
              description={t('common.selectHint')}
            />
          ) : (
            <ContentDetail
              key={id}
              kind={kind}
              id={id}
              fresh={Boolean(
                location.state &&
                typeof location.state === 'object' &&
                'fresh' in location.state &&
                location.state.fresh,
              )}
              onDelete={() => action.mutate(() => remove(id))}
            />
          )
        }
      />
      {context && (
        <ContentMenu
          kind={kind}
          context={context}
          onClose={() => setContext(null)}
          run={(run) => action.mutate(run)}
          remove={remove}
        />
      )}
      <BulkTagsDialog
        tags={bulkTags}
        setTags={setBulkTags}
        busy={action.isPending}
        confirm={() =>
          action.mutate(async () => {
            await appApi.bulkTags(
              selection.map((id) => ({ entityType: kind, id })),
              bulkTags ?? [],
            );
            setBulkTags(null);
            setSelection([]);
          })
        }
      />
    </>
  );
}
