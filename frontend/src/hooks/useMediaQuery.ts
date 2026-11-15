import { useEffect, useState } from 'react';

/** Tracks a CSS media query. Reports `false` where matchMedia is unavailable (for example in jsdom). */
export function useMediaQuery(query: string): boolean {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The layout breakpoint: below this width the result is a bottom sheet under a 40% map. */
export const COMPACT_QUERY = '(max-width: 899px)';
