import { ipc } from '../ipc';
import type { Todo } from '@/types/bindings/Todo';
import type { TodoInput } from '@/types/bindings/TodoInput';
import type { Prompt } from '@/types/bindings/Prompt';
import type { PromptVersion } from '@/types/bindings/PromptVersion';
import type { Conversation } from '@/types/bindings/Conversation';
import type { ConversationDetail } from '@/types/bindings/ConversationDetail';
import type { SkillCandidate } from '@/types/bindings/SkillCandidate';
import type { SkillBatchReport } from '@/types/bindings/SkillBatchReport';
import type { BackupInfo } from '@/types/bindings/BackupInfo';
import type { CalendarDay } from '@/types/bindings/CalendarDay';
export const v02Api = {
  children: (id: string) => ipc<Todo[]>('todo_children', { id }),
  createTodos: (input: TodoInput[]) => ipc<Todo[]>('todo_create_batch', input),
  versions: (id: string) => ipc<PromptVersion[]>('prompt_version_list', { id }),
  saveVersion: (id: string) =>
    ipc<PromptVersion | null>('prompt_version_create', { id }),
  restoreVersion: (id: string) => ipc<Prompt>('prompt_version_restore', { id }),
  conversations: () => ipc<Conversation[]>('ai_conversation_list'),
  conversation: (id: string) =>
    ipc<ConversationDetail>('ai_conversation_get', { id }),
  renameConversation: (id: string, title: string) =>
    ipc<void>('ai_conversation_rename', { id, title }),
  deleteConversation: (id: string) =>
    ipc<void>('ai_conversation_delete', { id }),
  scan: (path: string) => ipc<SkillCandidate[]>('skill_scan_folder', { path }),
  importSkills: (paths: string[]) =>
    ipc<SkillBatchReport>('skill_import_batch', { paths }),
  fetchSkill: (url: string) => ipc<string>('skill_fetch_remote', { url }),
  backups: () => ipc<BackupInfo[]>('backup_list'),
  backup: () => ipc<BackupInfo>('backup_now'),
  restore: (name: string) => ipc<void>('backup_restore', { id: name }),
  exportMarkdown: (path: string) =>
    ipc<number>('data_export_markdown', { path }),
  calendar: (month: string) => ipc<CalendarDay[]>('idea_calendar', { month }),
};
