import type { SceneTheme } from '../../types';
interface Surface {
  skin: HTMLCanvasElement;
  tissue: HTMLCanvasElement;
  front: HTMLCanvasElement;
  light: HTMLCanvasElement;
}
let palette = '';
const cache = new Map<string, Surface>();
// Four original procedural plates: back veil, occluding tissue, front veil, transmitted light.
// They are generated once per palette, not decoded from reference media.
export function cellTexture(
  index: number,
  theme: SceneTheme,
  color: string,
): Surface {
  const next = [
    theme.primary,
    theme.foreground,
    theme.background,
    theme.warning,
    theme.dark,
  ].join('|');
  if (palette !== next) {
    cache.clear();
    palette = next;
  }
  const key = `${index}|${color}`,
    known = cache.get(key);
  if (known) return known;
  let seed = 5791 + index * 947;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const size = index === 0 ? 640 : 320;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas 2D unavailable');
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / 2.6, size / 2.6);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { canvas, ctx };
  };
  const back = make(),
    core = make(),
    front = make(),
    light = make();
  const poses = [0.15, -0.48, 0.62, -0.75, 0.4, -0.2];
  const pose = poses[index]!,
    tilt = index === 0 ? -0.15 : Math.sin(index * 2.7) * 0.55;
  const project = (a: number, b: number, shell: number) => {
    const fold =
      1 +
      0.12 * Math.sin(a * 3 + b * 4 + index) +
      0.055 * Math.sin(a * 7 - b * 3);
    const z = Math.sin(b) * Math.sin(a);
    const x = Math.sin(b) * Math.cos(a) * fold * shell * (1 + pose * 0.14);
    const y =
      (Math.cos(b) * 0.82 + pose * 0.16 * Math.sin(b) ** 2) * fold * shell;
    return {
      x: x * Math.cos(tilt) - y * Math.sin(tilt),
      y: x * Math.sin(tilt) + y * Math.cos(tilt),
      z,
    };
  };
  // Peripheral specimens are open, fluted bells; the central specimen is a folded membrane volume.
  if (index !== 0) {
    const bell = (angle: number, latitude: number, inset = 1) => {
      const rim = Math.sin(latitude);
      const flute = 1 + 0.075 * Math.cos(angle * 11 + index) * rim ** 3;
      const x = Math.cos(angle) * rim * 0.88 * flute * inset;
      const z = Math.sin(angle) * rim;
      const y =
        -0.78 * Math.cos(latitude) -
        0.08 +
        z * 0.24 +
        0.035 * Math.sin(angle * 7) * rim ** 4;
      return {
        x: x * Math.cos(tilt) - y * Math.sin(tilt),
        y: x * Math.sin(tilt) + y * Math.cos(tilt),
        z,
      };
    };
    // Translucent flutes carry thickness and a local light falloff, rather than a wire cage.
    for (let j = 0; j < 28; j++) {
      const angle = (j / 28) * Math.PI * 2;
      const near = Math.sin(angle) > 0;
      const ctx = near ? front.ctx : back.ctx;
      ctx.beginPath();
      for (let side = 0; side < 2; side++) {
        for (let k = 0; k <= 40; k++) {
          const latitude = (side ? 1 - k / 40 : k / 40) * 1.67;
          const p = bell(angle + side * 0.14, latitude);
          if (!side && !k) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      const transmitted = ctx.createLinearGradient(0, -0.85, 0.18, 0.3);
      transmitted.addColorStop(0, 'transparent');
      transmitted.addColorStop(0.3, j % 5 === 0 ? theme.foreground : color);
      transmitted.addColorStop(0.76, color);
      transmitted.addColorStop(1, 'transparent');
      ctx.fillStyle = transmitted;
      ctx.globalAlpha = near ? (theme.dark ? 0.19 : 0.13) : 0.055;
      ctx.fill();
    }
    for (let j = 0; j < 90; j++) {
      const angle = (j / 90) * Math.PI * 2;
      const near = Math.sin(angle) > 0;
      const ctx = near ? front.ctx : back.ctx;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const u = k / 40;
        const p = bell(angle + Math.sin(u * 4 + j) * 0.018, u * 1.67);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.strokeStyle = j % 9 === 0 ? theme.foreground : color;
      ctx.globalAlpha = near ? 0.22 + (j % 9 === 0 ? 0.35 : 0) : 0.08;
      ctx.lineWidth = j % 9 === 0 ? 0.005 : 0.002;
      ctx.stroke();
    }
    for (let j = 1; j < 30; j++) {
      const ctx = j % 3 ? front.ctx : light.ctx;
      const latitude = (j / 30) * 1.67;
      ctx.beginPath();
      for (let k = 0; k <= 100; k++) {
        const a = (k / 100) * Math.PI * 2;
        const p = bell(a, latitude);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.strokeStyle = j % 3 ? color : theme.foreground;
      ctx.globalAlpha = theme.dark ? 0.1 : 0.19;
      ctx.lineWidth = 0.003;
      ctx.stroke();
    }
    // Unequal oral folds remain inside the silhouette; no circular rim around the specimen.
    for (let j = 0; j < 13; j++) {
      const x = (j / 12 - 0.5) * 0.65;
      core.ctx.beginPath();
      core.ctx.moveTo(x, -0.25);
      for (let k = 1; k <= 45; k++) {
        const u = k / 45;
        core.ctx.lineTo(
          x + Math.sin(u * 13 + j) * 0.055 * u,
          -0.25 + u * (0.8 + random() * 0.12),
        );
      }
      core.ctx.strokeStyle = j % 3 ? color : theme.foreground;
      core.ctx.globalAlpha = j % 3 ? 0.27 : 0.5;
      core.ctx.lineWidth = j % 3 ? 0.018 : 0.006;
      core.ctx.stroke();
    }
  }
  // Wide folded sheets have uneven thickness, open edges and gaps. No sphere fill or radial bevel.
  for (let j = 0; j < (index === 0 ? 54 : 0); j++) {
    const a0 = random() * Math.PI * 2,
      b0 = random() * 2.2 + 0.3;
    const sweep = 1.1 + random() * 2.5,
      shell = 0.68 + random() * 0.29;
    const ribbon = 0.012 + random() * 0.065;
    const points = Array.from({ length: 57 }, (_, k) => {
      const u = k / 56,
        a = a0 + u * sweep;
      const b =
        b0 +
        Math.sin(u * Math.PI * 2 + j) * 0.24 +
        (u - 0.5) * Math.sin(j * 2.4) * 2.8;
      return {
        p: project(a, b, shell),
        q: project(a, b + ribbon * (0.5 + Math.sin(u * Math.PI)), shell),
      };
    });
    const near = points[28]!.p.z > -0.1;
    const ctx = near ? front.ctx : back.ctx;
    const shape = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      points.forEach(({ p }, k) =>
        k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y),
      );
      [...points].reverse().forEach(({ q }) => c.lineTo(q.x, q.y));
      c.closePath();
    };
    shape(ctx);
    const lit = near && j % 4 === 0;
    if (lit && theme.dark) {
      const first = points[0]!.p,
        last = points[56]!.p;
      const transmission = ctx.createLinearGradient(
        first.x,
        first.y,
        last.x,
        last.y,
      );
      transmission.addColorStop(0, 'transparent');
      transmission.addColorStop(0.3, color);
      transmission.addColorStop(0.58, theme.foreground);
      transmission.addColorStop(1, 'transparent');
      ctx.fillStyle = transmission;
    } else ctx.fillStyle = color;
    ctx.globalAlpha = theme.dark
      ? near
        ? lit
          ? 0.36
          : 0.15
        : 0.055
      : near
        ? 0.13
        : 0.075;
    ctx.fill();
    ctx.beginPath();
    points.forEach(({ p }, k) =>
      k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.strokeStyle = theme.dark && j % 3 === 0 ? theme.foreground : color;
    ctx.lineWidth = 0.0015 + ribbon * 0.035;
    ctx.globalAlpha = theme.dark ? (near ? 0.46 : 0.16) : near ? 0.48 : 0.2;
    ctx.stroke();
    // Transmission sits on selected folded edges, not on a circle around the specimen.
    if (near && j % 4 === 0) {
      const c = light.ctx;
      c.beginPath();
      points
        .slice(9, 40)
        .forEach(({ p }, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.strokeStyle = theme.dark ? theme.foreground : color;
      c.lineWidth = 0.008;
      c.globalAlpha = 0.24;
      c.stroke();
      c.lineWidth = 0.002;
      c.globalAlpha = 0.8;
      c.stroke();
    }
  }
  // Long filaments weave through the volume instead of evenly scratching a shell.
  for (let j = 0; j < (index === 0 ? 220 : 0); j++) {
    const a0 = random() * Math.PI * 2,
      b0 = random() * Math.PI;
    const sweep = 0.8 + random() * 2.7,
      shell = 0.35 + random() * 0.65;
    const ctx = j % 3 ? back.ctx : front.ctx;
    ctx.strokeStyle = j % 9 ? color : theme.foreground;
    ctx.globalAlpha = theme.dark
      ? 0.09 + random() * 0.16
      : 0.12 + random() * 0.19;
    ctx.lineWidth = 0.001 + random() * 0.0018;
    ctx.beginPath();
    for (let k = 0; k <= 48; k++) {
      const u = k / 48,
        p = project(
          a0 + u * sweep,
          b0 + Math.sin(u * 4 + j) * 0.2 + (u - 0.5) * Math.sin(j) * 2,
          shell,
        );
      if (!k) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  // Unequal, folded organelle masses make occlusion visible through the membrane.
  for (let lobe = 0; lobe < (index === 0 ? 5 : 0); lobe++) {
    const c = core.ctx,
      cx = -0.18 + Math.sin(lobe * 2.3 + index) * 0.18,
      cy = 0.04 + Math.cos(lobe * 3.7) * 0.19;
    const r = 0.14 + random() * 0.14;
    c.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2,
        rr = r * (1 + 0.18 * Math.sin(a * 4 + lobe) + 0.09 * Math.cos(a * 7));
      const x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.66;
      if (!k) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = theme.dark ? theme.background : color;
    c.globalAlpha = theme.dark ? 0.67 : 0.2;
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 0.003;
    c.globalAlpha = theme.dark ? 0.35 : 0.45;
    c.stroke();
    for (let j = 0; j < 340; j++) {
      const a = random() * Math.PI * 2,
        u = Math.sqrt(random()),
        radius = r * (1 + 0.15 * Math.sin(a * 4 + lobe));
      const x = cx + Math.cos(a) * u * radius,
        y = cy + Math.sin(a) * u * radius * 0.66;
      c.fillStyle = theme.dark && j % 5 === 0 ? theme.foreground : color;
      c.globalAlpha = 0.12 + random() * 0.5;
      const w = 0.001 + random() * 0.004;
      c.fillRect(x, y, w, w);
    }
  }
  const result = {
    skin: back.canvas,
    tissue: core.canvas,
    front: front.canvas,
    light: light.canvas,
  };
  cache.set(key, result);
  return result;
}
