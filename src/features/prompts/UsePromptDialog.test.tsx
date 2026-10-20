import { it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsePromptDialog } from './UsePromptDialog';
it('substitutes variables before copying and records exactly one usage', async () => {
  const calls: { command: string; args: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return undefined;
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UsePromptDialog
        id="p1"
        body="解释 {{topic}}，针对 {{对象}}"
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText('topic'), '回归');
  await user.type(screen.getByLabelText('对象'), '初学者');
  await user.click(screen.getByRole('button', { name: '复制并记录使用' }));
  await waitFor(() =>
    expect(calls.some((c) => c.command === 'prompt_record_use')).toBe(true),
  );
  expect(
    calls.find((c) => c.command === 'plugin:clipboard-manager|write_text')
      ?.args,
  ).toMatchObject({ text: '解释 回归，针对 初学者' });
  expect(calls.filter((c) => c.command === 'prompt_record_use')).toHaveLength(
    1,
  );
  clearMocks();
});
