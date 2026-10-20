import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { appApi } from '@/lib/api/app';
import { desktopApi } from '@/lib/api/data';
import type { Settings } from '@/types/bindings/Settings';
import { validKeymap } from '@/lib/keymap';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import { toast } from 'sonner';
export function ShortcutSettings({ settings }: { settings: Settings }) {
  const status = useQuery({
    queryKey: ['settings', 'shortcuts'],
    queryFn: desktopApi.status,
  });
  const [accelerator, setAccelerator] = useState(settings.shortcutQuickCapture);
  const [inApp, setInApp] = useState(settings.shortcutInApp);
  const action = useAction((fn: () => Promise<unknown>) => fn());
  return (
    <section>
      <h2>{t('desktop.shortcuts')}</h2>
      <label htmlFor="global-shortcut">{t('desktop.global')}</label>
      <div className="toolbar-actions">
        <Input
          id="global-shortcut"
          value={accelerator}
          onChange={(e) => setAccelerator(e.target.value)}
        />
        <Button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(() =>
              desktopApi.shortcut(accelerator).finally(() => status.refetch()),
            )
          }
        >
          {t('desktop.save')}
        </Button>
      </div>
      {status.data?.error && (
        <p role="alert">
          {t(
            status.data.error === 'SHORTCUT_INVALID'
              ? 'errors.SHORTCUT_INVALID'
              : 'errors.SHORTCUT_CONFLICT',
          )}
        </p>
      )}
      <p className="muted">
        {status.data?.active
          ? t('desktop.active', { key: status.data.active })
          : t('desktop.inactive')}
      </p>
      {status.error && <p role="alert">{status.error.message}</p>}
      <h3>{t('desktop.inApp')}</h3>
      {(['palette', 'newItem', 'aiDrawer', 'filter'] as const).map((key) => (
        <label key={key} className="shortcut-row">
          {t(`desktop.${key}`)}
          <Input
            aria-label={t(`desktop.${key}`)}
            value={inApp[key] ?? ''}
            onChange={(e) => setInApp((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
      ))}
      <Button
        disabled={action.isPending}
        onClick={() => {
          if (!validKeymap(inApp)) {
            toast.error(t('errors.SHORTCUT_INVALID'));
            return;
          }
          action.mutate(() => appApi.setSetting('shortcut.inApp', inApp));
        }}
      >
        {t('desktop.save')}
      </Button>
    </section>
  );
}
export function GeneralSettings({ settings }: { settings: Settings }) {
  const [mode, setMode] = useState(settings.networkProxy.mode);
  const [url, setUrl] = useState(settings.networkProxy.url ?? '');
  const [limit, setLimit] = useState(settings.aiMaxInputChars);
  const action = useAction((fn: () => Promise<unknown>) => fn());
  return (
    <section>
      <h2>{t('desktop.general')}</h2>
      <label>
        <input
          type="checkbox"
          checked={settings.generalCloseToTray}
          onChange={(e) =>
            action.mutate(() =>
              appApi.setSetting('general.closeToTray', e.target.checked),
            )
          }
        />
        {t('desktop.closeToTray')}
      </label>
      <h3>{t('desktop.proxy')}</h3>
      <select
        aria-label={t('desktop.proxy')}
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        {(['system', 'none', 'custom'] as const).map((value) => (
          <option key={value} value={value}>
            {t(`desktop.${value}`)}
          </option>
        ))}
      </select>
      {mode === 'custom' && (
        <Input
          type="url"
          aria-label={t('desktop.proxyUrl')}
          placeholder={t('desktop.proxyUrl')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      <Button
        disabled={action.isPending}
        onClick={() =>
          action.mutate(() =>
            appApi.setSetting('network.proxy', {
              mode,
              url: mode === 'custom' ? url : null,
            }),
          )
        }
      >
        {t('desktop.saveProxy')}
      </Button>
      <label className="shortcut-row">
        {t('desktop.maxInput')}
        <Input
          type="number"
          min={1000}
          max={100000}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </label>
      <Button
        disabled={action.isPending}
        onClick={() =>
          action.mutate(() => appApi.setSetting('ai.maxInputChars', limit))
        }
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
