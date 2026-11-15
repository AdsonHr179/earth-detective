import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type ChipMenuProps = {
  /** Name of the choice, for example 'Variable'. */
  label: string;
  /** Current value, shown on the chip. */
  value: string;
  children: (api: { close: () => void }) => ReactNode;
};

const FOCUSABLE = 'input:checked, input:not([type="radio"]), button, select, [href]';

/**
 * A chip that opens a small panel (a non-modal dialog). The chip is a button with aria-expanded.
 * Escape closes it and returns focus to the chip; clicking or tabbing away closes it too.
 */
export default function ChipMenu({ label, value, children }: ChipMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      className="chip-wrap"
      ref={wrapRef}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !wrapRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="chip-label" aria-hidden="true">
          {label}
        </span>
        <span className="chip-value" aria-hidden="true">
          {value}
        </span>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open ? (
        <div className="popover" id={panelId} role="dialog" aria-label={label} ref={panelRef}>
          {children({ close })}
        </div>
      ) : null}
    </div>
  );
}
