import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { providerApi } from '@/lib/api/providers';
import { t } from '@/i18n';
const useModel = create<{ id: string | null; choose: (id: string) => void }>(
  (set) => ({ id: null, choose: (id) => set({ id }) }),
);
export function useCaptureModel() {
  const query = useQuery({ queryKey: ['provider'], queryFn: providerApi.list });
  const chosen = useModel((s) => s.id);
  const models = Array.isArray(query.data)
    ? query.data.filter((p) => p.hasKey)
    : [];
  const selected =
    models.find((p) => p.id === chosen) ??
    models.find((p) => p.isDefault) ??
    models[0];
  return { models, selected, pending: query.isPending };
}
export function ModelPicker({ disabled }: { disabled: boolean }) {
  const { models, selected } = useCaptureModel();
  if (!models.length) return null;
  return (
    <select
      className="home-model-picker"
      aria-label={t('home.model')}
      value={selected?.id ?? ''}
      disabled={disabled}
      onChange={(e) => useModel.getState().choose(e.target.value)}
    >
      {models.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.model}
        </option>
      ))}
    </select>
  );
}
