import type { SceneTheme } from './types';
export function readSceneTheme(host: HTMLElement): SceneTheme {
  const css = getComputedStyle(host),
    read = (name: string) => css.getPropertyValue(name).trim();
  return {
    primary: read('--scene-metal') || read('--primary'),
    foreground: read('--foreground'),
    background: read('--background'),
    warning: read('--scene-energy') || read('--warning'),
    muted: read('--muted-foreground'),
    dark: document.documentElement.classList.contains('dark'),
  };
}
