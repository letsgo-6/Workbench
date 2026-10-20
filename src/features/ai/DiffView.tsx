import { useMemo, useState } from 'react';
import { compare } from './diff';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
export function DiffView({
  before,
  after,
  lines,
}: {
  before: string;
  after: string;
  lines: boolean;
}) {
  const [inline, setInline] = useState(true);
  const chunks = useMemo(
    () => compare(before, after, lines),
    [before, after, lines],
  );
  return (
    <div className="diff-view">
      <div className="toolbar-actions">
        <Button variant="ghost" size="sm" onClick={() => setInline(!inline)}>
          {t(inline ? 'ai.side' : 'ai.inline')}
        </Button>
      </div>
      {inline ? (
        <pre className="diff-inline">
          {chunks.map((part, i) => (
            <span
              key={i}
              className={
                part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''
              }
            >
              {part.value}
            </span>
          ))}
        </pre>
      ) : (
        <div className="diff-columns">
          <section>
            <h4>{t('ai.original')}</h4>
            <pre>{before}</pre>
          </section>
          <section>
            <h4>{t('ai.result')}</h4>
            <pre>{after}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
