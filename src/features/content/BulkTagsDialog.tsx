import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TagInput } from '@/components/common/TagInput';
import { t } from '@/i18n';
export function BulkTagsDialog({
  tags,
  setTags,
  busy,
  confirm,
}: {
  tags: string[] | null;
  setTags: (tags: string[] | null) => void;
  busy: boolean;
  confirm: () => void;
}) {
  return (
    <Dialog
      open={tags !== null}
      onOpenChange={(open) => {
        if (!open) setTags(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.batchTagTitle')}</DialogTitle>
        </DialogHeader>
        <TagInput value={tags ?? []} onChange={setTags} id="batch-tags" />
        <DialogFooter>
          <Button disabled={!tags?.length || busy} onClick={confirm}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
