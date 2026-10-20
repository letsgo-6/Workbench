import { useEffect, useState } from 'react';
import { AutosaveController, type SaveStatus } from './autosave-controller';
import { toast } from 'sonner';
import { t } from '@/i18n';
const pending = new Set<() => Promise<void>>();
export async function flushAll() {
  await Promise.all([...pending].map((save) => save()));
}
export function useAutosave<T>(draft: T, save: (value: T) => Promise<unknown>) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [controller] = useState(
    () => new AutosaveController(draft, save, setStatus),
  );
  useEffect(() => {
    controller.update(draft);
  }, [draft, controller]);
  useEffect(() => {
    const flush = () => controller.flush();
    pending.add(flush);
    const handle = () => {
      void flush().catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : t('common.unsaved'),
        ),
      );
    };
    window.addEventListener('blur', handle);
    window.addEventListener('beforeunload', handle);
    return () => {
      handle();
      pending.delete(flush);
      window.removeEventListener('blur', handle);
      window.removeEventListener('beforeunload', handle);
    };
  }, [controller]);
  return { status, flush: () => controller.flush(), controller };
}
