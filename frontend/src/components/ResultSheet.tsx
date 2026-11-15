import type { ReactNode } from 'react';

type ResultSheetProps = {
  /** True on narrow screens, where the result is a bottom sheet that can be collapsed. */
  compact: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** Always-visible line on the sheet header (for example the current state). */
  summary?: string;
  /** Mobile only: the primary action stays reachable while the sheet is collapsed. */
  action?: ReactNode;
  children: ReactNode;
};

/** The result column on desktop; on mobile a bottom sheet with a toggle button (aria-expanded). */
export default function ResultSheet({
  compact,
  expanded,
  onToggle,
  summary,
  action,
  children,
}: ResultSheetProps) {
  return (
    <aside id="result" className={`result-sheet${compact ? ' result-sheet--compact' : ''}`} aria-label="Result">
      {compact ? (
        <div className="sheet-header">
          <button
            type="button"
            className="sheet-toggle"
            aria-expanded={expanded}
            aria-controls="result-body"
            onClick={onToggle}
          >
            <span className="sheet-grip" aria-hidden="true" />
            <span className="sheet-toggle-text">
              {expanded ? 'Collapse result' : 'Expand result'}
              {summary ? <span className="sheet-summary"> · {summary}</span> : null}
            </span>
          </button>
          {action}
        </div>
      ) : null}
      <div id="result-body" className="result-scroll" hidden={compact && !expanded}>
        {children}
      </div>
    </aside>
  );
}
