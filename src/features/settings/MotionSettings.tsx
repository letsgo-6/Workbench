import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { appApi } from '@/lib/api/app';
import { useAction } from '../content/hooks';
import { t } from '@/i18n';
export function MotionSettings({ value }: { value: string }) {
  const action = useAction((value: string) =>
    appApi.setSetting('appearance.motion', value),
  );
  const choices = [
    ['system', 'material.motionSystem'],
    ['full', 'material.motionFull'],
    ['lite', 'material.motionLite'],
    ['off', 'material.motionOff'],
  ] as const;
  return (
    <Field>
      <FieldLabel>{t('material.motion')}</FieldLabel>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(value) => {
          if (value) action.mutate(value);
        }}
        aria-label={t('material.motion')}
      >
        {choices.map(([key, label]) => (
          <ToggleGroupItem key={key} value={key}>
            {t(label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="muted">{t('material.motionHint')}</p>
    </Field>
  );
}
