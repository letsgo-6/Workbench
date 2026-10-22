import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { routes } from '@/lib/api/content';
import { t } from '@/i18n';
import { target } from '../targets';
import { undoCapture } from '../notify';
import { useCaptureProcess, type ProcessStep } from './store';
import { partialItems } from './partial';
/**
 * v0.5: top-centre toggle above the composer plus the one-round process panel.
 * Collapsing while running only hides it; closing a finished round asks before clearing.
 */
export function CaptureProcess({ active = true }: { active?: boolean }) {
  const s = useCaptureProcess();
  const [confirm, setConfirm] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const output = useRef<HTMLPreElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const partial = useMemo(() => partialItems(s.output), [s.output]);
  const running = s.phase === 'running';
  const close = () => {
    if (running) s.setOpen(false);
    else setConfirm(true);
  };
  const escape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      confirm ||
      (event.target instanceof Element &&
        event.target.closest(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        ))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  useEffect(() => {
    if (!s.open || !active) return;
    const listener = (event: KeyboardEvent) => escape(event);
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [s.open, active]);
  useEffect(() => {
    if (running && output.current)
      output.current.scrollTop = output.current.scrollHeight;
  }, [s.output, s.open, running]);
  if (!s.runId) return null;
  return (
    <div className="capture-process" data-phase={s.phase}>
      <Button
        variant="ghost"
        size="sm"
        className="capture-process-toggle"
        key={s.runId}
        data-streaming={
          s.steps.some((step) => step.stage === 'streaming') || undefined
        }
        aria-expanded={s.open}
        aria-controls="capture-process-panel"
        onClick={() => (s.open ? close() : s.setOpen(true))}
      >
        {running ? (
          <LoaderCircle data-icon="inline-start" className="animate-spin" />
        ) : s.open ? (
          <ChevronDown data-icon="inline-start" />
        ) : (
          <ChevronUp data-icon="inline-start" />
        )}
        {t(`capture.process.toggle.${s.phase}`)}
      </Button>
      {s.open && (
        <section
          id="capture-process-panel"
          className="capture-process-panel"
          aria-label={t('capture.process.title')}
        >
          <header>
            <h2>
              {t('capture.process.title')}
              {s.target && (
                <small>
                  {t('capture.process.into', {
                    name: t(target(s.target).label),
                  })}
                </small>
              )}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('capture.process.close')}
              ref={closeButton}
              onClick={close}
            >
              <X />
            </Button>
          </header>
          <details open className="capture-process-thinking">
            <summary>{t('capture.process.thinking')}</summary>
            <ol className="capture-process-steps">
              {s.steps.map((step, i) => (
                <li key={i} data-stage={step.stage}>
                  {stepText(step)}{' '}
                  <time>
                    {t('capture.process.elapsed', {
                      seconds: (
                        (step.at - (s.steps[0]?.at ?? step.at)) /
                        1000
                      ).toFixed(1),
                    })}
                  </time>
                </li>
              ))}
            </ol>
            {s.reasoning && (
              <details className="capture-process-reasoning">
                <summary>{t('capture.process.reasoning')}</summary>
                <pre className="capture-process-output">{s.reasoning}</pre>
              </details>
            )}
            {partial.length > 0 && (
              <ul className="capture-process-recognized" aria-live="polite">
                {partial.map((item, i) => (
                  <li key={i}>
                    {t('capture.process.recognized', {
                      name: t(target(item.kind).label),
                      title: item.title,
                    })}
                  </li>
                ))}
              </ul>
            )}
            {s.output && (
              <details className="capture-process-raw">
                <summary>{t('capture.process.raw')}</summary>
                <pre
                  ref={output}
                  className="capture-process-output"
                  aria-live="polite"
                >
                  {s.output}
                </pre>
              </details>
            )}
          </details>
          <div className="capture-process-result">
            <h3>{t('capture.process.result')}</h3>
            {s.results.length > 0 && (
              <p>
                {[...new Set(s.results.map((r) => r.kind))]
                  .map((kind) => {
                    const rows = s.results.filter(
                      (r) => r.kind === kind && !r.undone,
                    );
                    return rows.length
                      ? t('capture.process.summary', {
                          count: rows.length,
                          name: t(target(kind).label),
                          linked: rows.filter((r) => r.hasLink).length,
                        })
                      : '';
                  })
                  .filter(Boolean)
                  .join('；')}
              </p>
            )}
            {s.results.length ? (
              <ul>
                {s.results.map((r, i) => (
                  <li key={i}>
                    {t('capture.process.savedInto', {
                      name: t(target(r.kind).label),
                      title: r.title,
                    })}
                    {r.undone ? (
                      <span>{t('capture.undone')}</span>
                    ) : (
                      r.ref && (
                        <>
                          <a href={`#/${routes[r.kind]}/${r.ref.id}`}>
                            {t('capture.view')}
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={undoing !== null}
                            onClick={async () => {
                              const runId = s.runId!;
                              const ref = r.ref!;
                              setUndoing(ref.id);
                              const result = await undoCapture({
                                refs: [ref],
                                createdAt: r.createdAt,
                              });
                              if (result?.removed)
                                useCaptureProcess
                                  .getState()
                                  .undone(runId, ref.id);
                              setUndoing(null);
                            }}
                          >
                            {t('capture.undo')}
                          </Button>
                        </>
                      )
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t(`capture.process.pending.${s.phase}`)}</p>
            )}
          </div>
        </section>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('capture.process.clearTitle')}
        description={t('capture.process.clearHint')}
        onConfirm={async () => useCaptureProcess.getState().clear()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
      />
    </div>
  );
}
function stepText(step: ProcessStep) {
  const label = t(`capture.process.steps.${step.stage}`);
  return step.detail ? `${label} · ${step.detail}` : label;
}
