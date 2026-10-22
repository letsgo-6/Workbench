import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/lib/api/app';
export function useHomeOverview() {
  return useQuery({
    queryKey: ['home'],
    queryFn: appApi.home,
    refetchOnWindowFocus: false,
  });
}
