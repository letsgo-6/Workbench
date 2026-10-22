import { Star, Sparkles, Plus, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Material } from '@/types/bindings/Material';
import { t } from '@/i18n';
import { MediaPreview } from './MediaPreview';
export interface MaterialCardProps {
  item: Material;
  selected: boolean;
  active?: boolean;
  onOpen: (item: Material, event?: React.MouseEvent) => void;
  onSelect: (id: string) => void;
  onStar: (item: Material) => void;
  onPrompt?: (item: Material) => void;
}
export function MaterialCard({
  item,
  selected,
  active = false,
  onOpen,
  onSelect,
  onStar,
  onPrompt,
}: MaterialCardProps) {
  const asset =
    item.assets.find((a) => a.id === item.coverAssetId) ?? item.assets[0];
  let domain = t('material.local');
  if (item.url) {
    try {
      domain = new URL(item.url).hostname;
    } catch {
      domain = item.url;
    }
  }
  return (
    <article
      className={`material-card ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}
    >
      <button
        className="material-cover-button"
        aria-current={active ? 'true' : undefined}
        aria-label={`${t('common.preview')} ${item.title || t('common.untitled')}`}
        onClick={(e) => onOpen(item, e)}
      >
        <MediaPreview key={asset?.id ?? 'empty'} asset={asset} />
      </button>
      <label className="material-select">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`${t('common.select')} ${item.title}`}
          onChange={() => onSelect(item.id)}
        />
      </label>
      {item.kind === 'component' && asset && (
        <span className="material-media-badge">
          {t(
            asset.mediaKind === 'video'
              ? 'material.video'
              : asset.mediaKind === 'gif'
                ? 'material.gif'
                : 'material.image',
          )}
        </span>
      )}
      <div className="material-card-info">
        <div className="material-card-title">
          <button onClick={(e) => onOpen(item, e)}>
            {item.title || t('common.untitled')}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(item.isStarred ? 'common.unstar' : 'common.star')}
            onClick={() => onStar(item)}
          >
            <Star fill={item.isStarred ? 'currentColor' : 'none'} />
          </Button>
        </div>
        <div className="material-card-meta">
          <span title={item.url ?? undefined}>{domain}</span>
          <span>
            <ImageIcon />
            {t('material.filesCount', { count: item.assets.length })}
          </span>
        </div>
        <div className="material-card-bottom">
          <div className="material-card-tags">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag.id}>{tag.name}</span>
            ))}
          </div>
          {onPrompt && (
            <Button variant="outline" size="sm" onClick={() => onPrompt(item)}>
              {item.prompt ? <Sparkles /> : <Plus />}
              {t(item.prompt ? 'material.prompt' : 'material.addPrompt')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
