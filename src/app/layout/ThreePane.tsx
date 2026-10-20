import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import type { ReactNode } from 'react';
export function ThreePane({
  list,
  detail,
}: {
  list: ReactNode;
  detail: ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'workbench-panes',
    storage: localStorage,
  });
  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="three-pane"
    >
      <Panel id="list" defaultSize="34%" minSize="280px" className="list-pane">
        {list}
      </Panel>
      <Separator className="pane-handle" />
      <Panel id="detail" minSize="360px" className="detail-pane">
        {detail}
      </Panel>
    </Group>
  );
}
