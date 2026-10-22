export async function loadMainRenderer() {
  const { createMembraneRenderer } =
    await import('./membrane/MembraneRenderer');
  return createMembraneRenderer();
}
