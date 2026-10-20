import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ModelSettings } from './ModelSettings';
import { ShortcutSettings, GeneralSettings } from './DesktopSettings';
import { TemplateSettings } from './TemplateSettings';
import { DataSettings } from './DataSettings';
import { BackupSettings } from './BackupSettings';
import { EditorSettings, ReminderSettings } from './V02Settings';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Failure, Loading } from '@/components/common/Feedback';
import type { Tag } from '@/types/bindings/Tag';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import { useAction } from '../content/hooks';
function TagRow({ tag }: { tag: Tag }) {
  const [name, setName] = useState(tag.name);
  const [confirm, setConfirm] = useState(false);
  const action = useAction((run: () => Promise<unknown>) => run());
  return (
    <div className="tag-row">
      <Input
        type="color"
        aria-label={`${t('settings.color')} ${tag.name}`}
        value={tag.color ?? '#527767'}
        className="color-input"
        onChange={(e) =>
          action.mutate(() => appApi.colorTag(tag.id, e.target.value))
        }
      />
      <Input
        aria-label={`${t('settings.name')} ${tag.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <span className="muted">
        {t('settings.usage', { count: tag.useCount })}
      </span>
      <Button
        variant="outline"
        disabled={!name.trim() || name === tag.name || action.isPending}
        onClick={() => action.mutate(() => appApi.renameTag(tag.id, name))}
      >
        {t('settings.rename')}
      </Button>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        {t('common.delete')}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`${t('common.delete')} ${tag.name}`}
        description={t('settings.removeHint')}
        onConfirm={() => action.mutateAsync(() => appApi.deleteTag(tag.id))}
      />
    </div>
  );
}
export function SettingsPage() {
  const { section = 'appearance' } = useParams();
  const query = useQuery({ queryKey: ['settings'], queryFn: appApi.settings });
  const tags = useQuery({ queryKey: ['tags'], queryFn: appApi.tags });
  const info = useQuery({ queryKey: ['app-info'], queryFn: appApi.info });
  const theme = useAction((value: string) =>
    appApi.setSetting('appearance.theme', value),
  );
  return (
    <div className="page-scroll utility-page settings-page">
      <header className="page-header">
        <h1>{t('nav.settings')}</h1>
      </header>
      <nav className="settings-nav" aria-label={t('nav.settings')}>
        {(
          [
            { key: 'appearance', label: t('settings.appearance') },
            { key: 'models', label: t('model.title') },
            { key: 'templates', label: t('desktop.templates') },
            { key: 'shortcuts', label: t('desktop.shortcuts') },
            { key: 'data', label: t('data.title') },
            { key: 'general', label: t('desktop.general') },
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            aria-current={section === item.key ? 'page' : undefined}
            to={`/settings/${item.key}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {section === 'models' ? (
            <ModelSettings />
          ) : section === 'templates' ? (
            <TemplateSettings />
          ) : section === 'shortcuts' ? (
            <ShortcutSettings settings={query.data} />
          ) : section === 'data' ? (
            <>
              <DataSettings />
              <BackupSettings />
            </>
          ) : section === 'general' ? (
            <>
              <GeneralSettings settings={query.data} />
              <ReminderSettings />
            </>
          ) : (
            <>
              <section>
                <h2>{t('settings.appearance')}</h2>
                <Field>
                  <FieldLabel>{t('settings.theme')}</FieldLabel>
                  <ToggleGroup
                    type="single"
                    value={query.data?.appearanceTheme}
                    onValueChange={(value) => {
                      if (value) theme.mutate(value);
                    }}
                  >
                    {(['light', 'dark', 'system'] as const).map((value) => (
                      <ToggleGroupItem key={value} value={value}>
                        {t(`settings.${value}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <EditorSettings />
              </section>
              <section>
                <h2>{t('settings.tags')}</h2>
                {tags.error ? (
                  <Failure
                    error={tags.error}
                    retry={() => void tags.refetch()}
                  />
                ) : tags.data?.length ? (
                  tags.data.map((tag) => (
                    <TagRow key={`${tag.id}-${tag.name}`} tag={tag} />
                  ))
                ) : (
                  <p className="muted">{t('settings.noTags')}</p>
                )}
              </section>
              <section>
                <h2>{t('settings.about')}</h2>
                <p className="muted">{t('settings.localHint')}</p>
                <dl className="about">
                  <dt>{t('settings.version')}</dt>
                  <dd>{info.data?.version}</dd>
                  <dt>{t('settings.path')}</dt>
                  <dd>{info.data?.dataDir}</dd>
                </dl>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
