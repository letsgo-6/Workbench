import { ArrowLeft, Search, Trash2, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { useUi } from '@/stores/ui';
import { routes } from '@/lib/api/content';
import { nodeIds } from '@/features/home/scene/layout';
import { useHomeNavigation } from '@/features/home/navigation';
import { MiniMap } from './MiniMap';
export function ModuleHeader() {
  const navigate = useNavigate();
  const location = useLocation(),
    nav = useHomeNavigation();
  const route = location.pathname.split('/')[1],
    node = nodeIds.find((id) => routes[id] === route);
  const title = node
    ? t(`nav.${node}`)
    : t(route === 'trash' ? 'nav.trash' : 'nav.settings');
  return (
    <header className="module-header">
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('home.back')}
        title={`${t('home.back')} · Esc`}
        onClick={nav.back}
      >
        <ArrowLeft />
        <span>{t('home.homeLabel')}</span>
        <kbd>Esc</kbd>
      </Button>
      <div>
        <h1>{title}</h1>
        <p>{t('home.subtitle')}</p>
      </div>
      <MiniMap current={node} />
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('home.search')}
        onClick={() => useUi.getState().setPalette(true)}
      >
        <Search />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('nav.trash')}
        onClick={() => void navigate('/trash')}
      >
        <Trash2 />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('nav.settings')}
        onClick={() => void navigate('/settings')}
      >
        <Settings />
      </Button>
    </header>
  );
}
