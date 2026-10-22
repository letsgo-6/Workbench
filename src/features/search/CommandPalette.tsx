import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Search } from 'lucide-react';
import { useUi } from '@/stores/ui';
import { appApi } from '@/lib/api/app';
import { kinds, routes, contentApi } from '@/lib/api/content';
import { emptyDraft, toInput } from '../content/draft';
import { flushAll } from '@/hooks/useAutosave';
import { highlight } from '@/lib/highlight';
import { t } from '@/i18n';
import { requestAction } from '../ai/store';
import { reportError } from '@/app/providers';
function Highlight({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((part, i) =>
        part.hit ? <mark key={i}>{part.text}</mark> : part.text,
      )}
    </>
  );
}
export function CommandPalette() {
  const open = useUi((s) => s.palette);
  const setOpen = useUi((s) => s.setPalette);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(timer);
  }, [q]);
  const result = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => appApi.search(debounced),
    enabled: open && Boolean(debounced.trim()),
  });
  const run = (action: () => Promise<unknown> | void) => {
    void flushAll()
      .then(action)
      .then(() => {
        setOpen(false);
        setQ('');
      })
      .catch(reportError);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="search-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('search.hint')}
        </DialogDescription>
        <Command shouldFilter={false}>
          <p className="search-syntax muted">{t('v02.searchSyntax')}</p>
          <div className="command-input">
            <Search />
            <Command.Input
              autoFocus
              placeholder={t('search.placeholder')}
              value={q}
              onValueChange={setQ}
            />
            <kbd>Esc</kbd>
          </div>
          <Command.List>
            {debounced.trim() ? (
              <>
                {result.isFetching && (
                  <p className="command-message">{t('app.loading')}</p>
                )}
                {result.error && (
                  <p role="alert" className="command-message">
                    {result.error.message}
                  </p>
                )}
                {!result.isFetching && !result.data?.length && (
                  <Command.Empty>{t('search.empty')}</Command.Empty>
                )}
                {kinds.map((kind) => {
                  const hits =
                    result.data?.filter((i) => i.entityType === kind) ?? [];
                  return hits.length ? (
                    <Command.Group key={kind} heading={t(`nav.${kind}`)}>
                      {hits.map((hit) => (
                        <Command.Item
                          key={hit.id}
                          value={hit.id}
                          onSelect={() =>
                            run(() => navigate(`/${routes[kind]}/${hit.id}`))
                          }
                        >
                          <strong>
                            <Highlight
                              text={hit.title || t('common.untitled')}
                              q={debounced}
                            />
                          </strong>
                          <span>
                            <Highlight text={hit.snippet} q={debounced} />
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null;
                })}
              </>
            ) : (
              <Command.Group heading={t('search.commands')}>
                <Command.Item
                  onSelect={() => run(() => requestAction('daily_summary', []))}
                >
                  {t('v02.summary')}
                </Command.Item>
                {kinds.map((kind) => (
                  <Command.Item
                    key={kind}
                    onSelect={() =>
                      run(async () => {
                        const item = await contentApi(kind).create(
                          toInput(kind, emptyDraft(kind)),
                        );
                        void navigate(`/${routes[kind]}/${item.id}`, {
                          state: { fresh: true },
                        });
                      })
                    }
                  >
                    {t('search.new', { type: t(`nav.${kind}`) })}
                  </Command.Item>
                ))}
                <Command.Item onSelect={() => run(() => navigate('/settings'))}>
                  {t('search.openSettings')}
                </Command.Item>
                <Command.Item onSelect={() => run(() => navigate('/trash'))}>
                  {t('search.openTrash')}
                </Command.Item>
                <Command.Item
                  onSelect={() =>
                    run(async () => {
                      const settings = await appApi.settings();
                      await appApi.setSetting(
                        'appearance.theme',
                        settings.appearanceTheme === 'dark' ? 'light' : 'dark',
                      );
                    })
                  }
                >
                  {t('search.theme')}
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
