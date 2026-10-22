import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import { useAction } from '../content/hooks';
import { homeBus } from '../home/scene/bus';
import { useHomeNavigation } from '../home/navigation';
export function HomeSettings({ value }: { value: string }) {
  const action = useAction((v: string) => appApi.setSetting('home.intro', v)),
    nav = useHomeNavigation();
  return (
    <Field>
      <FieldLabel>{t('home.intro')}</FieldLabel>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v) action.mutate(v);
        }}
        aria-label={t('home.intro')}
      >
        {(['daily', 'always', 'never'] as const).map((v) => (
          <ToggleGroupItem key={v} value={v}>
            {t(`home.${v}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        variant="outline"
        onClick={() => {
          homeBus.emit({ type: 'replay' });
          nav.back();
        }}
      >
        {t('home.replay')}
      </Button>
    </Field>
  );
}
