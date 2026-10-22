import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeOverlay } from './NodeOverlay';
import { sceneLayout } from './scene/layout';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('exposes six ordered named/count buttons; keyboard focus previews immediately and pointer waits 260ms', () => {
  vi.useFakeTimers();
  const open = vi.fn(),
    highlight = vi.fn();
  render(
    <NodeOverlay
      layout={sceneLayout(1440, 900, 180)}
      state={{ phase: 'awake', born: [] }}
      nodes={[
        {
          id: 'todo',
          count: 3,
          overdue: 1,
          recent7: 2,
          latest: [{ id: 'task', title: '原任务', sub: 'overdue' }],
        },
      ]}
      onOpen={open}
      onWake={vi.fn()}
      onHighlight={highlight}
    />,
  );
  const buttons = screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    '灵感池，0',
    '作品素材库，0',
    '待办，3',
    'Agent 技巧，0',
    'Skill 库，0',
    '提示词库，0',
  ]);
  fireEvent.mouseEnter(buttons[2]!);
  expect(screen.queryByText('原任务')).toBeNull();
  fireEvent.focus(buttons[2]!);
  expect(screen.getByText('原任务')).toBeTruthy();
  expect(highlight).toHaveBeenLastCalledWith('todo', true);
  fireEvent.click(screen.getByText('原任务'));
  expect(open).toHaveBeenCalledWith('todo', 'task');
});
it('keeps preview rows out of Tab order and makes all three reachable with arrows', async () => {
  const open = vi.fn();
  render(
    <NodeOverlay
      layout={sceneLayout(1440, 900, 180)}
      state={{ phase: 'awake', born: [] }}
      nodes={[
        {
          id: 'idea',
          count: 3,
          overdue: 0,
          recent7: 3,
          latest: ['a', 'b', 'c'].map((id) => ({
            id,
            title: `预览 ${id}`,
            sub: null,
          })),
        },
      ]}
      onOpen={open}
      onWake={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  const owner = screen.getByRole('button', { name: '灵感池，3' });
  owner.focus();
  fireEvent.focus(owner);
  fireEvent.keyDown(owner, { key: 'ArrowDown' });
  const a = screen.getByRole('button', { name: '预览 a' }),
    b = screen.getByRole('button', { name: '预览 b' }),
    c = screen.getByRole('button', { name: '预览 c' });
  expect(document.activeElement).toBe(a);
  expect(a.tabIndex).toBe(-1);
  fireEvent.keyDown(a, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(b);
  fireEvent.keyDown(b, { key: 'End' });
  expect(document.activeElement).toBe(c);
  await userEvent.keyboard('{Enter}');
  expect(open).toHaveBeenCalledWith('idea', 'c');
  fireEvent.focus(owner);
  fireEvent.keyDown(owner, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('button', { name: '预览 a' }), {
    key: 'Escape',
  });
  expect(document.activeElement).toBe(owner);
  expect(screen.queryByText('预览 a')).toBeNull();
});
