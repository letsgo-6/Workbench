import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { contentApi } from '@/lib/api/content';
import type { EntityType } from '@/types/bindings/EntityType';
import type { ListQuery } from '@/types/bindings/ListQuery';
import { toast } from 'sonner';
export function useContentList(kind: EntityType, filters: Partial<ListQuery>) {
  return useInfiniteQuery({
    queryKey: [kind, 'list', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      contentApi(kind).list({ ...filters, offset: pageParam, limit: 50 }),
    getNextPageParam: (page, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < page.total ? loaded : undefined;
    },
  });
}
export function useContentDetail(kind: EntityType, id?: string) {
  return useQuery({
    queryKey: [kind, 'detail', id],
    queryFn: () => contentApi(kind).get(id ?? ''),
    enabled: Boolean(id),
    refetchOnMount: 'always',
  });
}
export function useAction<T, R>(action: (value: T) => Promise<R>) {
  return useMutation({
    mutationFn: action,
    onError: (error) => toast.error(error.message),
  });
}
