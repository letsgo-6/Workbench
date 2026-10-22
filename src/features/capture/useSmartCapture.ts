import { useEffect, useRef, useState } from 'react';
import { Channel, captureApi } from '@/lib/api/capture';
import { aiApi } from '@/lib/api/ai';
import { AppError } from '@/lib/ipc';
import type { CapturePreview } from '@/types/bindings/CapturePreview';
import type { CaptureItem } from '@/types/bindings/CaptureItem';
import type { CaptureStreamEvent } from '@/types/bindings/CaptureStreamEvent';
import type { EntityType } from '@/types/bindings/EntityType';
import { useCaptureProcess } from './process/store';
import { homeBus } from '../home/scene/bus';
import { notifySaved } from './notify';
export interface CaptureRow {
  id: string;
  item: CaptureItem;
}
export function useSmartCapture(
  autoSave: boolean,
  onSaved: () => void,
  providerId: string | null = null,
) {
  const [status, setStatus] = useState<
    'idle' | 'analyzing' | 'preview' | 'saving'
  >('idle');
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [rows, updateRows] = useState<CaptureRow[]>([]);
  const currentRows = useRef<CaptureRow[]>([]);
  function setRows(next: CaptureRow[]) {
    currentRows.current = next;
    updateRows(next);
    homeBus.emit({ type: 'preview', nodes: next.map((r) => r.item.kind) });
  }
  const [error, setError] = useState<Error | null>(null);
  const request = useRef<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const id = request.current;
      request.current = null;
      if (id) {
        useCaptureProcess.getState().finish(id, 'cancelled');
        void aiApi.cancel(id).catch(() => {});
      }
    };
  }, []);
  async function save(items: CaptureItem[]) {
    if (
      busy.current ||
      !items.length ||
      items.some((i) => i.kind === 'todo' && !i.title.trim())
    )
      return;
    busy.current = true;
    setStatus('saving');
    homeBus.emit({ type: 'saving', nodes: items.map((i) => i.kind) });
    setError(null);
    const process = useCaptureProcess.getState();
    process.step(process.runId ?? '', { stage: 'saving' });
    try {
      const result = await captureApi.commit({ items });
      notifySaved(items, result);
      useCaptureProcess.getState().saved(
        process.runId ?? '',
        items.map((item, i) => ({
          kind: item.kind,
          title: item.title.trim() || item.source.split('\n')[0] || '',
          ref: result.refs[i],
          createdAt: result.createdAt,
          hasLink: Boolean(item.url),
        })),
      );
      onSaved();
      if (mounted.current) {
        setPreview(null);
        setRows([]);
        setStatus('idle');
      }
    } catch (failure) {
      homeBus.emit({ type: 'released', nodes: items.map((i) => i.kind) });
      useCaptureProcess.getState().step(process.runId ?? '', {
        stage: 'failed',
        detail: failure instanceof Error ? failure.message : undefined,
      });
      if (mounted.current) {
        setError(failure instanceof Error ? failure : new AppError(failure));
        setStatus('preview');
      }
    } finally {
      busy.current = false;
    }
  }
  async function analyze(text: string, target: EntityType | null = null) {
    if (busy.current || !text.trim()) return;
    const id = crypto.randomUUID();
    const process = useCaptureProcess.getState();
    process.begin(id, target, text);
    const channel = new Channel<CaptureStreamEvent>();
    channel.onmessage = (event) => {
      if (request.current !== id) return;
      if (event.type === 'stage')
        process.step(id, {
          stage: event.stage,
          ...(event.model ? { detail: event.model } : {}),
        });
      else if (event.type === 'reasoning') process.reason(id, event.text);
      else process.delta(id, event.text);
    };
    request.current = id;
    busy.current = true;
    setError(null);
    setPreview(null);
    setRows([]);
    setStatus('analyzing');
    const from =
      document
        .querySelector('.capture-field textarea')
        ?.getBoundingClientRect() ?? new DOMRect();
    homeBus.emit({ type: 'analyzing', from, amount: text.length });
    try {
      const result = await captureApi.analyzeStream(
        { requestId: id, providerId, text, target },
        channel,
      );
      if (request.current !== id || !mounted.current) return;
      useCaptureProcess.getState().finish(id, 'preview');
      homeBus.emit({ type: 'settled' });
      request.current = null;
      busy.current = false;
      setPreview(result);
      setRows(result.items.map((item) => ({ id: crypto.randomUUID(), item })));
      setStatus('preview');
      if (autoSave && result.autoSaveEligible) await save(result.items);
    } catch (failure) {
      if (request.current !== id || !mounted.current) return;
      homeBus.emit({ type: 'settled' });
      request.current = null;
      busy.current = false;
      setStatus('idle');
      const error = failure instanceof Error ? failure : new AppError(failure);
      const cancelled = error instanceof AppError && error.code === 'CANCELLED';
      useCaptureProcess
        .getState()
        .finish(id, cancelled ? 'cancelled' : 'error', error.message);
      if (!cancelled) setError(error);
    }
  }
  function cancel() {
    homeBus.emit({ type: 'settled' });
    if (status === 'saving') return;
    const id = request.current;
    request.current = null;
    busy.current = false;
    setStatus('idle');
    setPreview(null);
    setRows([]);
    setError(null);
    if (id) {
      useCaptureProcess.getState().finish(id, 'cancelled');
      void aiApi.cancel(id).catch(() => {});
    }
  }
  return {
    status,
    preview,
    rows,
    setRows,
    error,
    clearError: () => setError(null),
    analyze,
    save,
    saveCurrent: () => save(currentRows.current.map((r) => r.item)),
    cancel,
  };
}
