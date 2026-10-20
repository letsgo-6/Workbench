import { ipc } from '../ipc';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Dashboard } from '@/types/bindings/Dashboard';
import type { Settings } from '@/types/bindings/Settings';
import type { Tag } from '@/types/bindings/Tag';
import type { EntityRef } from '@/types/bindings/EntityRef';
import type { EntityType } from '@/types/bindings/EntityType';
import type { SearchHit } from '@/types/bindings/SearchHit';
import type { TrashItem } from '@/types/bindings/TrashItem';
import type { ParsedSkill } from '@/types/bindings/ParsedSkill';
import type { ReadSkill } from '@/types/bindings/ReadSkill';
import { t } from '@/i18n';
export const appApi = {
  dashboard: () => ipc<Dashboard>('dashboard_get'),
  settings: () => ipc<Settings>('settings_get_all'),
  setSetting: (key: string, value: unknown) =>
    ipc<Settings>('settings_set', { key, value }),
  info: () =>
    ipc<{ version: string; dataDir: string; dbPath: string }>('app_info'),
  tags: () => ipc<Tag[]>('tag_list'),
  renameTag: (id: string, name: string) =>
    ipc<void>('tag_rename', { id, name }),
  deleteTag: (id: string) => ipc<void>('tag_delete', { id }),
  colorTag: (id: string, color: string) =>
    ipc<void>('tag_set_color', { id, color }),
  search: (q: string) => ipc<SearchHit[]>('search_query', { q }),
  trash: () => ipc<TrashItem[]>('trash_list'),
  restore: (ref: EntityRef) => ipc<void>('trash_restore', ref),
  purge: (ref: EntityRef) => ipc<void>('trash_purge', ref),
  emptyTrash: () => ipc<void>('trash_empty'),
  bulkDelete: (refs: EntityRef[]) => ipc<void>('entity_bulk_delete', { refs }),
  bulkTags: (refs: EntityRef[], tags: string[]) =>
    ipc<void>('entity_bulk_add_tags', { refs, tags }),
  convert: (id: string, target: EntityType) =>
    ipc<EntityRef>('idea_convert', { id, target }),
  toggleTodo: (id: string) => ipc<void>('todo_toggle_done', { id }),
  usePrompt: (id: string) => ipc<void>('prompt_record_use', { id }),
  categories: () => ipc<string[]>('prompt_categories'),
  parse: (content: string) =>
    ipc<ParsedSkill>('skill_parse_markdown', { content }),
  readSkill: (path: string) => ipc<ReadSkill>('skill_read_md_file', { path }),
  linkTitle: (url: string) => ipc<string | null>('link_fetch_title', { url }),
  exportSkill: (id: string, path: string) =>
    ipc<string>('skill_export_md', { id, path }),
  exportFolder: (id: string, dir: string) =>
    ipc<string>('skill_export_folder', { id, dir }),
};
export const desktop = {
  copy: writeText,
  openUrl,
  importMd: () =>
    open({
      multiple: false,
      filters: [{ name: t('skill.markdownFilter'), extensions: ['md'] }],
    }),
  saveMd: (name: string) =>
    save({
      defaultPath: `${name || 'SKILL'}.md`,
      filters: [{ name: t('skill.markdownFilter'), extensions: ['md'] }],
    }),
  chooseFolder: () => open({ directory: true, multiple: false }),
  onDrop: (callback: (paths: string[]) => void) =>
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') callback(event.payload.paths);
    }),
  theme: (value: 'light' | 'dark' | null) => getCurrentWindow().setTheme(value),
};
