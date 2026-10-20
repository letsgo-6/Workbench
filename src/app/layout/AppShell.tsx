import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '@/features/search/CommandPalette';
import { lazy, Suspense } from 'react';
import { useAiStore } from '@/features/ai/store';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
const AiDrawer = lazy(() =>
  import('@/features/ai/AiDrawer').then((m) => ({ default: m.AiDrawer })),
);
export function AppShell() {
  const open = useAiStore((s) => s.open);
  const hasJob = useAiStore((s) => Boolean(s.job));
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-surface">
        <Outlet />
      </main>
      <CommandPalette />
      {!open && (
        <Button
          className="ai-open"
          variant="outline"
          onClick={() => useAiStore.getState().patch({ open: true })}
        >
          {t('ai.open')}
        </Button>
      )}
      {(open || hasJob) && (
        <Suspense fallback={null}>
          <AiDrawer />
        </Suspense>
      )}
    </div>
  );
}
