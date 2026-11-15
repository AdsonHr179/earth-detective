import { useEffect, useState } from 'react';
import type { AnalysisResponse } from '../api/client';
import { STALE_NOTICE } from '../hooks/useAnalysis';
import { formatYears, periodYears } from '../lib/format';
import { SHORT_PERIOD_YEARS } from '../lib/quality';
import { headlineNumber, trendSentence } from '../lib/sentences';
import CitationBlock from './CitationBlock';
import ProvenanceBlock, { ProvenanceLine } from './ProvenanceBlock';
import QualityBadges from './QualityBadges';
import StateNotice from './StateNotice';
import TrendChart from './TrendChart';

export const NO_DATA_TITLE = 'No valid observations';
export const NO_DATA_TEXT =
  'The data service returned no usable monthly values for this point and period, so no trend is shown. Nothing was estimated or filled in. Try a longer period or another place.';

type ResultPanelProps = {
  analysis: AnalysisResponse;
  /** 'no-data' when every observation in the series is missing. */
  kind: 'success' | 'no-data';
  /** The choices changed after this result: it is kept on screen but marked out of date. */
  stale: boolean;
  variableName: string;
  regionName?: string;
  circular?: boolean;
  onExport: () => Promise<void>;
};

/** What the result does not tell the reader: scope, causes and the limits of the period. */
function limitsOf(analysis: AnalysisResponse): string[] {
  const years = periodYears(analysis.effective_start_date, analysis.effective_end_date);
  const items = [
    'It is one point, not the whole region or an area average.',
    'It shows change, not what causes it.',
    years > 0 && years < SHORT_PERIOD_YEARS
      ? `A period of ${formatYears(years)} is short: natural variability can look like a trend.`
      : 'A trend over this period describes the past at this point; it does not predict the future.',
  ];
  if (analysis.limitations) items.push(`From the data service: ${analysis.limitations}`);
  return items;
}

export default function ResultPanel({
  analysis,
  kind,
  stale,
  variableName,
  regionName,
  circular = false,
  onExport,
}: ResultPanelProps) {
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    setExportMessage('');
  }, [analysis.analysis_id]);

  if (kind === 'no-data') {
    return (
      <div className="result-body">
        {stale ? <StateNotice tone="warn" title="Out of date">{STALE_NOTICE}</StateNotice> : null}
        <StateNotice tone="warn" title={NO_DATA_TITLE}>
          <p>{NO_DATA_TEXT}</p>
        </StateNotice>
      </div>
    );
  }

  const { trend } = analysis;
  const headline = headlineNumber(trend, analysis.unit);
  const subject = `${variableName} at this point`;
  const warnings = analysis.warnings;

  const handleExport = async () => {
    setExportMessage('Preparing CSV from the backend…');
    try {
      await onExport();
      setExportMessage('CSV downloaded.');
    } catch (error) {
      setExportMessage(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.');
    }
  };

  return (
    <div className={`result-body${stale ? ' result-body--stale' : ''}`}>
      {stale ? (
        <StateNotice tone="warn" title="Out of date">
          {STALE_NOTICE}
        </StateNotice>
      ) : null}

      <h2 className="result-kicker">{variableName} at the selected point</h2>
      <p className="finding">
        <span className={`finding-number${headline.weak ? ' finding-number--weak' : ''}`} aria-hidden="true">
          {headline.value}
        </span>
        {headline.unit ? (
          <span className="finding-unit" aria-hidden="true">
            {headline.unit}
          </span>
        ) : null}
        <span className="visually-hidden">{headline.spoken}</span>
        {stale ? <span className="stale-pill">out of date</span> : null}
      </p>
      <p className="lede">{trendSentence(trend, subject)}</p>
      <ProvenanceLine analysis={analysis} />

      <TrendChart
        points={analysis.chart_points}
        unit={analysis.unit}
        variableName={variableName}
        regionName={regionName}
        periodStart={analysis.effective_start_date}
        periodEnd={analysis.effective_end_date}
        trend={trend}
        circular={circular}
        band={analysis.confidence_band}
      />

      <QualityBadges analysis={analysis} />

      {warnings.length > 0 ? (
        <div className="service-notes">
          <h3>Notes from the data service</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => void handleExport()}>
          Download CSV
        </button>
        <p className="export-status" role="status">
          {exportMessage}
        </p>
      </div>

      <details className="more" open>
        <summary>What this does not tell you</summary>
        <ul className="limits">
          {limitsOf(analysis).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      <ProvenanceBlock analysis={analysis} />
      <CitationBlock analysis={analysis} variableName={variableName} regionName={regionName} />
    </div>
  );
}
