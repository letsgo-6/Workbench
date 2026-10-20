import { listen } from '@tauri-apps/api/event';
import type { QueryClient } from '@tanstack/react-query';
export function listenDataChanges(client: QueryClient) {
  return listen<{ entity: string; op: string }>(
    'data-changed',
    ({ payload }) => {
      const entity = payload.entity;
      void client.invalidateQueries({
        predicate: (query) =>
          entity === 'all' ||
          entity === 'tag' ||
          query.queryKey[0] === entity ||
          (entity === 'setting' && query.queryKey[0] === 'settings') ||
          ['dashboard', 'search', 'trash', 'tags'].includes(
            String(query.queryKey[0]),
          ),
      });
    },
  );
}
