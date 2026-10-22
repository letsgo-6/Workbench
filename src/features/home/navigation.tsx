import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { flushAll } from '@/hooks/useAutosave';
import { routes } from '@/lib/api/content';
import { toast } from 'sonner';
import type { MotionLevel, NeuronRenderer, NodeId } from './scene/types';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const loaders: Record<NodeId, () => Promise<unknown>> = {
  idea: () => import('../ideas/IdeaPage'),
  material: () => import('../materials/MaterialPage'),
  todo: () => import('../todos/TodoPage'),
  tip: () => import('../tips/TipPage'),
  skill: () => import('../skills/SkillPage'),
  prompt: () => import('../prompts/PromptPage'),
};
interface Navigation {
  enter: (node: NodeId, id?: string) => void;
  back: () => void;
  register: (renderer: NeuronRenderer | null, motion: MotionLevel) => void;
  transition: string;
}
const Context = createContext<Navigation | null>(null);
export function useHomeNavigation() {
  const value = useContext(Context);
  if (!value) throw Error('Home navigation provider missing');
  return value;
}
export function HomeNavigation({ children }: { children: ReactNode }) {
  const navigate = useNavigate(),
    location = useLocation();
  const runtime = useRef<{
    renderer: NeuronRenderer | null;
    motion: MotionLevel;
  }>({ renderer: null, motion: 'off' });
  const busy = useRef(false);
  const queued = useRef<(() => void) | null>(null);
  const pathname = useRef(location.pathname);
  useEffect(() => {
    pathname.current = location.pathname;
  }, [location.pathname]);
  const [transition, setTransition] = useState('');
  const run = async (node: NodeId, id?: string, back = false) => {
    if (busy.current) {
      queued.current = () => {
        void run(node, id, back);
      };
      return;
    }
    busy.current = true;
    try {
      await flushAll();
      if (!back) await loaders[node]();
      const { renderer, motion } = runtime.current;
      const duration = motion === 'off' ? 0 : motion === 'lite' ? 300 : 600;
      if (pathname.current === '/' && !back) {
        setTransition('leaving-home');
        await wait(motion === 'off' ? 0 : 200);
        const zoom = renderer?.zoom(node, 'in');
        await wait(duration / 2);
        await navigate(`/${routes[node]}${id ? `/${id}` : ''}`, {
          state: { fromHome: node },
        });
        setTransition('entering-module');
        await zoom;
        await wait(motion === 'off' ? 0 : 320);
      } else if (back) {
        setTransition('leaving-module');
        await wait(motion === 'off' ? 0 : 200);
        await navigate('/', { state: { from: node } });
        setTransition('returning-home');
        await renderer?.zoom(node, 'out');
      } else {
        setTransition('switching-module');
        await wait(motion === 'off' ? 0 : 180);
        await navigate(`/${routes[node]}${id ? `/${id}` : ''}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTransition('');
      busy.current = false;
      const next = queued.current;
      queued.current = null;
      next?.();
    }
  };
  const node =
    (Object.keys(routes) as NodeId[]).find(
      (n) => location.pathname.split('/')[1] === routes[n],
    ) ?? 'idea';
  return (
    <Context
      value={{
        enter: (n, id) => {
          void run(n, id);
        },
        back: () => {
          void run(node, undefined, true);
        },
        register: (renderer, motion) => {
          runtime.current = { renderer, motion };
        },
        transition,
      }}
    >
      {children}
    </Context>
  );
}
