import { useEffect, useId, useRef, useState } from 'react';
import { ImageOff, Film, Image as ImageIcon } from 'lucide-react';
import type { MaterialAsset } from '@/types/bindings/MaterialAsset';
import { assetUrl } from '@/lib/api/materials';
import { t } from '@/i18n';
import { previewPool } from './playback';
import { useMotionLevel } from './useMotionLevel';
export function MediaPreview({
  asset,
  detail = false,
}: {
  asset?: MaterialAsset;
  detail?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const id = useId();
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  const motion = useMotionLevel();
  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible(
          entries[0]?.isIntersecting === true &&
            (entries[0]?.intersectionRatio ?? 0) >= 0.6,
        ),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (detail) return () => previewPool.reserve(id, false);
    const update = () => {
      const rect = host.current?.getBoundingClientRect();
      previewPool.update(id, {
        player,
        eligible:
          visible &&
          !failed &&
          document.visibilityState !== 'hidden' &&
          (motion === 'full' || (motion === 'lite' && hover)),
        distance: rect
          ? Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2)
          : Infinity,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      previewPool.remove(id);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [id, asset?.id, detail, visible, hover, motion, failed]);
  const thumbnail = asset?.thumbPath ? assetUrl(asset.thumbPath) : undefined;
  const missing = !asset || asset.missing || failed;
  return (
    <div
      className={`material-media ${detail ? 'material-media-detail' : ''}`}
      ref={host}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {missing ? (
        <div className="material-placeholder">
          {asset ? <ImageOff /> : <ImageIcon />}
          <span>
            {t(asset ? 'material.fileMissing' : 'material.noPreview')}
          </span>
        </div>
      ) : asset.mediaKind === 'video' ? (
        detail ||
        (visible &&
          (thumbnail || motion === 'full' || (motion === 'lite' && hover))) ? (
          <video
            ref={video}
            src={assetUrl(asset.path)}
            poster={thumbnail}
            muted={!detail}
            loop={!detail}
            playsInline
            controls={detail}
            preload={detail ? 'metadata' : 'none'}
            onError={() => setFailed(true)}
            onPlay={() => {
              if (detail) previewPool.reserve(id, true);
            }}
            onPause={() => {
              if (detail) previewPool.reserve(id, false);
            }}
            aria-label={asset.originalName}
          />
        ) : thumbnail ? (
          <img src={thumbnail} loading="lazy" alt={asset.originalName} />
        ) : (
          <div className="material-placeholder">
            <Film />
            <span>{t('material.video')}</span>
          </div>
        )
      ) : asset.mediaKind === 'gif' &&
        (motion === 'off' || (!visible && !detail)) &&
        !thumbnail ? (
        <div className="material-placeholder">
          <ImageIcon />
          <span>{t('material.gif')}</span>
        </div>
      ) : (
        <img
          src={
            asset.mediaKind === 'gif' && (detail || visible) && motion !== 'off'
              ? assetUrl(asset.path)
              : asset.mediaKind === 'gif'
                ? thumbnail
                : detail
                  ? assetUrl(asset.path)
                  : (thumbnail ?? assetUrl(asset.path))
          }
          alt={asset.originalName}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
