import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { materialsApi } from '@/lib/api/materials';
import { Failure, Loading } from '@/components/common/Feedback';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
import { MaterialEditor } from './MaterialEditor';
export function MaterialDrawer({
  id,
  fresh,
  focusPrompt,
  onClose,
  onAdd,
}: {
  id: string;
  fresh: boolean;
  focusPrompt: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const query = useQuery({
    queryKey: ['material', 'detail', id],
    queryFn: () => materialsApi.get(id),
    refetchOnMount: 'always',
  });
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem('material-drawer-width')) || 520,
  );
  const dragging = useRef(false);
  return (
    <aside
      className="material-drawer"
      data-material-drawer
      role="region"
      aria-label={t('material.title')}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={360}
        aria-valuemax={900}
        aria-label={t('material.resize')}
        tabIndex={0}
        className="material-resizer"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current)
            setWidth(
              Math.max(360, Math.min(900, window.innerWidth - event.clientX)),
            );
        }}
        onPointerUp={() => {
          dragging.current = false;
          localStorage.setItem('material-drawer-width', String(width));
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth((value) =>
              Math.max(
                360,
                Math.min(900, value + (event.key === 'ArrowLeft' ? 16 : -16)),
              ),
            );
          }
        }}
      />
      {(query.error || !query.isFetchedAfterMount || !query.data) && (
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      )}
      {query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.isFetchedAfterMount || !query.data ? (
        <Loading />
      ) : (
        <MaterialEditor
          key={id}
          item={query.data}
          fresh={fresh}
          focusPrompt={focusPrompt}
          onClose={onClose}
          onAdd={onAdd}
        />
      )}
    </aside>
  );
}
