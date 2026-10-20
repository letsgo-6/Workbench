import { it, expect, vi } from 'vitest';
import { AutosaveController } from './autosave-controller';
it('debounces one second and flushes on demand', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const ctrl = new AutosaveController<string>('a', save, () => {});
  ctrl.update('b');
  await vi.advanceTimersByTimeAsync(999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledWith('b');
  ctrl.update('c');
  await ctrl.flush();
  expect(save).toHaveBeenLastCalledWith('c');
  vi.useRealTimers();
});
it('serializes in-flight saves so latest edits cannot be overwritten', async () => {
  let finish: (() => void) | undefined;
  const saved: string[] = [];
  const save = vi.fn(async (value: string) => {
    if (value === 'b')
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    saved.push(value);
  });
  const ctrl = new AutosaveController<string>('a', save, () => {});
  ctrl.update('b');
  const first = ctrl.flush();
  ctrl.update('c');
  finish?.();
  await first;
  expect(saved).toEqual(['b', 'c']);
});
it('retains the draft after a failed save and supports retry', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk'))
    .mockResolvedValue(undefined);
  const ctrl = new AutosaveController<string>('a', save, () => {});
  ctrl.update('b');
  await expect(ctrl.flush()).rejects.toThrow('disk');
  expect(ctrl.status).toBe('error');
  expect(ctrl.value).toBe('b');
  await ctrl.flush();
  expect(ctrl.status).toBe('saved');
});
