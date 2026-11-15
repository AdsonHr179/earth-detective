import { useEffect, useState } from 'react';
import type { AnalysisResponse } from '../api/client';
import { buildCitation } from '../lib/citation';

type CitationBlockProps = {
  analysis: AnalysisResponse;
  variableName: string;
  regionName?: string;
};

/** "Cite this result": the citation text and a copy button. Falls back to selectable text if copying is blocked. */
export default function CitationBlock({ analysis, variableName, regionName }: CitationBlockProps) {
  const [message, setMessage] = useState('');
  const citation = buildCitation(analysis, { variableName, regionName });

  useEffect(() => {
    setMessage('');
  }, [analysis.analysis_id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setMessage('Citation copied.');
    } catch {
      setMessage('Could not copy automatically. Select the text above and copy it.');
    }
  };

  return (
    <details className="more">
      <summary>Cite this result</summary>
      <blockquote className="citation-text">{citation}</blockquote>
      <button type="button" className="button" onClick={() => void copy()}>
        Copy citation
      </button>
      <p className="citation-status" role="status">
        {message}
      </p>
    </details>
  );
}
