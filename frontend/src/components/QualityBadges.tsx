import type { AnalysisResponse } from '../api/client';
import { buildBadges } from '../lib/quality';
import StatusIcon from './StatusIcon';

/** Seals about coverage, significance, missing months, short periods and the single-point scope. */
export default function QualityBadges({ analysis }: { analysis: AnalysisResponse }) {
  return (
    <ul className="badges" aria-label="Quality of this reading">
      {buildBadges(analysis).map((badge) => (
        <li key={badge.id} className={`badge badge--${badge.kind}`}>
          <StatusIcon name={badge.icon} />
          {badge.text}
        </li>
      ))}
    </ul>
  );
}
