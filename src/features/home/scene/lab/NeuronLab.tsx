import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { SeaBackdrop } from '@/app/layout/SeaBackdrop';
import { appApi } from '@/lib/api/app';
import { t } from '@/i18n';
import { mountRenderer } from '../boot';
import { emptyVisuals, nodeIds, sceneLayout } from '../layout';
import { readSceneTheme } from '../theme';
import { loadMainRenderer } from '../renderers/load';
import type {
  MotionLevel,
  NeuronRenderer,
  NodeId,
  NodeVisual,
  SceneEvent,
  ScenePhase,
} from '../types';
export function NeuronLab() {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<NeuronRenderer | null>(null);
  const [kind, setKind] = useState('main'),
    [motion, setMotion] = useState<MotionLevel>('full'),
    [dark, setDark] = useState(
      document.documentElement.classList.contains('dark'),
    );
  const [node, setNode] = useState<NodeId>('material'),
    [visual, setVisual] = useState(emptyVisuals),
    [phase, setPhase] = useState<ScenePhase>('forming');
  const [metrics, setMetrics] = useState({ fps: 0, frameMs: 0, frames: 0 }),
    thinking = useRef(false);
  useEffect(() => {
    const previous = document.documentElement.classList.contains('dark');
    return () => {
      document.documentElement.classList.toggle('dark', previous);
      void appApi
        .settings()
        .then((s) =>
          document.documentElement.classList.toggle(
            'dark',
            s.appearanceTheme === 'dark' ||
              (s.appearanceTheme === 'system' &&
                matchMedia('(prefers-color-scheme: dark)').matches),
          ),
        )
        .catch(() => {});
    };
  }, []);
  useEffect(() => {
    const previousMotion = document.documentElement.dataset.motion;
    document.documentElement.dataset.motion = motion;
    return () => {
      if (previousMotion)
        document.documentElement.dataset.motion = previousMotion;
      else delete document.documentElement.dataset.motion;
    };
  }, [motion]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (host.current) renderer.current?.setTheme(readSceneTheme(host.current));
  }, [dark]);
  const applyVisual = useEffectEvent((r: NeuronRenderer) => r.setNodes(visual));
  useEffect(() => {
    const target = host.current!;
    let disposed = false,
      instance: NeuronRenderer | undefined,
      stop: (() => void) | undefined;
    const layout = () =>
      instance?.resize(
        sceneLayout(innerWidth, innerHeight, 130, devicePixelRatio),
      );
    const metrics = (e: Event) => setMetrics((e as CustomEvent).detail);
    target.addEventListener('scene-metrics', metrics);
    window.addEventListener('resize', layout);
    void mountRenderer(
      target,
      motion,
      kind === 'main' ? loadMainRenderer : undefined,
    ).then((r) => {
      if (disposed) {
        r.destroy();
        return;
      }
      instance = r;
      renderer.current = r;
      layout();
      r.setMotion(motion);
      r.setTheme(readSceneTheme(target));
      applyVisual(r);
      stop = r.onSignal((s) => {
        if (s.type === 'formed') {
          setPhase('dormant');
          r.setPhase('dormant');
        }
        if (s.type === 'awake') setPhase('awake');
      });
      r.setPhase('forming');
      r.resume();
    });
    const visibility = () => {
      if (document.hidden) instance?.pause();
      else instance?.resume();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      stop?.();
      instance?.destroy();
      renderer.current = null;
      target.removeEventListener('scene-metrics', metrics);
      window.removeEventListener('resize', layout);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [kind, motion]);
  useEffect(() => {
    renderer.current?.setNodes(visual);
  }, [visual]);
  const changePhase = (p: ScenePhase) => {
    setPhase(p);
    renderer.current?.setPhase(p);
  };
  const emit = (event: SceneEvent) => {
    void renderer.current?.emit(event);
  };
  const toggle = (
    key: keyof Pick<NodeVisual, 'hover' | 'pending' | 'dropTarget' | 'overdue'>,
  ) => {
    const at = key === 'overdue' ? 'todo' : node;
    setVisual((v) => ({ ...v, [at]: { ...v[at], [key]: !v[at][key] } }));
  };
  return (
    <div className="neuron-lab">
      <SeaBackdrop motion={motion} />
      <div className="neuron-renderer" ref={host} />
      <Link className="home-topbar" to="/">
        {t('home.closeLab')}
      </Link>
      <output className="lab-metrics" aria-live="off">
        {phase} · {metrics.fps.toFixed(1)} FPS · {metrics.frameMs.toFixed(2)}{' '}
        ms/frame · {metrics.frames}
      </output>
      <section className="lab-controls" aria-label={t('home.lab')}>
        <label>
          {t('home.renderer')}{' '}
          <select
            aria-label={t('home.renderer')}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="main">{t('home.main')}</option>
            <option value="static">{t('home.static')}</option>
          </select>
        </label>
        <label>
          {t('home.motion')}{' '}
          <select
            aria-label={t('home.motion')}
            value={motion}
            onChange={(e) => setMotion(e.target.value as MotionLevel)}
          >
            {(['full', 'lite', 'off'] as const).map((v) => (
              <option key={v} value={v}>
                {t(
                  v === 'full'
                    ? 'material.motionFull'
                    : v === 'lite'
                      ? 'material.motionLite'
                      : 'material.motionOff',
                )}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setDark((d) => !d)}>
          {t('home.theme')} · {t(dark ? 'settings.dark' : 'settings.light')}
        </button>
        <select
          aria-label={t('home.map')}
          value={node}
          onChange={(e) => setNode(e.target.value as NodeId)}
        >
          {nodeIds.map((n) => (
            <option key={n} value={n}>
              {t(`nav.${n}`)}
            </option>
          ))}
        </select>
        <button onClick={() => changePhase('forming')}>
          {t('home.replay')}
        </button>
        {(['forming', 'dormant', 'growing', 'awake'] as const).map((p) => (
          <button key={p} onClick={() => changePhase(p)}>
            {t(`home.${p}`)}
          </button>
        ))}
        {(['hover', 'pending', 'dropTarget', 'overdue'] as const).map((v) => (
          <button
            key={v}
            aria-pressed={
              v === 'overdue' ? visual.todo.overdue : visual[node][v]
            }
            onClick={() => toggle(v)}
          >
            {t(v === 'overdue' ? 'home.overdueToggle' : `home.${v}`)}
          </button>
        ))}
        <button
          onClick={() =>
            emit({
              type: 'absorb',
              from: new DOMRect(
                innerWidth * 0.25,
                innerHeight - 100,
                innerWidth * 0.5,
                50,
              ),
              amount: 40,
            })
          }
        >
          {t('home.absorb')}
        </button>
        <button
          onClick={() => {
            thinking.current = !thinking.current;
            emit({ type: 'thinking', on: thinking.current });
          }}
        >
          {t('home.thinking')}
        </button>
        <button
          onClick={() => emit({ type: 'orb', to: node, strength: 'event' })}
        >
          {t('home.orb')}
        </button>
        <button
          onClick={() =>
            emit({ type: 'orb', to: node, strength: 'event', reverse: true })
          }
        >
          {t('home.reverse')}
        </button>
        <button
          onClick={() => emit({ type: 'orb', to: node, strength: 'ambient' })}
        >
          {t('home.ambient')}
        </button>
        <button onClick={() => emit({ type: 'land', at: 'idea' })}>
          {t('home.land')}
        </button>
        <button
          onClick={() => {
            void renderer.current?.zoom(node, 'in');
          }}
        >
          {t('home.zoomIn')}
        </button>
        <button
          onClick={() => {
            void renderer.current?.zoom(node, 'out');
          }}
        >
          {t('home.zoomOut')}
        </button>
      </section>
    </div>
  );
}
