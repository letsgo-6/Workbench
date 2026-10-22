import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { ContentMenu } from './ContentMenu';
import { bindSceneKeys } from '@/lib/keymap';
import { useUi } from '@/stores/ui';
import type { Entry } from '@/lib/api/content';
vi.mock('../ai/AiMenu', () => ({ AiMenu: () => null }));
it('an open content menu blocks digits and Escape closes it before clearing selection or navigating', () => {
  const close = vi.fn(),
    enter = vi.fn(),
    back = vi.fn();
  useUi.getState().setSelection(['a']);
  const unbind = bindSceneKeys({ home: false, enter, back });
  const view = render(
    <MemoryRouter>
      <ContentMenu
        kind="idea"
        context={{ item: { id: 'a', isStarred: false } as Entry, x: 10, y: 10 }}
        onClose={close}
        run={vi.fn()}
        remove={async () => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('menu').getAttribute('data-state')).toBeNull();
  fireEvent.keyDown(document.body, { key: '2' });
  expect(enter).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  expect(useUi.getState().selection).toEqual(['a']);
  expect(back).not.toHaveBeenCalled();
  view.unmount();
  unbind();
  useUi.getState().setSelection([]);
});
