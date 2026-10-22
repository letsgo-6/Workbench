import { useQuery } from '@tanstack/react-query';
import { Plus, Star, Upload, Trash2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { EntityType } from '@/types/bindings/EntityType';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import { AiMenu } from '../ai/AiMenu';
import { useUi } from '@/stores/ui';
import { presetTools } from '@/lib/tools';
export interface ContentFilters {
  q: string;
  tag: string;
  starred: boolean;
  tool: string;
  category: string;
  cards: boolean;
  grouped: boolean;
}
export function ContentHeader({
  kind,
  total,
  filters: f,
  setFilter,
  view,
  onView,
  onCreate,
  onImport,
  tools,
  selectionCount,
  onBulkTags,
  onBulkDelete,
}: {
  kind: EntityType;
  total: number;
  filters: ContentFilters;
  setFilter: <K extends keyof ContentFilters>(
    key: K,
    value: ContentFilters[K],
  ) => void;
  view: string;
  onView: (view: string) => void;
  onCreate: () => void;
  onImport: () => void;
  tools: string[];
  selectionCount: number;
  onBulkTags: () => void;
  onBulkDelete: () => void;
}) {
  const tags = useQuery({ queryKey: ['tags'], queryFn: appApi.tags });
  const categories = useQuery({
    queryKey: ['prompt', 'categories'],
    queryFn: appApi.categories,
    enabled: kind === 'prompt',
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  return (
    <header className="list-header">
      <div className="list-heading">
        <h1>{t(`nav.${kind}`)}</h1>
        <span className="muted">{t('common.count', { count: total })}</span>
        <Button size="icon" aria-label={t('common.new')} onClick={onCreate}>
          <Plus />
        </Button>
      </div>
      <div className="content-search">
        <Search aria-hidden="true" />
        <Input
          id="list-filter"
          placeholder={t('common.filter')}
          aria-label={t('common.filter')}
          value={f.q}
          onChange={(e) => setFilter('q', e.target.value)}
        />
        {f.q && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.clearSearch')}
            onClick={() => setFilter('q', '')}
          >
            <X />
          </Button>
        )}
      </div>
      <div className="filter-row">
        <select
          aria-label={t('common.tags')}
          value={f.tag}
          onChange={(e) => setFilter('tag', e.target.value)}
        >
          <option value="">
            {t('common.tags')} · {t('common.all')}
          </option>
          {tags.data?.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name}
            </option>
          ))}
        </select>
        <Button
          size="icon-sm"
          variant={f.starred ? 'secondary' : 'ghost'}
          aria-label={t('common.starred')}
          aria-pressed={f.starred}
          onClick={() => setFilter('starred', !f.starred)}
        >
          <Star />
        </Button>
      </div>
      {kind === 'todo' && (
        <ToggleGroup
          type="single"
          className="todo-views"
          aria-label={t('nav.todo')}
          value={view}
          onValueChange={(value) => {
            if (value) onView(value);
          }}
        >
          {(['today', 'next7', 'all', 'done'] as const).map((view) => (
            <ToggleGroupItem key={view} value={view} size="sm">
              {t(`todo.${view}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {kind === 'tip' && (
        <>
          <select
            aria-label={t('tip.tools')}
            value={f.tool}
            onChange={(e) => setFilter('tool', e.target.value)}
          >
            <option value="">
              {t('tip.tools')} · {t('common.all')}
            </option>
            {[
              ...new Set([
                ...presetTools,
                ...(settings.data?.tipsCustomTools ?? []),
                ...tools,
              ]),
            ].map((tool) => (
              <option key={tool}>{tool}</option>
            ))}
          </select>
          <div className="filter-row">
            <ToggleGroup
              type="single"
              value={f.cards ? 'cards' : 'list'}
              onValueChange={(value) => {
                if (value) setFilter('cards', value === 'cards');
              }}
            >
              {(['list', 'cards'] as const).map((view) => (
                <ToggleGroupItem key={view} value={view} size="sm">
                  {t(`tip.${view}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <label>
              <input
                type="checkbox"
                checked={f.grouped}
                onChange={(e) => setFilter('grouped', e.target.checked)}
              />
              {t('tip.group')}
            </label>
          </div>
        </>
      )}
      {kind === 'prompt' && (
        <select
          aria-label={t('prompt.category')}
          value={f.category}
          onChange={(e) => setFilter('category', e.target.value)}
        >
          <option value="">
            {t('prompt.category')} · {t('common.all')}
          </option>
          {categories.data?.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      )}
      {kind === 'skill' && (
        <Button variant="outline" onClick={onImport}>
          <Upload data-icon="inline-start" />
          {t('skill.import')}
        </Button>
      )}
      {selectionCount > 0 && (
        <div className="batch-bar">
          <AiMenu
            batch
            refs={useUi
              .getState()
              .selection.map((id) => ({ entityType: kind, id }))}
          />
          <span>{t('common.selected', { count: selectionCount })}</span>
          <Button variant="ghost" size="sm" onClick={onBulkTags}>
            {t('common.bulkTag')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.delete')}
            onClick={onBulkDelete}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </header>
  );
}
