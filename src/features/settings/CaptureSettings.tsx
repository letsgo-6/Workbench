import { Link } from 'react-router';
import type { Settings } from '@/types/bindings/Settings';
import { appApi } from '@/lib/api/app';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
import { TARGETS } from '../capture/targets';
export function CaptureSettings({ settings }: { settings: Settings }) {
  const action = useAction(
    ({ key, value }: { key: string; value: boolean | string }) =>
      appApi.setSetting(key, value),
  );
  return (
    <section className="capture-settings">
      <h2>{t('capture.settingsTitle')}</h2>
      <label className="capture-label">
        {t('capture.defaultTarget')}
        <select
          value={settings.captureDefaultTarget}
          disabled={action.isPending}
          onChange={(e) =>
            action.mutate({
              key: 'capture.defaultTarget',
              value: e.target.value,
            })
          }
        >
          {TARGETS.map((target) => (
            <option key={target.kind} value={target.kind}>
              {t(target.label)}
            </option>
          ))}
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.captureAutoSave}
          disabled={action.isPending}
          onChange={(e) =>
            action.mutate({ key: 'capture.autoSave', value: e.target.checked })
          }
        />
        {t('capture.autoSave')}
      </label>
      <p className="muted">{t('capture.settingsHint')}</p>
      <Link to="/settings/templates">{t('capture.editTemplate')}</Link>
    </section>
  );
}
