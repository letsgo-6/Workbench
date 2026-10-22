import {
  Bot,
  CircleCheck,
  Image,
  Lightbulb,
  Puzzle,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import type { EntityType } from '@/types/bindings/EntityType';
import type { TextKey } from '@/i18n';
/** v0.5: the six composer targets, in Tab order. */
export interface CaptureTarget {
  kind: EntityType;
  icon: LucideIcon;
  label: TextKey;
  placeholder: TextKey;
  /** Saved directly without a model (the pre-v0.5 manual modes). */
  manual: boolean;
}
export const TARGETS: CaptureTarget[] = [
  {
    kind: 'idea',
    icon: Lightbulb,
    label: 'capture.targets.idea',
    placeholder: 'capture.placeholders.idea',
    manual: true,
  },
  {
    kind: 'todo',
    icon: CircleCheck,
    label: 'capture.targets.todo',
    placeholder: 'capture.placeholders.todo',
    manual: true,
  },
  {
    kind: 'skill',
    icon: Puzzle,
    label: 'capture.targets.skill',
    placeholder: 'capture.placeholders.skill',
    manual: false,
  },
  {
    kind: 'prompt',
    icon: ScrollText,
    label: 'capture.targets.prompt',
    placeholder: 'capture.placeholders.prompt',
    manual: false,
  },
  {
    kind: 'tip',
    icon: Bot,
    label: 'capture.targets.tip',
    placeholder: 'capture.placeholders.tip',
    manual: false,
  },
  {
    kind: 'material',
    icon: Image,
    label: 'capture.targets.material',
    placeholder: 'capture.placeholders.material',
    manual: false,
  },
];
export function target(kind: EntityType): CaptureTarget {
  return TARGETS.find((t) => t.kind === kind) ?? TARGETS[0]!;
}
/** Without a usable model only the manual targets remain selectable. */
export function availableTargets(ai: boolean): CaptureTarget[] {
  return ai ? TARGETS : TARGETS.filter((t) => t.manual);
}
