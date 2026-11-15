import type { AnalysisResponse } from '../api/client';
import { formatCoordinatePair, formatRetrievedAt } from '../lib/format';
import { formatInterval } from '../lib/sentences';

/** The one-line provenance that sits next to the number. */
export function ProvenanceLine({ analysis }: { analysis: AnalysisResponse }) {
  const parts = [analysis.source, analysis.product, `method ${analysis.method_version}`];
  if (analysis.retrieved_at) parts.push(`retrieved ${formatRetrievedAt(analysis.retrieved_at)}`);
  return <p className="provenance-line">{parts.join(' · ')}</p>;
}

function isHttps(url: string) {
  return /^https:\/\//i.test(url);
}

/** Full provenance: source, product, versions, periods, point and warnings. Only fields the backend returned. */
export default function ProvenanceBlock({ analysis }: { analysis: AnalysisResponse }) {
  const { trend } = analysis;
  const interval = formatInterval(trend.confidence_interval, analysis.unit);
  const point = analysis.spatial_query?.type === 'Point' ? analysis.spatial_query.coordinates : null;

  return (
    <details className="more">
      <summary>Method and sources</summary>
      <dl className="facts">
        <dt>Source</dt>
        <dd>
          {analysis.source}
          {isHttps(analysis.source_url) ? (
            <>
              {' '}
              (<a href={analysis.source_url} target="_blank" rel="noreferrer noopener">provider site</a>)
            </>
          ) : null}
        </dd>
        <dt>Product</dt>
        <dd>{analysis.product}</dd>
        <dt>Dataset version</dt>
        <dd>{analysis.dataset_version}</dd>
        <dt>Method</dt>
        <dd>
          {trend.estimator} · {trend.inference_method} · version {analysis.method_version}
        </dd>
        <dt>Period analysed</dt>
        <dd>{analysis.effective_period}</dd>
        {analysis.retrieved_at ? (
          <>
            <dt>Retrieved</dt>
            <dd>{formatRetrievedAt(analysis.retrieved_at)}</dd>
          </>
        ) : null}
        {point ? (
          <>
            <dt>Point</dt>
            <dd>{formatCoordinatePair(point[1], point[0])}</dd>
          </>
        ) : null}
        <dt>Valid months</dt>
        <dd>
          {analysis.valid_observations} · coverage {analysis.coverage.toFixed(0)}%
          {analysis.quality.hourly_coverage !== null
            ? ` · hourly input coverage ${analysis.quality.hourly_coverage.toFixed(1)}%`
            : ''}
        </dd>
        {interval ? (
          <>
            <dt>Slope interval</dt>
            <dd>{interval}</dd>
          </>
        ) : null}
        <dt>Analysis id</dt>
        <dd>{analysis.analysis_id}</dd>
      </dl>
    </details>
  );
}
