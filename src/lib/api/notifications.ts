import {
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/plugin-notification';
export async function enableNotifications() {
  return (
    (await isPermissionGranted()) || (await requestPermission()) === 'granted'
  );
}
