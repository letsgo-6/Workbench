import { useEffect } from 'react';
import { v02Api } from '@/lib/api/v02';
import type { AutosaveController } from '@/hooks/autosave-controller';
import { isBlank, type Draft } from '../content/draft';
import { toast } from 'sonner';
export function usePromptSession(
  kind: string,
  id: string,
  controller: AutosaveController<Draft>,
) {
  useEffect(() => {
    if (kind !== 'prompt') return;
    const end = () => {
      void controller
        .flush()
        .then(() =>
          isBlank('prompt', controller.value) ? null : v02Api.saveVersion(id),
        )
        .catch((e: Error) => toast.error(e.message));
    };
    window.addEventListener('blur', end);
    window.addEventListener('beforeunload', end);
    return () => {
      end();
      window.removeEventListener('blur', end);
      window.removeEventListener('beforeunload', end);
    };
  }, [kind, id, controller]);
}
