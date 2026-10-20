import type { Entry, EntryInput } from '@/lib/api/content';
import type { EntityType } from '@/types/bindings/EntityType';
import { localDate } from '@/lib/date';
import { t } from '@/i18n';
export interface Draft {
  title: string;
  body: string;
  date: string;
  dueDate: string;
  parentId: string | null;
  remindAt: string;
  sortOrder: number;
  priority: number;
  tags: string[];
  tools: string[];
  url: string;
  description: string;
  platforms: string;
  rating: string;
  note: string;
  category: string;
  model: string;
  systemPrompt: string;
}
export function emptyDraft(kind: EntityType): Draft {
  return {
    title: kind === 'todo' ? t('common.newTodo') : '',
    body: '',
    date: localDate(),
    dueDate: '',
    parentId: null,
    remindAt: '',
    sortOrder: 0,
    priority: 2,
    tags: [],
    tools: [],
    url: '',
    description: '',
    platforms: '',
    rating: '',
    note: '',
    category: '',
    model: '',
    systemPrompt: '',
  };
}
export function fromEntry(item: Entry, kind: EntityType): Draft {
  return {
    ...emptyDraft(kind),
    title: 'name' in item ? item.name : 'title' in item ? item.title : '',
    body:
      'body' in item
        ? item.body
        : 'noteMd' in item
          ? item.noteMd
          : (item.contentMd ?? ''),
    date: 'date' in item ? item.date : localDate(),
    dueDate: 'dueDate' in item ? (item.dueDate ?? '') : '',
    parentId: 'parentId' in item ? item.parentId : null,
    remindAt:
      'remindAt' in item && item.remindAt
        ? `${localDate(new Date(item.remindAt))}T${new Date(item.remindAt).toTimeString().slice(0, 5)}`
        : '',
    sortOrder: 'sortOrder' in item ? item.sortOrder : 0,
    priority: 'priority' in item ? item.priority : 2,
    tags: item.tags.map((t) => t.name),
    tools: 'tools' in item ? item.tools : [],
    url:
      'url' in item
        ? (item.url ?? '')
        : 'sourceUrl' in item
          ? (item.sourceUrl ?? '')
          : '',
    description: 'description' in item ? item.description : '',
    platforms: 'platforms' in item ? item.platforms.join(', ') : '',
    rating: 'rating' in item ? String(item.rating ?? '') : '',
    note: 'note' in item ? item.note : '',
    category: 'category' in item ? item.category : '',
    model: 'targetModel' in item ? (item.targetModel ?? '') : '',
    systemPrompt: 'systemPrompt' in item ? (item.systemPrompt ?? '') : '',
  };
}
export function toInput(kind: EntityType, d: Draft): EntryInput {
  switch (kind) {
    case 'idea':
      return { contentMd: d.body, date: d.date, tags: d.tags };
    case 'todo':
      return {
        title: d.title,
        noteMd: d.body,
        dueDate: d.dueDate || null,
        priority: d.priority,
        sortOrder: d.sortOrder,
        parentId: d.parentId,
        remindAt: d.remindAt ? new Date(d.remindAt).getTime() : null,
        tags: d.tags,
      };
    case 'tip':
      return {
        title: d.title,
        contentMd: d.body,
        tools: d.tools,
        sourceUrl: d.url || null,
        tags: d.tags,
      };
    case 'skill':
      return {
        name: d.title,
        contentMd: d.body || null,
        description: d.description,
        sourceType: d.url ? (d.body ? 'both' : 'url') : 'md',
        url: d.url || null,
        platforms: d.platforms
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        rating: d.rating ? Number(d.rating) : null,
        note: d.note,
        tags: d.tags,
      };
    case 'prompt':
      return {
        title: d.title,
        body: d.body,
        systemPrompt: d.systemPrompt || null,
        category: d.category,
        targetModel: d.model || null,
        tags: d.tags,
      };
  }
}
export function isBlank(kind: EntityType, d: Draft): boolean {
  return (
    !(d.title.trim() && (kind !== 'todo' || d.title !== t('common.newTodo'))) &&
    !d.body.trim() &&
    !d.url.trim() &&
    !d.description.trim() &&
    !d.note.trim() &&
    !d.tags.length
  );
}
