import { it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { DataSettings } from './DataSettings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
afterEach(clearMocks);
it('overwrite import requires choosing a file and typing the confirmation phrase', async () => {
  const imported: unknown[] = [];
  mockIPC((command, args) => {
    if (command === 'plugin:dialog|open') return 'C:\\test\\backup.json';
    if (command === 'data_import_json') {
      imported.push(args);
      return { inserted: 2, updated: 0, skipped: 0 };
    }
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataSettings />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: '导入备份' }));
  await screen.findByRole('button', { name: '确认导入' });
  expect(imported).toHaveLength(0);
  await user.selectOptions(screen.getByLabelText('导入方式'), 'overwrite');
  const confirm = screen.getByRole('button', {
    name: '确认导入',
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  await user.type(screen.getByLabelText('覆盖确认文字'), '确认覆盖');
  expect(confirm.disabled).toBe(false);
  expect(imported).toHaveLength(0);
  await user.click(confirm);
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatchObject({ input: { mode: 'overwrite' } });
});
it('exports full backups by default and warns before data-only JSON exports', async () => {
  const exported: string[] = [];
  mockIPC((command) => {
    if (command === 'assets_usage')
      return { fileCount: 0, totalBytes: 0, purgedBytes: 0 };
    if (command === 'plugin:dialog|save') return 'C:/test/backup.wbbackup';
    if (command === 'data_export_backup' || command === 'data_export_json')
      exported.push(command);
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataSettings />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: '导出备份' }));
  expect(exported).toEqual(['data_export_backup']);
  await user.selectOptions(screen.getByLabelText('备份内容'), 'json');
  expect(screen.getByText(/仅数据备份不包含图片/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '导出备份' }));
  expect(exported).toEqual(['data_export_backup', 'data_export_json']);
});
