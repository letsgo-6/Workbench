import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/lib/api/app';
import { enableNotifications } from '@/lib/api/notifications';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
export function EditorSettings() {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  const action = useAction((value: number) =>
    appApi.setSetting('editor.fontSize', value),
  );
  return (
    <Field>
      <FieldLabel htmlFor="editor-font-size">{t('v02.fontSize')}</FieldLabel>
      <Input
        id="editor-font-size"
        type="number"
        min={10}
        max={32}
        key={settings.data?.editorFontSize}
        defaultValue={settings.data?.editorFontSize ?? 14}
        onBlur={(e) => {
          const value = Number(e.target.value);
          if (Number.isInteger(value) && value >= 10 && value <= 32)
            action.mutate(value);
          else
            e.currentTarget.value = String(settings.data?.editorFontSize ?? 14);
        }}
      />
    </Field>
  );
}
export function ReminderSettings() {
  const query = useQuery({ queryKey: ['settings'], queryFn: appApi.settings });
  const action = useAction(async (run: () => Promise<unknown>) => run());
  return (
    <section>
      <h2>{t('v02.reminders')}</h2>
      <label className="check-row">
        <input
          type="checkbox"
          checked={query.data?.todoRemindersEnabled ?? true}
          onChange={(e) =>
            action.mutate(() =>
              appApi.setSetting('todo.remindersEnabled', e.target.checked),
            )
          }
        />
        {t('v02.reminders')}
      </label>
      <Field>
        <FieldLabel htmlFor="default-reminder-time">
          {t('v02.defaultTime')}
        </FieldLabel>
        <Input
          id="default-reminder-time"
          type="time"
          key={query.data?.todoDefaultRemindTime}
          defaultValue={query.data?.todoDefaultRemindTime ?? '09:00'}
          onBlur={(e) => {
            if (e.target.value)
              action.mutate(() =>
                appApi.setSetting('todo.defaultRemindTime', e.target.value),
              );
          }}
        />
      </Field>
      <Button
        variant="outline"
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            if (!(await enableNotifications()))
              throw new Error(t('v02.permissionDenied'));
          })
        }
      >
        {t('v02.permission')}
      </Button>
    </section>
  );
}
