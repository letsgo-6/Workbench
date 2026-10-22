import { homeBus } from '@/features/home/scene/bus';
import { listen } from '@tauri-apps/api/event';
import type { QueryClient } from '@tanstack/react-query';
export function listenDataChanges(client: QueryClient) {
  return listen<{ entity: string; op: string }>(
    'data-changed',
    ({ payload }) => {
      const entity = payload.entity;
      homeBus.emit({ type: 'data', ...payload });
      void client.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] !== 'home' || !homeBus.active) &&
          (entity === 'all' ||
            entity === 'tag' ||
            query.queryKey[0] === entity ||
            (entity === 'setting' && query.queryKey[0] === 'settings') ||
            ['home', 'search', 'trash', 'tags'].includes(
              String(query.queryKey[0]),
            )),
      });
    },
  );
}
