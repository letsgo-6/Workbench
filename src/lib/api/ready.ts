import { ipc } from '../ipc';
/** WebViews can finish loading before Tauri setup has registered the application state. */
export async function waitForBackend() {
  while (!(await ipc<boolean>('app_ready')))
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
}
