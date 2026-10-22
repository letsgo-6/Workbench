import type { CaptureItem } from '@/types/bindings/CaptureItem';
import type { CapturePreview } from '@/types/bindings/CapturePreview';
export function item(fields: Partial<CaptureItem> = {}): CaptureItem {
  return {
    kind: 'todo',
    source: '明天下午3点交周报',
    title: '交周报',
    body: '明天下午3点交周报',
    skillContent: null,
    date: null,
    dueDate: '2026-10-21',
    remindAt: null,
    dateText: '明天下午3点',
    dateSource: 'rule',
    priority: 2,
    tools: [],
    url: null,
    description: '',
    category: '',
    materialKind: null,
    materialPrompt: '',
    tags: [],
    confidence: 'high',
    warnings: [],
    ...fields,
  };
}
export function preview(fields: Partial<CapturePreview> = {}): CapturePreview {
  return {
    items: [item()],
    today: '2026-10-20',
    partialCoverage: false,
    truncated: false,
    autoSaveEligible: true,
    ...fields,
  };
}
