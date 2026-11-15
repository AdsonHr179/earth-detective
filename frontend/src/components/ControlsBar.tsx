import type { AvailabilityResponse, GeoJSONPoint, RegionRecord, VariableRecord } from '../api/client';
import { formatCoordinatePair, formatPeriodShort } from '../lib/format';
import ChipMenu from './ChipMenu';
import PointFields from './PointFields';
import SavedAnalysesMenu from './SavedAnalysesMenu';

export type ControlsBarProps = {
  variables: VariableRecord[];
  regions: RegionRecord[];
  variableId: string;
  regionId: string;
  startDate: string;
  endDate: string;
  /** The point that will be analysed. */
  point: GeoJSONPoint | null;
  /** True when the point is the region center, not a choice. */
  pointIsRegionCenter: boolean;
  availability: AvailabilityResponse | null;
  onVariable: (id: string) => void;
  onRegion: (id: string) => void;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  onPoint: (point: GeoJSONPoint) => void;
  onUseRegionCenter: () => void;
  /** Opens a saved result by id. When missing, the Saved chip is not shown. */
  onOpenSaved?: (analysisId: string) => void;
  /** Desktop: the run button floats here. On mobile it lives in the result sheet instead. */
  run?: { onRun: () => void; disabled: boolean; attention: boolean };
};

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M2 10h16M10 2c-4 4-4 12 0 16M10 2c4 4 4 12 0 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** Brand, the four choice chips (variable, region, period, point) and the run button, floating over the map. */
export default function ControlsBar({
  variables,
  regions,
  variableId,
  regionId,
  startDate,
  endDate,
  point,
  pointIsRegionCenter,
  availability,
  onVariable,
  onRegion,
  onStartDate,
  onEndDate,
  onPoint,
  onUseRegionCenter,
  onOpenSaved,
  run,
}: ControlsBarProps) {
  const variable = variables.find((item) => item.id === variableId);
  const region = regions.find((item) => item.id === regionId);
  const groups = [...new Set(variables.map((item) => item.group))];
  const badRange = Boolean(startDate && endDate && startDate > endDate);
  const pointText = point ? formatCoordinatePair(point.coordinates[1], point.coordinates[0]) : 'Not set';

  return (
    <div className="controls-bar">
      <h1 className="brand">
        <GlobeIcon /> Earth Detective
      </h1>

      <div className="chips" role="group" aria-label="Choose what to explore">
        <ChipMenu label="Variable" value={variable?.name ?? 'Loading…'}>
          {() => (
            <fieldset className="choice-set">
              <legend>Variable</legend>
              {groups.map((group) => (
                <div key={group} role="group" aria-label={group} className="choice-group">
                  <p className="choice-group-title" aria-hidden="true">
                    {group}
                  </p>
                  {variables
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <label key={item.id} className="choice">
                        <input
                          type="radio"
                          name="variable"
                          value={item.id}
                          checked={item.id === variableId}
                          onChange={() => onVariable(item.id)}
                        />
                        <span>{item.name}</span>
                      </label>
                    ))}
                </div>
              ))}
              {variable ? (
                <p className="popover-hint">
                  {variable.description} Unit: {variable.unit}.
                  {variable.trend_supported ? '' : ' A linear trend is not calculated for this variable.'}
                </p>
              ) : null}
            </fieldset>
          )}
        </ChipMenu>

        <ChipMenu label="Region" value={region?.name ?? 'Loading…'}>
          {() => (
            <fieldset className="choice-set">
              <legend>Region</legend>
              {regions.map((item) => (
                <label key={item.id} className="choice">
                  <input
                    type="radio"
                    name="region"
                    value={item.id}
                    checked={item.id === regionId}
                    onChange={() => onRegion(item.id)}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
              <p className="popover-hint">Choose Worldwide to select any point, or use a regional preset.</p>
            </fieldset>
          )}
        </ChipMenu>

        <ChipMenu label="Period" value={formatPeriodShort(startDate, endDate)}>
          {() => (
            <div className="period-fields">
              <div className="field">
                <label htmlFor="start-date">Start date</label>
                <input
                  id="start-date"
                  type="date"
                  min={availability?.start_date ?? undefined}
                  max={availability?.end_date ?? undefined}
                  value={startDate}
                  aria-invalid={badRange ? true : undefined}
                  onChange={(event) => onStartDate(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="end-date">End date</label>
                <input
                  id="end-date"
                  type="date"
                  min={availability?.start_date ?? undefined}
                  max={availability?.end_date ?? undefined}
                  value={endDate}
                  aria-invalid={badRange ? true : undefined}
                  onChange={(event) => onEndDate(event.target.value)}
                />
              </div>
              {badRange ? (
                <p className="field-error" role="alert">
                  The start date must come before the end date.
                </p>
              ) : (
                <p className="popover-hint">A longer period gives a firmer reading. Fewer than 10 years is flagged as short.</p>
              )}
            </div>
          )}
        </ChipMenu>

        <ChipMenu label="Point" value={pointText}>
          {({ close }) => (
            <PointFields
              point={point}
              isRegionCenter={pointIsRegionCenter}
              onApply={onPoint}
              onUseCenter={region?.center ? onUseRegionCenter : undefined}
              onDone={close}
            />
          )}
        </ChipMenu>

        {onOpenSaved ? (
          <div className="chip-wrap--saved">
            <ChipMenu label="Results" value="Saved analyses">
              {({ close }) => (
                <SavedAnalysesMenu
                  variables={variables}
                  regions={regions}
                  onSelect={onOpenSaved}
                  onDone={close}
                />
              )}
            </ChipMenu>
          </div>
        ) : null}
      </div>

      {run ? (
        <button
          type="button"
          className={`run-button${run.attention ? ' run-button--attention' : ''}`}
          onClick={run.onRun}
          disabled={run.disabled}
        >
          Run analysis
        </button>
      ) : null}
    </div>
  );
}
