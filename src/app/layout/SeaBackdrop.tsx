import { useEffect, useRef, useState } from 'react';
import { useSceneVisibility } from '@/features/home/useSceneVisibility';
import type { MotionLevel } from '@/features/materials/useMotionLevel';

export function SeaBackdrop({ motion }: { motion: MotionLevel }) {
  const video = useRef<HTMLVideoElement>(null);
  const visible = useSceneVisibility();
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const still = motion === 'off' || reduced;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    element.playbackRate = motion === 'lite' ? 0.65 : 1;
    if (visible && ready) {
      void element.play().catch((error: unknown) => {
        if (
          !disposed &&
          !(error instanceof DOMException && error.name === 'AbortError')
        )
          setFailed(true);
      });
    } else element.pause();
    return () => {
      disposed = true;
      element.pause();
    };
  }, [visible, ready, motion, still, failed]);
  return (
    <div
      className="sea-backdrop"
      aria-hidden="true"
      data-state={
        still || failed
          ? 'poster'
          : playing
            ? 'playing'
            : ready
              ? 'paused'
              : 'loading'
      }
    >
      <img src="/scene-media/wake-up-poster.jpg" alt="" />
      {!still && !failed && (
        <video
          ref={video}
          src="/scene-media/wake-up.mp4"
          poster="/scene-media/wake-up-poster.jpg"
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onLoadedData={() => setReady(true)}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />
      )}
      <div className="sea-backdrop-shade" />
    </div>
  );
}
