import { t } from '@/i18n';
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dayLabel(value: string, now = new Date()): string {
  if (value === localDate(now)) return t('common.today');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (value === localDate(yesterday)) return t('common.yesterday');
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}
