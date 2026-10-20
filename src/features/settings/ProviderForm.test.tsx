import { it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { ProviderForm } from './ProviderForm';
afterEach(clearMocks);
it('holds only the newly typed key and clears it after a successful save', async () => {
  let saved: unknown;
  mockIPC((command, args) => {
    if (command === 'provider_save') saved = args;
    return { id: 'test' };
  });
  const user = userEvent.setup();
  render(
    <ProviderForm
      provider={{
        id: 'test',
        name: '本机模型',
        baseUrl: 'https://example.invalid/v1',
        model: 'm',
        temperature: 0.7,
        maxTokens: null,
        isDefault: true,
        hasKey: true,
        keyHint: 'sk-…abcd',
      }}
      onClose={() => {}}
    />,
  );
  const field = screen.getByLabelText('API Key') as HTMLInputElement;
  expect(field.type).toBe('password');
  expect(field.value).toBe('');
  await user.type(field, 'test-only-new-key');
  await user.click(screen.getByRole('button', { name: '保存配置' }));
  await waitFor(() =>
    expect(saved).toMatchObject({ input: { apiKey: 'test-only-new-key' } }),
  );
  await waitFor(() => expect(field.value).toBe(''));
});
