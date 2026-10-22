import type { MotionLevel, NeuronRenderer } from './types';
import { createStaticRenderer } from './renderers/static';
export async function mountRenderer(
  host: HTMLElement,
  motion: MotionLevel,
  load?: () => Promise<NeuronRenderer>,
  diagnostic = (e: unknown) => console.warn('Neuron renderer fallback', e),
): Promise<NeuronRenderer> {
  if (motion !== 'off' && load) {
    let renderer: NeuronRenderer | undefined;
    try {
      renderer = await load();
      await renderer.mount(host);
      return renderer;
    } catch (error) {
      renderer?.destroy();
      diagnostic(error);
    }
  }
  const renderer = createStaticRenderer();
  await renderer.mount(host);
  return renderer;
}
