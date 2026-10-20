import { useEffect, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { listenDataChanges } from '@/lib/events';
import { appApi, desktop } from '@/lib/api/app';
import { bindKeys } from '@/lib/keymap';
import { desktopApi } from '@/lib/api/data';
import { t } from '@/i18n';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true },
  },
});
function AppEffects() {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  useEffect(() => {
    void desktopApi
      .labels({
        showMain: t('desktop.showMain'),
        quickCapture: t('desktop.quickCapture'),
        quit: t('desktop.quit'),
      })
      .catch(reportError);
  }, []);
  useEffect(() => {
    const promise = listenDataChanges(queryClient);
    return () => {
      void promise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);
  const theme = settings.data?.appearanceTheme ?? 'system';
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && media.matches),
      );
      void desktop
        .theme(theme === 'system' ? null : theme === 'dark' ? 'dark' : 'light')
        .catch(() => {});
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const inApp = settings.data?.shortcutInApp;
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--editor-font-size',
      `${settings.data?.editorFontSize ?? 14}px`,
    );
  }, [settings.data?.editorFontSize]);
  useEffect(() => (inApp ? bindKeys(inApp) : undefined), [inApp]);
  return null;
}
export function reportError(error: unknown) {
  toast.error(error instanceof Error ? error.message : t('common.failure'));
}
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppEffects />
      {children}
      <Toaster
        richColors
        closeButton
        toastOptions={{ closeButtonAriaLabel: t('common.close') }}
        position="bottom-right"
      />
    </QueryClientProvider>
  );
}
