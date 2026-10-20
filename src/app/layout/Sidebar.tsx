import { NavLink, useNavigate } from 'react-router';
import {
  Sun,
  Lightbulb,
  CircleCheck,
  BookOpen,
  Blocks,
  MessageSquareText,
  Trash2,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUi } from '@/stores/ui';
import { flushAll } from '@/hooks/useAutosave';
import { t } from '@/i18n';
import { reportError } from '../providers';
const links = [
  { to: '/', key: 'today', icon: Sun },
  { to: '/ideas', key: 'idea', icon: Lightbulb },
  { to: '/todos', key: 'todo', icon: CircleCheck },
  { to: '/tips', key: 'tip', icon: BookOpen },
  { to: '/skills', key: 'skill', icon: Blocks },
  { to: '/prompts', key: 'prompt', icon: MessageSquareText },
] as const;
export function Sidebar() {
  const collapsed = useUi((s) => s.collapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const palette = useUi((s) => s.setPalette);
  const navigate = useNavigate();
  const link = (to: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    void flushAll()
      .then(() => navigate(to))
      .catch(reportError);
  };
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark">W</span>
        {!collapsed && (
          <div>
            <strong>{t('app.name')}</strong>
            <span>{t('app.subtitle')}</span>
          </div>
        )}
      </div>
      <Button
        variant="outline"
        className="sidebar-search"
        onClick={() => palette(true)}
        title={t('common.search')}
      >
        <Search data-icon="inline-start" />
        {!collapsed && (
          <>
            <span>{t('common.search')}</span>
            <kbd>Ctrl K</kbd>
          </>
        )}
      </Button>
      <nav aria-label={t('app.subtitle')}>
        {links.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={link(to)}
            title={t(`nav.${key}`)}
          >
            <Icon />
            {!collapsed && <span>{t(`nav.${key}`)}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Separator />
        <NavLink to="/trash" onClick={link('/trash')} title={t('nav.trash')}>
          <Trash2 />
          {!collapsed && t('nav.trash')}
        </NavLink>
        <NavLink
          to="/settings"
          onClick={link('/settings')}
          title={t('nav.settings')}
        >
          <Settings />
          {!collapsed && t('nav.settings')}
        </NavLink>
        <div className="sidebar-status">
          {!collapsed && <span>{t('app.local')}</span>}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(collapsed ? 'common.expand' : 'common.collapse')}
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
