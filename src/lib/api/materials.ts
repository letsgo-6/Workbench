import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ipc, AppError } from '../ipc';
import { createContentApi } from './client';
import type { Material } from '@/types/bindings/Material';
import type { MaterialAsset } from '@/types/bindings/MaterialAsset';
import type { MaterialImportResult } from '@/types/bindings/MaterialImportResult';
import type { AssetsUsage } from '@/types/bindings/AssetsUsage';
import type { SearchHit } from '@/types/bindings/SearchHit';
export const assetUrl = (path: string) => convertFileSrc(path);
async function binary<T>(
  command: string,
  blob: Blob,
  headers: Record<string, string>,
): Promise<T> {
  try {
    return await invoke<T>(command, await blob.arrayBuffer(), { headers });
  } catch (error) {
    throw new AppError(error);
  }
}
export const materialsApi = {
  ...createContentApi<Material>('material'),
  discardEmpty: (id: string) => ipc<boolean>('material_discard_empty', { id }),
  importFiles: (paths: string[], materialId?: string, kind = 'work') =>
    ipc<MaterialImportResult>('material_import_files', {
      paths,
      materialId,
      kind,
    }),
  importBytes: (blob: Blob, name: string, materialId?: string, kind = 'work') =>
    binary<MaterialImportResult>('material_import_bytes', blob, {
      'x-kind': kind,
      'x-mime': blob.type,
      'x-name': encodeURIComponent(name),
      ...(materialId ? { 'x-material-id': materialId } : {}),
    }),
  thumbnail: (
    id: string,
    blob: Blob,
    width: number,
    height: number,
    durationMs?: number,
  ) =>
    binary<MaterialAsset>('asset_set_thumbnail', blob, {
      'x-asset-id': id,
      'x-width': String(width),
      'x-height': String(height),
      ...(durationMs === undefined
        ? {}
        : { 'x-duration-ms': String(durationMs) }),
    }),
  reorder: (materialId: string, ids: string[]) =>
    ipc<void>('asset_reorder', { materialId, ids }),
  removeAsset: (id: string) => ipc<void>('asset_delete', { id }),
  cover: (materialId: string, assetId: string) =>
    ipc<void>('material_set_cover', { materialId, assetId }),
  usage: () => ipc<AssetsUsage>('assets_usage'),
  search: async (q: string) => {
    const hits = await ipc<SearchHit[]>('search_query', {
      q: `type:material ${q}`,
      limitPerType: 200,
    });
    return Promise.all(
      hits.map((hit) => ipc<Material>('material_get', { id: hit.id })),
    );
  },
};
