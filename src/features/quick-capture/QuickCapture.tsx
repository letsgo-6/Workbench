import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ideasApi } from '@/lib/api/ideas';
import { todosApi } from '@/lib/api/todos';
import { quickApi } from '@/lib/api/quick';
import { localDate } from '@/lib/date';
import { t } from '@/i18n';
export function QuickCapture() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const failed = useRef(false);
  const theme = useRef<'light' | 'dark' | null>(null);
  useEffect(() => {
    let active = true;
    const media = matchMedia('(prefers-color-scheme: dark)');
    let preference = 'system';
    const apply = () => {
      const dark =
        preference === 'dark' || (preference === 'system' && media.matches);
      theme.current = preference === 'system' ? null : dark ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', dark);
      void quickApi.resize(120, theme.current).catch(() => {});
    };
    const load = async () => {
      const settings = await quickApi.settings();
      if (active) {
        preference = settings.appearanceTheme;
        apply();
      }
    };
    void load().catch(() => {});
    media.addEventListener('change', apply);
    const shown = listen('quick-shown', () => {
      if (!saving.current && !failed.current) {
        setText('');
        setError('');
      }
      requestAnimationFrame(() => input.current?.focus());
    });
    const changed = listen<{ entity: string }>(
      'data-changed',
      ({ payload }) => {
        if (payload.entity === 'setting' || payload.entity === 'all')
          void load().catch(() => {});
      },
    );
    return () => {
      active = false;
      media.removeEventListener('change', apply);
      void shown.then((f) => f());
      void changed.then((f) => f());
    };
  }, []);
  async function save(todo: boolean) {
    if (saving.current || !text.trim()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (todo)
        await todosApi.create({
          title: (text.split('\n')[0] ?? '').slice(0, 500),
          noteMd: text.includes('\n')
            ? text.split('\n').slice(1).join('\n')
            : '',
          dueDate: localDate(),
          priority: 2,
          sortOrder: 0,
          parentId: null,
          remindAt: null,
          tags: [],
        });
      else
        await ideasApi.create({ contentMd: text, date: localDate(), tags: [] });
      setText('');
      failed.current = false;
      await getCurrentWindow().hide();
    } catch {
      failed.current = true;
      setError(t('desktop.quickError'));
      input.current?.focus();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="quick-capture">
      <textarea
        ref={input}
        aria-label={t('desktop.quickLabel')}
        autoFocus
        disabled={busy}
        value={text}
        rows={Math.min(5, Math.max(1, text.split('\n').length))}
        placeholder={t('desktop.quickInput')}
        onChange={(e) => {
          setText(e.target.value);
          void quickApi
            .resize(
              120 + Math.min(4, e.target.value.split('\n').length - 1) * 25,
              theme.current,
            )
            .catch(() => {});
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            void getCurrentWindow().hide();
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save(e.ctrlKey || e.metaKey);
          }
        }}
      />
      <footer>
        {error ? <span role="alert">{error}</span> : t('desktop.quickHint')}
      </footer>
    </div>
  );
}
