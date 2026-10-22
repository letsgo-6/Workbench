import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/lib/api/app';
export type MotionLevel = 'full' | 'lite' | 'off';
export function useMotionLevel(): MotionLevel {
  const query = useQuery({ queryKey: ['settings'], queryFn: appApi.settings });
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  const setting = query.data?.appearanceMotion;
  return setting === 'off' || setting === 'lite' || setting === 'full'
    ? setting
    : reduced
      ? 'lite'
      : 'full';
}
