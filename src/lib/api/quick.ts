import { ipc } from '../ipc';
import type { Settings } from '@/types/bindings/Settings';
export const quickApi = {
  settings: () => ipc<Settings>('settings_get_all'),
  resize: (height: number, theme: 'light' | 'dark' | null) =>
    ipc<void>('quick_sync_window', { height, theme }),
};
