import type { EntityType } from '@/types/bindings/EntityType';
import { useContentDetail } from './hooks';
import { EntryDetail } from './EntryDetail';
import { Failure, Loading } from '@/components/common/Feedback';
export function ContentDetail({
  kind,
  id,
  fresh,
  onDelete,
}: {
  kind: EntityType;
  id: string;
  fresh: boolean;
  onDelete: () => void;
}) {
  const query = useContentDetail(kind, id);
  // Inactive queries may contain pre-rename tags. Initialize the editor only
  // after its first refresh; later refreshes must preserve its live draft.
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  if (!query.isFetchedAfterMount || !query.data) return <Loading />;
  return (
    <EntryDetail
      kind={kind}
      item={query.data}
      fresh={fresh}
      onDelete={onDelete}
    />
  );
}
