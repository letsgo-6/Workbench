import { it, expect, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { waitForBackend } from './ready';
afterEach(clearMocks);
it('does not expose an interactive entry until backend readiness is confirmed', async () => {
  let calls = 0;
  mockIPC((command) => {
    expect(command).toBe('app_ready');
    return ++calls >= 3;
  });
  let resolved = false;
  const ready = waitForBackend().then(() => {
    resolved = true;
  });
  await Promise.resolve();
  expect(resolved).toBe(false);
  await ready;
  expect(resolved).toBe(true);
  expect(calls).toBe(3);
});
