import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { appApi } from '@/lib/api/app';
import { useUi } from '@/stores/ui';
import { localDate } from '@/lib/date';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useMotionLevel } from '../materials/useMotionLevel';
import { QuickInput } from './HomeComposer';
import { useHomeDrop } from './useHomeDrop';
import { useSceneVisibility } from './useSceneVisibility';
import { useHomeOverview } from './useHomeOverview';
import { useHomeNavigation } from './navigation';
import { NodeOverlay } from './NodeOverlay';
import { SceneController, type SceneState } from './scene/controller';
import { HomeEvents } from './scene/events';
import { homeBus } from './scene/bus';
import { emptyVisuals, nodeIds, sceneLayout } from './scene/layout';
import { readSceneTheme } from './scene/theme';
import { loadMainRenderer } from './scene/renderers/load';
import { mountRenderer } from './scene/boot';
import type { NeuronRenderer, NodeId } from './scene/types';
interface Runtime {
  renderer: NeuronRenderer;
  controller: SceneController;
  events: HomeEvents;
}
export function HomeStage() {
  const location = useLocation(),
    navigate = useNavigate(),
    nav = useHomeNavigation();
  const active = location.pathname === '/',
    motion = useMotionLevel();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: appApi.settings,
  });
  const overview = useHomeOverview(),
    client = useQueryClient();
  const stage = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(() =>
    sceneLayout(innerWidth, innerHeight, 180, devicePixelRatio),
  );
  const [state, setState] = useState<SceneState>({
    phase: 'forming',
    born: ['idea'],
  });
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [pending, setPending] = useState<NodeId[]>([]),
    [highlight, setHighlight] = useState<NodeId | null>(null),
    [focus, setFocus] = useState(false);
  const visible = useSceneVisibility();
  const dragging = useHomeDrop(active, runtime?.events, (id) =>
    nav.enter('material', id),
  );
  const first = useRef(true);
  const wakeRequested = useRef(false);
  const queuedEvents = useRef<Parameters<typeof homeBus.emit>[0][]>([]);
  const off = motion === 'off';
  const visuals = useMemo(() => {
    const nodes = emptyVisuals(),
      max = Math.max(0, ...(overview.data?.nodes.map((n) => n.recent7) ?? []));
    for (const id of nodeIds) {
      const n = overview.data?.nodes.find((n) => n.id === id);
      nodes[id] = {
        hover: highlight === id,
        focus: highlight === id && focus,
        pending: pending.includes(id),
        dropTarget: id === 'material' && dragging,
        activity: max ? Math.log1p(n?.recent7 ?? 0) / Math.log1p(max) : 0,
        overdue: Boolean(n?.overdue),
      };
    }
    return nodes;
  }, [overview.data, pending, highlight, focus, dragging]);
  const refresh = useEffectEvent(() => {
    void client.invalidateQueries({ queryKey: ['home'] });
  });
  const intro = settings.data?.homeIntro ?? 'daily';
  const ready = !settings.isPending;
  useEffect(() => {
    if (!ready || !host.current) return;
    let disposed = false,
      created: Runtime | undefined;
    // HTML has already committed before the renderer is mounted.
    const frame = requestAnimationFrame(() => {
      void (async () => {
        const renderer = await mountRenderer(
          host.current!,
          off ? 'off' : 'full',
          loadMainRenderer,
          (error) => {
            console.warn('Neuron renderer fallback', error);
            toast(t('home.fallback'));
          },
        );
        if (disposed) {
          renderer.destroy();
          return;
        }
        const controller = new SceneController(renderer, {
          motion: off ? 'off' : 'full',
          intro: first.current ? intro : 'never',
          date: localDate(),
          storage: localStorage,
          change: setState,
        });
        first.current = false;
        created = {
          renderer,
          controller,
          events: new HomeEvents(renderer, () => refresh()),
        };
        setRuntime(created);
        controller.start();
      })();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      created?.events.destroy();
      created?.controller.destroy();
    };
    // Switching off replaces the renderer; other motion changes use the interface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off, ready]);
  useEffect(() => {
    runtime?.controller.setMotion(motion);
    runtime?.events.setMotion(motion);
    nav.register(runtime?.renderer ?? null, motion);
  }, [runtime, motion, nav]);
  useEffect(() => {
    runtime?.controller.setActive(active && visible);
    runtime?.events.setActive(active && visible);
  }, [runtime, active, visible]);
  useEffect(() => {
    if (!stage.current) return;
    const measure = () => {
      const target = stage.current;
      if (!target) return;
      const r = target.getBoundingClientRect();
      setLayout(
        sceneLayout(
          r.width,
          r.height,
          composer.current?.getBoundingClientRect().height ?? 180,
          devicePixelRatio,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage.current);
    if (composer.current) observer.observe(composer.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    runtime?.renderer.resize(layout, { animate: motion !== 'off' });
  }, [runtime, layout, motion]);
  useEffect(() => {
    runtime?.renderer.setNodes(visuals);
    runtime?.controller.setOverdue(visuals.todo.overdue);
  }, [runtime, visuals]);
  useEffect(() => {
    if (!runtime || !host.current) return;
    const apply = () =>
      runtime.renderer.setTheme(readSceneTheme(host.current!));
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [runtime]);
  const receive = useEffectEvent((e: Parameters<typeof homeBus.emit>[0]) => {
    if (!runtime) {
      queuedEvents.current.push(e);
      return;
    }
    if (e.type === 'replay') {
      runtime?.controller.replay();
      return;
    }
    if (e.type === 'analyzing' || e.type === 'direct')
      runtime?.controller.wake();
    if (e.type === 'preview') setPending(e.nodes);
    if (e.type === 'highlight') {
      setHighlight(e.node);
      setFocus(false);
    }
    void runtime?.events
      .handle(e)
      .catch((error) => console.warn('Home event failed', error));
  });
  useEffect(() => homeBus.on((e) => receive(e)), []);
  useEffect(() => {
    if (runtime) {
      refresh();
      if (wakeRequested.current) {
        wakeRequested.current = false;
        runtime.controller.wake();
      }
      const queued = queuedEvents.current;
      queuedEvents.current = [];
      queued.forEach((e) => receive(e));
    }
  }, [runtime]);
  return (
    <div
      data-motion={motion}
      ref={stage}
      className={`home-stage ${active ? '' : 'home-hidden'}`}
      aria-hidden={!active}
      inert={!active}
      data-phase={state.phase}
    >
      <div ref={host} className="neuron-renderer" />
      <div className="home-chrome">
        <NodeOverlay
          layout={layout}
          state={state}
          nodes={overview.data?.nodes ?? []}
          onWake={() => {
            if (runtime) runtime.controller.wake();
            else wakeRequested.current = true;
          }}
          onOpen={nav.enter}
          onHighlight={(id, f) => {
            setHighlight(id);
            setFocus(f);
          }}
        />
        <div className="home-composer" ref={composer}>
          <QuickInput active={active} />
          {dragging && (
            <p role="status" className="home-drop-hint">
              {t('home.drop')}
            </p>
          )}
          {overview.error && (
            <button
              className="home-data-status"
              onClick={() => void overview.refetch()}
            >
              {t('home.failed')}
            </button>
          )}
        </div>
        <header className="home-topbar">
          <strong>{t('home.title')}</strong>
          <nav>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('home.search')}
              onClick={() => useUi.getState().setPalette(true)}
            >
              <Search />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('nav.trash')}
              onClick={() => void navigate('/trash')}
            >
              <Trash2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('nav.settings')}
              onClick={() => void navigate('/settings')}
            >
              <Settings />
            </Button>
          </nav>
        </header>
      </div>
    </div>
  );
}
