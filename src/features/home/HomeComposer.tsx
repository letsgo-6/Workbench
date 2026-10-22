import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { contentApi } from '@/lib/api/content';
import { appApi } from '@/lib/api/app';
import { toInput, emptyDraft } from '../content/draft';
import { useAction } from '../content/hooks';
import { localDate } from '@/lib/date';
import { t } from '@/i18n';
import { ModelPicker, useCaptureModel } from './ModelPicker';
import { homeBus } from './scene/bus';
import { useAiAvailable } from '../capture/useAiAvailable';
import { useSmartCapture } from '../capture/useSmartCapture';
import { useCaptureDraft } from '../capture/draft';
import { CaptureFallback } from '../capture/CaptureFallback';
import { CapturePreview } from '../capture/CapturePreview';
import { TargetPicker } from '../capture/TargetPicker';
import { CaptureProcess } from '../capture/process/CaptureProcess';
import { availableTargets, target } from '../capture/targets';
import { detectTarget } from '../capture/prefix';
import type { EntityType } from '@/types/bindings/EntityType';
// v0.5: the composer mode is the destination module; with a model every target is AI-organized.
type Mode = EntityType;
export function QuickInput({ active = true }: { active?: boolean } = {}) {
  const model = useCaptureModel();
  const input = useRef<HTMLTextAreaElement>(null);
  const { available, pending } = useAiAvailable();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
    enabled: available,
  });
  const [chosen, setChosen] = useState<Mode | null>(null);
  const { value, setValue } = useCaptureDraft();
  const manualBusy = useRef(false);
  const ai = available && !pending;
  const preferred = chosen ?? settings.data?.captureDefaultTarget ?? 'idea';
  const kind: Mode = !ai && !target(preferred).manual ? 'idea' : preferred;
  const useAi = ai;
  const smart = useSmartCapture(
    settings.data?.captureAutoSave ?? false,
    () => {
      if (useCaptureDraft.getState().value === value) setValue('');
    },
    model.selected?.id ?? null,
  );
  const cancelOnLeave = useEffectEvent(() => smart.cancel());
  useEffect(() => {
    if (!active) cancelOnLeave();
  }, [active]);
  const create = useAction(async (target: 'idea' | 'todo') => {
    if (!value.trim() || manualBusy.current || smart.status === 'saving')
      return;
    manualBusy.current = true;
    smart.cancel();
    const from = input.current?.getBoundingClientRect() ?? new DOMRect();
    homeBus.emit({ type: 'direct', from, amount: value.length });
    homeBus.emit({ type: 'saving', nodes: [target] });
    try {
      const draft = {
        ...emptyDraft(target),
        title: value.trim(),
        body: target === 'idea' ? value : '',
        dueDate: target === 'todo' ? localDate() : '',
      };
      await contentApi(target).create(toInput(target, draft));
      homeBus.emit({ type: 'committed', nodes: [target] });
      if (useCaptureDraft.getState().value === value) setValue('');
    } catch (error) {
      homeBus.emit({ type: 'released', nodes: [target] });
      throw error;
    } finally {
      manualBusy.current = false;
    }
  });
  const busy = create.isPending || smart.status === 'saving';
  const locked =
    busy || smart.status === 'analyzing' || smart.status === 'preview';
  const cycle = () => {
    const modes = availableTargets(ai).map((m) => m.kind);
    setChosen(modes[(modes.indexOf(kind) + 1) % modes.length] ?? 'idea');
  };
  const submit = () => {
    if (locked) return;
    if (useAi) void smart.analyze(value, kind);
    else if (kind === 'idea' || kind === 'todo') create.mutate(kind);
  };
  const save = () => void smart.saveCurrent();
  return (
    <section
      className="quick-input"
      onKeyDownCapture={(e) => {
        if (
          !e.nativeEvent.isComposing &&
          smart.preview &&
          e.key === 'Enter' &&
          e.ctrlKey &&
          !busy
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (e.target instanceof HTMLInputElement) e.target.blur();
          save();
        }
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.defaultPrevented || busy) return;
        if (e.key === 'Escape' && smart.status !== 'idle') {
          e.preventDefault();
          smart.cancel();
        }
        const singleLine =
          e.target instanceof HTMLInputElement ||
          (e.target instanceof HTMLTextAreaElement && e.target.readOnly);
        if (smart.preview && e.key === 'Enter' && !e.shiftKey && singleLine) {
          e.preventDefault();
          save();
        }
      }}
    >
      <CaptureProcess active={active} />
      <div className="capture-field">
        <textarea
          ref={input}
          aria-label={t('dashboard.quickLabel')}
          value={value}
          disabled={create.isPending}
          readOnly={locked}
          rows={2}
          placeholder={t(
            useAi
              ? target(kind).placeholder
              : kind === 'idea'
                ? 'dashboard.quick'
                : 'dashboard.quickTodo',
          )}
          onChange={(e) => {
            setValue(e.target.value);
            const detected = detectTarget(e.target.value);
            if (detected && (ai || target(detected).manual))
              setChosen(detected);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
            smart.clearError();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || locked) return;
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault();
              cycle();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (useAi && e.ctrlKey) create.mutate('idea');
              else submit();
            }
          }}
        />
        <div className="capture-bottom">
          <TargetPicker
            value={kind}
            ai={ai}
            disabled={locked}
            onChange={setChosen}
          />
          <ModelPicker disabled={locked} />
          <span aria-live="polite">
            {t(
              smart.status === 'analyzing'
                ? 'capture.analyzing'
                : useAi
                  ? 'capture.hint'
                  : 'dashboard.quickHint',
            )}
          </span>
          {smart.status === 'analyzing' ? (
            <Button variant="outline" size="sm" onClick={smart.cancel}>
              {t('capture.cancel')}
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label={t('dashboard.add')}
              disabled={!value.trim() || locked}
              onClick={submit}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
      {smart.error && (
        <CaptureFallback
          error={smart.error}
          disabled={busy}
          retry={() => void smart.analyze(value, kind)}
          manual={(kind) => create.mutate(kind)}
        />
      )}
      {smart.preview && (
        <CapturePreview
          preview={smart.preview}
          rows={smart.rows}
          onChange={smart.setRows}
          saving={busy}
          confirmAutoSave={Boolean(
            settings.data?.captureAutoSave && !smart.preview.autoSaveEligible,
          )}
          onSave={save}
          onOriginal={() => create.mutate('idea')}
          onCancel={smart.cancel}
        />
      )}
    </section>
  );
}
