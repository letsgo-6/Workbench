// Original shared topology, built once. Positions, normals and barycentrics remain on the GPU.
export interface SpecimenMesh {
  vertices: Float32Array;
  shell: { first: number; count: number };
  core: { first: number; count: number };
  threads: { first: number; count: number };
  dust: { first: number; count: number };
}
type Point = [number, number, number];
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
};
export function specimenMesh(jelly: boolean): SpecimenMesh {
  const data: number[] = [];
  const vertex = (
    p: Point,
    n: Point,
    bary: Point,
    kind: number,
    seed: number,
  ) => data.push(...p, ...n, ...bary, kind, seed);
  const triangle = (
    a: Point,
    b: Point,
    c: Point,
    kind: number,
    seed: number,
  ) => {
    const u = b.map((v, i) => v - a[i]!),
      v = c.map((x, i) => x - a[i]!);
    const normal: Point = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const length = Math.hypot(...normal) || 1;
    const n = normal.map((x) => x / length) as Point;
    vertex(a, n, [1, 0, 0], kind, seed);
    vertex(b, n, [0, 1, 0], kind, seed);
    vertex(c, n, [0, 0, 1], kind, seed);
  };
  const section = (build: () => void) => {
    const first = data.length / 11;
    build();
    return { first, count: data.length / 11 - first };
  };
  const shell = section(() => {
    const rings = jelly ? 8 : 15,
      sectors = jelly ? 20 : 26;
    const point = (i: number, j: number): Point => {
      j = (j + sectors) % sectors;
      const seed = i * sectors + j;
      const theta = (i / rings) * (jelly ? Math.PI * 0.51 : Math.PI);
      const phi = (j / sectors) * Math.PI * 2 + Math.sin(i * 4.2) * 0.08;
      const a = theta + (i && i < rings ? (noise(seed) - 0.5) * 0.09 : 0);
      const r =
        1 + 0.06 * Math.sin(phi * 5 + a * 7) + 0.055 * (noise(seed + 7) - 0.5);
      return jelly
        ? [
            Math.sin(a) * Math.cos(phi) * 0.85 * r,
            Math.cos(a) * 0.62 + 0.18,
            Math.sin(a) * Math.sin(phi) * 0.64 * r,
          ]
        : [
            Math.sin(a) * Math.cos(phi) * 0.85 * r,
            Math.cos(a) * 0.88 * r,
            Math.sin(a) * Math.sin(phi) * 0.82 * r,
          ];
    };
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < sectors; j++) {
        const a = point(i, j),
          b = point(i, j + 1),
          c = point(i + 1, j),
          d = point(i + 1, j + 1);
        if (i) triangle(a, b, c, 0, noise(i * 719 + j));
        if (jelly || i < rings - 1)
          triangle(b, d, c, 0, noise(i * 719 + j + 91));
      }
  });
  const core = section(() => {
    // Twisted, dark inner lamellae interrupt the outer net instead of forming a hollow cage.
    for (let ribbon = 0; ribbon < 7; ribbon++) {
      const angle = ribbon * 2.399;
      const point = (u: number, side: number): Point => {
        const a = angle + u * 4.2;
        const r = 0.28 + 0.16 * Math.sin(u * Math.PI);
        return [
          Math.cos(a) * r + side * 0.055,
          (jelly ? 0.32 : 0) + (u - 0.5) * (jelly ? 0.5 : 1.15),
          Math.sin(a) * r + Math.sin(u * 9 + ribbon) * side * 0.09,
        ];
      };
      for (let step = 0; step < 18; step++) {
        const u = step / 18,
          v = (step + 1) / 18;
        triangle(point(u, -1), point(u, 1), point(v, -1), 4, noise(ribbon));
        triangle(point(u, 1), point(v, 1), point(v, -1), 4, noise(ribbon));
      }
    }
    for (let cluster = 0; cluster < 3; cluster++) {
      const angle = cluster * 2.399;
      const center: Point = [
        Math.cos(angle) * 0.42,
        (jelly ? 0.25 : 0) + Math.sin(angle) * 0.36,
        Math.sin(angle * 1.4) * 0.35,
      ];
      for (let k = 0; k < 10; k++) {
        const seed = cluster * 10 + k;
        const tip = (offset: number): Point =>
          center.map(
            (x, axis) =>
              x + (noise(seed * 13 + axis * 41 + offset) - 0.5) * 0.4,
          ) as Point;
        triangle(tip(0), tip(17), tip(34), 1, cluster / 3);
      }
    }
  });
  const threads = section(() => {
    for (let j = 0; j < (jelly ? 22 : 12); j++) {
      const a = j * 2.399,
        seed = noise(j + 318);
      const point = (u: number): Point =>
        jelly
          ? [
              Math.cos(a) * 0.69 * (1 - u * 0.4) + Math.sin(u * 9 + j) * 0.03,
              0.16 - u * (1.15 + seed * 0.16),
              Math.sin(a) * 0.5 * (1 - u * 0.4),
            ]
          : [
              Math.cos(a + u * 1.5) * (0.2 + u * 0.48),
              Math.sin(a + u) * (0.2 + u * 0.4),
              Math.sin(a * 3 + u * 4) * 0.4,
            ];
      for (let step = 0; step < 28; step++)
        for (const u of [step / 28, (step + 1) / 28])
          vertex(point(u), [0, 0, 1], [u, 0, 0], 2, seed);
    }
  });
  const dust = section(() => {
    for (let i = 0; i < (jelly ? 130 : 330); i++) {
      const a = i * 2.399,
        y = (noise(i + 71) * 2 - 1) * 0.7;
      const r =
        Math.sqrt(Math.max(0, 0.55 - y * y)) * Math.sqrt(noise(i + 918));
      const p: Point = [
        Math.cos(a) * r,
        jelly ? 0.28 + y * 0.6 : y,
        Math.sin(a) * r,
      ];
      vertex(p, [0, 0, 1], [0, 0, 0], 3, noise(i + 21));
    }
  });
  return { vertices: new Float32Array(data), shell, core, threads, dust };
}
