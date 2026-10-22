import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
export function useSceneVisibility() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    let closed = false;
    let nativeVisible = true;
    const apply = () => {
      if (!closed) setVisible(nativeVisible && !document.hidden);
    };
    const cleanups: (() => void)[] = [];
    const update = async () => {
      try {
        const w = getCurrentWindow();
        const [shown, minimized] = await Promise.all([
          w.isVisible(),
          w.isMinimized(),
        ]);
        if (!closed) {
          nativeVisible = shown && !minimized;
          apply();
        }
      } catch {
        apply();
      }
    };
    const handler = () => {
      void update();
    };
    document.addEventListener('visibilitychange', apply);
    try {
      const w = getCurrentWindow();
      for (const promise of [
        w.onFocusChanged(handler),
        w.onResized(handler),
        w.listen('main-window-visibility', handler),
      ])
        void promise
          .then((fn) => {
            if (closed) fn();
            else cleanups.push(fn);
          })
          .catch(() => {});
    } catch {
      /* Browser preview has no native window. */
    }
    handler();
    return () => {
      closed = true;
      document.removeEventListener('visibilitychange', apply);
      cleanups.forEach((fn) => fn());
    };
  }, []);
  return visible;
}
