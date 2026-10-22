import { DropdownMenu } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { availableTargets, target } from './targets';
/** v0.5: bottom-left selector for the six composer targets (Tab still cycles). */
export function TargetPicker({
  value,
  ai,
  disabled,
  onChange,
}: {
  value: EntityType;
  ai: boolean;
  disabled: boolean;
  onChange: (kind: EntityType) => void;
}) {
  const current = target(value);
  const Icon = current.icon;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className="capture-target-trigger"
          title={t('capture.targetLabel', { name: t(current.label) })}
        >
          <Icon data-icon="inline-start" />
          {t(current.label)}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="capture-target-menu"
          side="top"
          align="start"
          sideOffset={6}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(v) => onChange(v as EntityType)}
          >
            {availableTargets(ai).map((item) => (
              <DropdownMenu.RadioItem
                key={item.kind}
                value={item.kind}
                className="capture-target-item"
              >
                <item.icon aria-hidden />
                <span>{t(item.label)}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {!ai && (
            <p className="capture-target-note">{t('capture.targetNeedsAi')}</p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
