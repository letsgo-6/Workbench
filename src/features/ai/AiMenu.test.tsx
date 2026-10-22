import { expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AiMenu } from './AiMenu';
import { kinds } from '@/lib/api/content';
it('smart capture remains available only on the dashboard, never in item or batch AI menus', () => {
  for (const entityType of kinds)
    for (const batch of [false, true]) {
      render(<AiMenu refs={[{ entityType, id: 'test' }]} batch={batch} />);
      expect(screen.queryByRole('option', { name: '智能整理' })).toBeNull();
      expect(screen.getByRole('option', { name: '总结要点' })).toBeTruthy();
      cleanup();
    }
});
