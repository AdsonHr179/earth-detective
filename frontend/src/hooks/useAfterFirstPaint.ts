import { useEffect, useState } from 'react';

/** Becomes true once the browser has painted the first frame, so heavy parts can load after it. */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timeout = 0;
    let frame = 0;
    if (typeof window.requestAnimationFrame === 'function') {
      frame = window.requestAnimationFrame(() => {
        timeout = window.setTimeout(() => setReady(true), 0);
      });
    } else {
      timeout = window.setTimeout(() => setReady(true), 0);
    }
    return () => {
      if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  return ready;
}
