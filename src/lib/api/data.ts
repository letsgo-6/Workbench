import { ipc } from '../ipc';
import type { ImportReport } from '@/types/bindings/ImportReport';
import type { ShortcutStatus } from '@/types/bindings/ShortcutStatus';
export const dataApi = {
  exportBackup: (path: string) => ipc<void>('data_export_backup', { path }),
  export: (path: string) => ipc<void>('data_export_json', { path }),
  import: (path: string, mode: 'merge' | 'overwrite') =>
    ipc<ImportReport>('data_import_json', { path, mode }),
  open: () => ipc<void>('data_open_dir'),
  change: (path: string) => ipc<void>('data_change_dir', { path }),
};
export const desktopApi = {
  status: () => ipc<ShortcutStatus>('shortcut_status'),
  shortcut: (accelerator: string) =>
    ipc<ShortcutStatus>('shortcut_update', {
      action: 'quickCapture',
      accelerator,
    }),
  main: () => ipc<void>('window_show_main'),
  labels: (input: { showMain: string; quickCapture: string; quit: string }) =>
    ipc<void>('desktop_set_labels', input),
};
