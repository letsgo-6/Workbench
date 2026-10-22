import { afterEach, expect, it, vi } from 'vitest';
import { createOpticsAtlas } from './optics';
import { emptyVisuals } from '../../layout';
afterEach(() => vi.restoreAllMocks());
it('falls back when WebGL is unavailable', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(createOpticsAtlas()).toBeUndefined();
});
function context(compiles = true) {
  const gl = {
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compiles),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    isContextLost: vi.fn(() => false),
    clearColor: vi.fn(),
    clear: vi.fn(),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    cullFace: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(gl as unknown as CanvasRenderingContext2D);
  return { gl, canvas: () => getContext.mock.contexts[0] as HTMLCanvasElement };
}
it('releases partially allocated resources when a shader cannot compile', () => {
  const { gl } = context(false);
  expect(createOpticsAtlas()).toBeUndefined();
  expect(gl.deleteShader).toHaveBeenCalledTimes(1);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
});
it('stops issuing GPU work after context loss and releases its resources', () => {
  const { gl, canvas } = context();
  const atlas = createOpticsAtlas()!;
  const state = {
    clock: 1000,
    theme: {
      primary: '#8cdff0',
      foreground: '#e2edf8',
      background: '#091421',
      warning: '#efbd75',
      muted: '#9db3c9',
      dark: true,
    },
    motion: 'full' as const,
    thinking: false,
    nodes: emptyVisuals(),
    engagement: [],
  };
  expect(atlas.render(state)).toBe(true);
  expect(gl.drawArrays).toHaveBeenCalledTimes(30);
  canvas().dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(atlas.render(state)).toBe(false);
  expect(gl.drawArrays).toHaveBeenCalledTimes(30);
  atlas.destroy();
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
});
