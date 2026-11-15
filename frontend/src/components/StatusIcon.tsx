import type { BadgeIcon } from '../lib/quality';

/** Small shape icons. They repeat what the adjacent text says, so they are hidden from screen readers. */
export default function StatusIcon({ name }: { name: BadgeIcon | 'cross' }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, focusable: false } as const;
  switch (name) {
    case 'check':
      return (
        <svg {...common}>
          <path d="M2 7.5l3.2 3L12 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M7 1.5l6 10.5H1z" fill="currentColor" />
        </svg>
      );
    case 'diamond':
      return (
        <svg {...common}>
          <path d="M7 1l6 6-6 6-6-6z" fill="currentColor" />
        </svg>
      );
    case 'cross':
      return (
        <svg {...common}>
          <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
  }
}
