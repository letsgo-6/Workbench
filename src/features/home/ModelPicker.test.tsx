import { expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { ModelPicker } from './ModelPicker';
it('offers keyed models only, starts with default, remembers selection without writing settings', async () => {
  const calls: string[] = [];
  mockIPC((cmd) => {
    calls.push(cmd);
    return [
      { id: 'no', name: 'No key', hasKey: false },
      {
        id: 'default',
        name: 'Default',
        model: 'm1',
        hasKey: true,
        isDefault: true,
      },
      { id: 'second', name: 'Second', model: 'm2', hasKey: true },
    ];
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ModelPicker disabled={false} />
    </QueryClientProvider>,
  );
  const picker = await screen.findByRole('combobox');
  await waitFor(() =>
    expect((picker as HTMLSelectElement).value).toBe('default'),
  );
  expect(screen.queryByText('No key')).toBeNull();
  await userEvent.selectOptions(picker, 'second');
  expect((picker as HTMLSelectElement).value).toBe('second');
  expect(calls).toEqual(['provider_list']);
  clearMocks();
});
