import { useCallback, useEffect, useState } from 'react';
import { fetchSavedAnalyses, type RegionRecord, type SavedAnalysisSummary, type VariableRecord } from '../api/client';
import { describeFailure } from '../lib/errors';
import { formatPeriodShort, formatRetrievedAt } from '../lib/format';

type SavedAnalysesMenuProps = {
  variables: VariableRecord[];
  regions: RegionRecord[];
  /** Opens one saved result. */
  onSelect: (analysisId: string) => void;
  /** Closes the popover and returns focus to its chip. */
  onDone: () => void;
};

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: SavedAnalysisSummary[] }
  | { status: 'error'; error: unknown };

/** The list of results the backend saved earlier. It is fetched when the menu opens, never invented. */
export default function SavedAnalysesMenu({ variables, regions, onSelect, onDone }: SavedAnalysesMenuProps) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchSavedAnalyses(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', items: Array.isArray(items) ? items : [] });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return (
    <div className="saved-menu">
      <p className="saved-title" id="saved-title">
        Saved analyses
      </p>

      {state.status === 'loading' ? (
        <p className="saved-status" role="status">
          Loading saved analyses…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="saved-status" role="alert">
          <p>{describeFailure(state.error).what}</p>
          <button type="button" className="button" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="saved-status" role="status">
          No saved analyses yet.
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="saved-list" aria-labelledby="saved-title">
          {state.items.map((item) => {
            const variable = variables.find((entry) => entry.id === item.variable_id)?.name ?? item.variable_id;
            const region = regions.find((entry) => entry.id === item.region_id)?.name ?? item.region_id;
            return (
              <li key={item.analysis_id}>
                <button
                  type="button"
                  className="saved-item"
                  onClick={() => {
                    onSelect(item.analysis_id);
                    onDone();
                  }}
                >
                  <span className="saved-item-main">
                    {variable} · {region} · {formatPeriodShort(item.start_date, item.end_date)}
                  </span>
                  <span className="saved-item-meta">
                    {item.product} · retrieved {formatRetrievedAt(item.retrieved_at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
