import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EntityType } from '@/types/bindings/EntityType';
import { IdeaCalendar } from '../ideas/IdeaCalendar';
import { SkillBatchImport } from '../skills/SkillBatchImport';
import { launch, useAiStore } from '../ai/store';
import { t } from '@/i18n';
export function ContentTools({
  kind,
  date,
  onDate,
}: {
  kind: EntityType;
  date: string;
  onDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const busy = useAiStore((s) => s.status === 'streaming');
  if (kind === 'idea')
    return <IdeaCalendar selected={date} onSelect={onDate} />;
  if (kind === 'skill')
    return (
      <div className="list-tools">
        <SkillBatchImport />
      </div>
    );
  if (kind !== 'todo') return null;
  return (
    <div className="list-tools">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {t('v02.breakdown')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('v02.breakdown')}</DialogTitle>
          </DialogHeader>
          <textarea
            aria-label={t('v02.breakdownInput')}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            disabled={!text.trim() || busy}
            onClick={() => {
              launch({
                mode: 'action',
                action: 'breakdown_todos',
                input: { kind: 'text', text },
              });
              setOpen(false);
            }}
          >
            {t('ai.send')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
