import { useQuery } from '@tanstack/react-query';
import { providerApi } from '@/lib/api/providers';
export function useAiAvailable() {
  const query = useQuery({ queryKey: ['provider'], queryFn: providerApi.list });
  return {
    available: Array.isArray(query.data) && query.data.some((p) => p.hasKey),
    pending: query.isPending,
  };
}
