import { nodeIds } from '../../layout';
import type { PaintState } from './paint';
import { specimenFragment, specimenVertex } from './specimen-shader';
import { specimenMesh } from './mesh';
const tiles = [
  { x: 0, y: 0, size: 512 },
  ...Array.from({ length: 5 }, (_, i) => ({
    x: 512 + (i % 2) * 224,
    y: Math.floor(i / 2) * 224,
    size: 224,
  })),
];
export interface OpticsAtlas {
  render(
    state: Pick<
      PaintState,
      'clock' | 'theme' | 'motion' | 'thinking' | 'nodes' | 'engagement'
    >,
  ): boolean;
  draw(ctx: CanvasRenderingContext2D, index: number, radius: number): void;
  destroy(): void;
}
export function createOpticsAtlas(): OpticsAtlas | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 672;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl || typeof gl.createShader !== 'function') return;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null;
  let available = true;
  const lost = (event: Event) => {
    event.preventDefault();
    available = false;
  };
  canvas.addEventListener('webglcontextlost', lost);
  const destroy = () => {
    available = false;
    canvas.removeEventListener('webglcontextlost', lost);
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw Error('shader allocation');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error('shader compilation');
      return shader;
    };
    program = gl.createProgram();
    if (!program) throw Error('program allocation');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, specimenVertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, specimenFragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error('program link');
    buffer = gl.createBuffer();
    if (!buffer) throw Error('buffer allocation');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const meshes = [specimenMesh(false), specimenMesh(true)];
    const geometry = new Float32Array(
      meshes[0]!.vertices.length + meshes[1]!.vertices.length,
    );
    geometry.set(meshes[0]!.vertices);
    geometry.set(meshes[1]!.vertices, meshes[0]!.vertices.length);
    gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
    gl.useProgram(program);
    for (const [name, size, offset] of [
      ['Position', 3, 0],
      ['Normal', 3, 3],
      ['Bary', 3, 6],
      ['Kind', 1, 9],
      ['Seed', 1, 10],
    ] as const) {
      const attribute = gl.getAttribLocation(program, 'a' + name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 44, offset * 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uniforms = Object.fromEntries(
      [
        'Time',
        'Index',
        'Dark',
        'Energy',
        'Layer',
        'Motion',
        'Primary',
        'Core',
        'White',
      ].map((name) => [name, gl.getUniformLocation(program!, 'u' + name)]),
    );
    let palette = '';
    const colors = { primary: [0, 0, 0], core: [0, 0, 0], white: [0, 0, 0] };
    const rgb = (value: string) =>
      [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    return {
      render(state) {
        if (!available || gl.isContextLost()) return false;
        const next = [
          state.theme.primary,
          state.theme.warning,
          state.theme.foreground,
        ].join('|');
        if (next !== palette) {
          colors.primary = rgb(state.theme.primary);
          colors.core = rgb(state.theme.warning);
          colors.white = rgb(state.theme.foreground);
          palette = next;
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(
          uniforms.Time!,
          (state.clock / 1000) * (state.motion === 'full' ? 1 : 0.48),
        );
        gl.uniform1f(uniforms.Dark!, state.theme.dark ? 1 : 0);
        gl.uniform1f(
          uniforms.Motion!,
          state.motion === 'full' ? 1 : state.motion === 'lite' ? 0.4 : 0,
        );
        gl.uniform3fv(uniforms.Core!, colors.core);
        gl.uniform3fv(uniforms.White!, colors.white);
        tiles.forEach((tile, index) => {
          const visual = state.nodes[nodeIds[index]!];
          gl.viewport(
            tile.x,
            canvas.height - tile.y - tile.size,
            tile.size,
            tile.size,
          );
          gl.uniform1f(uniforms.Index!, index);
          gl.uniform1f(
            uniforms.Energy!,
            (state.engagement[index] ?? 0) +
              (state.thinking && index === 0 ? 0.4 : 0),
          );
          gl.uniform3fv(
            uniforms.Primary!,
            visual.overdue ? colors.core : colors.primary,
          );
          const mesh = meshes[index === 0 ? 0 : 1]!;
          const offset = index === 0 ? 0 : meshes[0]!.vertices.length / 11;
          const draw = (
            mode: number,
            range: { first: number; count: number },
          ) => gl.drawArrays(mode, offset + range.first, range.count);
          // Rear glass -> internal tissue -> front glass preserves the real spatial layering.
          gl.enable(gl.CULL_FACE);
          gl.cullFace(gl.FRONT);
          gl.uniform1f(uniforms.Layer!, 0.5);
          draw(gl.TRIANGLES, mesh.shell);
          gl.disable(gl.CULL_FACE);
          draw(gl.TRIANGLES, mesh.core);
          draw(gl.LINES, mesh.threads);
          draw(gl.POINTS, mesh.dust);
          gl.enable(gl.CULL_FACE);
          gl.cullFace(gl.BACK);
          gl.uniform1f(uniforms.Layer!, 1);
          draw(gl.TRIANGLES, mesh.shell);
          gl.disable(gl.CULL_FACE);
        });
        return true;
      },
      draw(ctx, index, radius) {
        const tile = tiles[index]!;
        ctx.drawImage(
          canvas,
          tile.x,
          tile.y,
          tile.size,
          tile.size,
          -radius * 1.35,
          -radius * 1.35,
          radius * 2.7,
          radius * 2.7,
        );
      },
      destroy,
    };
  } catch {
    destroy();
    return;
  }
}
