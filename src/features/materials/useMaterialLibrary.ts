import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { materialsApi } from '@/lib/api/materials';
import { flushAll } from '@/hooks/useAutosave';
import { useUi } from '@/stores/ui';
import { appApi } from '@/lib/api/app';
import { useAction } from '../content/hooks';
import type { Material } from '@/types/bindings/Material';
import type { MaterialInput } from '@/types/bindings/MaterialInput';
import { toast } from 'sonner';
import { useMaterialImport } from './useMaterialImport';
import { useMotionLevel } from './useMotionLevel';
export function emptyMaterial(
  kind = 'work',
  url: string | null = null,
): MaterialInput {
  return {
    kind,
    title: '',
    url,
    noteMd: '',
    prompt: '',
    coverAssetId: null,
    tags: [],
  };
}
export function useMaterialLibrary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const selected = useQuery({
    queryKey: ['material', 'detail', id],
    queryFn: () => materialsApi.get(id ?? ''),
    enabled: !!id,
  });
  const kind =
    params.get('tab') === 'components' ||
    (!params.has('tab') && selected.data?.kind === 'component')
      ? 'component'
      : 'work';
  const tab = kind === 'component' ? 'components' : 'works';
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [starred, setStarred] = useState(false);
  const [prompt, setPrompt] = useState<Material | null>(null);
  const [bulkTags, setBulkTags] = useState<string[] | null>(null);
  const selection = useUi((state) => state.selection);
  const setSelection = useUi((state) => state.setSelection);
  const motion = useMotionLevel();
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const tags = useQuery({ queryKey: ['tags'], queryFn: appApi.tags });
  const works = useQuery({
    queryKey: ['material', 'count', 'work'],
    queryFn: () => materialsApi.list({ materialKind: 'work', limit: 1 }),
  });
  const components = useQuery({
    queryKey: ['material', 'count', 'component'],
    queryFn: () => materialsApi.list({ materialKind: 'component', limit: 1 }),
  });
  useEffect(() => {
    const timer = setTimeout(() => setQ(filter.trim()), 150);
    return () => clearTimeout(timer);
  }, [filter]);
  const list = useInfiniteQuery({
    queryKey: ['material', 'list', { kind, tag, starred }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      materialsApi.list({
        materialKind: kind,
        tag: tag || null,
        starredOnly: starred,
        offset: pageParam,
        limit: 60,
      }),
    getNextPageParam: (page, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < page.total ? loaded : undefined;
    },
    enabled: !q,
  });
  const search = useQuery({
    queryKey: ['material', 'search', q],
    queryFn: () => materialsApi.search(q),
    enabled: !!q,
  });
  const items = useMemo(
    () =>
      q
        ? (search.data ?? []).filter(
            (item) =>
              item.kind === kind &&
              (!starred || item.isStarred) &&
              (!tag || item.tags.some((t) => t.name === tag)),
          )
        : (list.data?.pages.flatMap((page) => page.items) ?? []),
    [q, search.data, list.data, kind, tag, starred],
  );
  const action = useAction(async (operation: () => Promise<unknown>) => {
    await flushAll();
    return operation();
  });
  const open = useCallback(
    async (next: string, fresh = false, focusPrompt = false) => {
      await flushAll();
      await navigate(`/materials/${next}?tab=${tab}`, {
        state: { fresh, focusPrompt },
      });
    },
    [navigate, tab],
  );
  const imported = useCallback(
    (next: string) => {
      void open(next).catch((error: Error) => toast.error(error.message));
    },
    [open],
  );
  const create = useCallback(
    async (url: string | null = null) => {
      await flushAll();
      const item = await materialsApi.create(emptyMaterial(kind, url));
      await open(item.id, true);
    },
    [kind, open],
  );
  const fromUrl = useCallback((url: string) => create(url), [create]);
  const importer = useMaterialImport({
    kind,
    materialId: id,
    onImported: imported,
    onUrl: fromUrl,
  });
  const createFromKey = useEffectEvent(() => action.mutate(() => create()));
  const nextPage = () => {
    if (!q && list.hasNextPage && !list.isFetchingNextPage)
      void list.fetchNextPage();
  };
  const nextFromScroll = useEffectEvent(() => nextPage());
  useEffect(() => {
    const handler = () => createFromKey();
    window.addEventListener('new-item', handler);
    return () => window.removeEventListener('new-item', handler);
  }, []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) nextFromScroll();
      },
      { root: scroll.current, rootMargin: '400px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSelection([]);
    return () => setSelection([]);
  }, [kind, tag, starred, q, setSelection]);
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true;
  useEffect(
    () => () => {
      if (id && fresh)
        void flushAll()
          .then(() => materialsApi.discardEmpty(id))
          .catch((error: Error) => toast.error(error.message));
    },
    [id, fresh],
  );
  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setSelection([]);
    };
    window.addEventListener('keydown', clear);
    return () => window.removeEventListener('keydown', clear);
  }, [setSelection]);
  const close = () => {
    void flushAll()
      .then(() => navigate(`/materials?tab=${tab}`))
      .catch((error: Error) => toast.error(error.message));
  };
  const toggle = (next: string) =>
    setSelection(
      selection.includes(next)
        ? selection.filter((value) => value !== next)
        : [...selection, next],
    );
  const openCard = (item: Material, event?: React.MouseEvent) => {
    if (event?.ctrlKey || event?.metaKey) {
      toggle(item.id);
      return;
    }
    if (event?.shiftKey && selection.length) {
      const from = items.findIndex(
        (item) => item.id === selection[selection.length - 1],
      );
      const to = items.findIndex((value) => value.id === item.id);
      setSelection([
        ...new Set([
          ...selection,
          ...items
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .map((item) => item.id),
        ]),
      ]);
      return;
    }
    void open(item.id).catch((error: Error) => toast.error(error.message));
  };
  const refs = selection.map((id) => ({ entityType: 'material' as const, id }));
  const error = q ? search.error : list.error;
  const pending = q ? search.isPending : list.isPending;
  const cardActions = {
    activeId: id,
    selection,
    onOpen: openCard,
    onSelect: toggle,
    onStar: (item: Material) =>
      action.mutate(() => materialsApi.star(item.id, !item.isStarred)),
  };
  return {
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
  };
}
