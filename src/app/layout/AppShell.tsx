import { Outlet, useLocation } from 'react-router';
import { HomeNavigation, useHomeNavigation } from '@/features/home/navigation';
import { ModuleHeader } from './ModuleHeader';
import { useEffect } from 'react';
import { useMotionLevel } from '@/features/materials/useMotionLevel';
import { bindSceneKeys } from '@/lib/keymap';
import { CommandPalette } from '@/features/search/CommandPalette';
import { lazy, Suspense } from 'react';
import { useAiStore } from '@/features/ai/store';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { SeaBackdrop } from './SeaBackdrop';
const HomeStage = lazy(() =>
  import('@/features/home/HomeStage').then((m) => ({ default: m.HomeStage })),
);
const AiDrawer = lazy(() =>
  import('@/features/ai/AiDrawer').then((m) => ({ default: m.AiDrawer })),
);
function ShellContent() {
  const motion = useMotionLevel();
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [motion]);
  const location = useLocation(),
    nav = useHomeNavigation();
  const home = location.pathname === '/';
  useEffect(
    () => bindSceneKeys({ home, enter: nav.enter, back: nav.back }),
    [home, nav],
  );
  const open = useAiStore((s) => s.open);
  const hasJob = useAiStore((s) => Boolean(s.job));
  return (
    <div
      data-motion={motion}
      className={`app-shell neuron-shell ${nav.transition}`}
    >
      <SeaBackdrop motion={motion} />
      <div className="workbench-content">
        <Suspense fallback={null}>
          <HomeStage />
        </Suspense>
        {!home && (
          <main className="main-surface module-surface">
            <ModuleHeader />
            <div className="module-outlet">
              <Outlet />
            </div>
          </main>
        )}
      </div>
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

export function AppShell() {
  return (
    <HomeNavigation>
      <ShellContent />
    </HomeNavigation>
  );
}
