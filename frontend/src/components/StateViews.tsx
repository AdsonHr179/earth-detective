import type { ReactNode } from 'react';
import { describeFailure } from '../lib/errors';
import StateNotice from './StateNotice';

/** What the result column shows before any analysis was run: an honest 'ready', never an example number. */
export function ReadyState({
  selection, needsPoint = false, children,
}: { selection: string; needsPoint?: boolean; children?: ReactNode }) {
  return (
    <div className="ready-state">
      <p className="result-kicker">Ready</p>
      <h2 className="ready-title">
        {needsPoint ? 'Choose a point anywhere in the world' : 'Run analysis to read the trend at this point'}
      </h2>
      <p className="ready-selection">{selection}</p>
      <p className="ready-help">
        {needsPoint
          ? 'Click the map or enter coordinates in Point. Then select Run analysis.'
          : 'The result shows the rate of change per decade for the selected grid cell, along with coverage and sources.'}
      </p>
      {children}
    </div>
  );
}

/** While the request is running: what is happening and a way out. */
export function LoadingState({ onCancel }: { onCancel: () => void }) {
  return (
    <StateNotice
      tone="info"
      title="Fetching observations…"
      actions={
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      }
    >
      <p>Asking the data provider for monthly values, then estimating the trend. This can take a little while.</p>
      <div className="skeleton" aria-hidden="true" />
      <div className="skeleton skeleton--medium" aria-hidden="true" />
      <div className="skeleton skeleton--short" aria-hidden="true" />
    </StateNotice>
  );
}

/** A failure explained by what happened and what to do. Never raw JSON. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const failure = describeFailure(error);
  return (
    <StateNotice
      tone="error"
      role="alert"
      title={failure.title}
      actions={
        failure.retryable && onRetry ? (
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
        ) : undefined
      }
    >
      <p>
        <strong>What happened:</strong> {failure.what}
      </p>
      <p>
        <strong>What you can do:</strong> {failure.action}
      </p>
      {failure.detail ? (
        <p className="service-message">
          Message from the service: <span>{failure.detail}</span>
        </p>
      ) : null}
    </StateNotice>
  );
}

/** The catalog (variables and regions) is still loading. */
export function CatalogLoadingState() {
  return (
    <StateNotice tone="info" title="Loading the list of variables and regions…">
      <div className="skeleton" aria-hidden="true" />
      <div className="skeleton skeleton--medium" aria-hidden="true" />
    </StateNotice>
  );
}

/** The backend says this variable and region cannot be analysed. */
export function UnavailableState({ message }: { message: string }) {
  return (
    <StateNotice tone="warn" title="No data for this choice">
      <p>{message}</p>
      <p>Pick another variable or region to continue.</p>
    </StateNotice>
  );
}
