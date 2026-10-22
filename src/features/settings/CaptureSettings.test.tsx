import { expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import type { Settings } from '@/types/bindings/Settings';
import { CaptureSettings } from './CaptureSettings';
it('offers six default destinations and writes the new settings key', async () => {
  const calls: unknown[] = [];
  mockIPC((command, args) => {
    if (command === 'settings_set') calls.push(args);
    return {};
  });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CaptureSettings
          settings={
            {
              captureDefaultTarget: 'skill',
              captureAutoSave: false,
            } as Settings
          }
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const select = screen.getByRole('combobox', { name: '默认整理目标' });
  expect((select as HTMLSelectElement).value).toBe('skill');
  expect(screen.getAllByRole('option')).toHaveLength(6);
  await userEvent.setup().selectOptions(select, 'material');
  await waitFor(() =>
    expect(calls).toEqual([
      { input: { key: 'capture.defaultTarget', value: 'material' } },
    ]),
  );
  expect(screen.queryByText(/默认使用智能整理/)).toBeNull();
  client.clear();
  clearMocks();
});
