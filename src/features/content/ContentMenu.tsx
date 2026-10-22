import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { appApi } from '@/lib/api/app';
import { contentApi, routes, type Entry } from '@/lib/api/content';
import type { EntityType } from '@/types/bindings/EntityType';
import { t } from '@/i18n';
import { AiMenu } from '../ai/AiMenu';
export function ContentMenu({
  kind,
  context,
  onClose,
  run,
  remove,
}: {
  kind: EntityType;
  context: { item: Entry; x: number; y: number };
  onClose: () => void;
  run: (action: () => Promise<unknown>) => void;
  remove: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const choose = (action: () => Promise<unknown>) => {
    run(action);
    onClose();
  };
  return (
    <>
      <div className="context-dismiss" onClick={onClose} />
      <div
        className="context-menu"
        role="menu"
        style={{
          left: Math.min(context.x, window.innerWidth - 200),
          top: Math.min(context.y, window.innerHeight - 220),
        }}
      >
        <AiMenu
          refs={[{ entityType: kind, id: context.item.id }]}
          onChoose={onClose}
        />
        <Button
          variant="ghost"
          role="menuitem"
          onClick={() =>
            choose(() =>
              contentApi(kind).star(context.item.id, !context.item.isStarred),
            )
          }
        >
          {t(context.item.isStarred ? 'common.unstar' : 'common.star')}
        </Button>
        {kind === 'idea' &&
          (['todo', 'tip', 'prompt'] as const).map((target) => (
            <Button
              key={target}
              variant="ghost"
              role="menuitem"
              onClick={() =>
                choose(async () => {
                  const ref = await appApi.convert(context.item.id, target);
                  void navigate(`/${routes[ref.entityType]}/${ref.id}`);
                })
              }
            >
              {t('idea.convert')} {t(`nav.${target}`)}
            </Button>
          ))}
        <Button
          variant="ghost"
          role="menuitem"
          onClick={() => choose(() => remove(context.item.id))}
        >
          {t('common.delete')}
        </Button>
      </div>
    </>
  );
}
