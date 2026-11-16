import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { adaptBackendAnalysis } from '../api/client';
import { fixtureBackendAnalysis } from '../test/fixtures';
import ResultPanel from './ResultPanel';

// TEST FIXTURES ONLY. No observation or scientific validation is claimed.
describe('ResultPanel V1 states', () => {
  it.each(['descriptive', 'insufficient_data', 'unsupported'] as const)('renders %s without inferential evidence', (status) => {
    const base = fixtureBackendAnalysis();
    const analysis = adaptBackendAnalysis({ ...base, trend: { ...base.trend,
      applicable: status === 'descriptive', inference_status: status, inference_reason: 'TEST FIXTURE: restriction reason.',
      slope_unit: 'deg C per decade', direction: 'stable',
    } });
    const { container } = render(<ResultPanel analysis={analysis} kind="success" stale={false}
      variableName="TEST FIXTURE" onExport={vi.fn()} />);
    expect(screen.getByText('TEST FIXTURE: restriction reason.')).toBeVisible();
    expect(screen.queryByText(/essentially flat|Significant \(p|Slope interval/)).not.toBeInTheDocument();
    expect(screen.queryByText(/per decade per decade/)).not.toBeInTheDocument();
    if (status === 'descriptive') {
      expect(screen.getByText(/descriptive slope.*upward/i)).toBeVisible();
      expect(container.querySelector('line.chart-trend')).not.toBeNull();
      expect(screen.getByText('+0.50 deg C per decade')).toBeInTheDocument();
    } else {
      expect(container.querySelector('line.chart-trend')).toBeNull();
      expect(screen.getByText(status === 'unsupported' ? 'No rate per decade for this variable' : 'No trend estimate')).toBeInTheDocument();
    }
  });
  it('keeps descriptive magnitude consistent when the legacy direction enum is undetermined', () => {
    const base = fixtureBackendAnalysis();
    const analysis = adaptBackendAnalysis({ ...base, trend: { ...base.trend, direction: 'undetermined', inference_status: 'descriptive', inference_reason: 'TEST FIXTURE' } });
    const { container } = render(<ResultPanel analysis={analysis} kind="success" stale={false} variableName="TEST FIXTURE" onExport={vi.fn()} />);
    expect(screen.getByText('+0.50 unit-a per decade')).toBeInTheDocument();
    expect(screen.getByText(/descriptive slope.*upward/i)).toBeVisible();
    expect(container.querySelector('line.chart-trend')).not.toBeNull();
  });
  it('warns for a legacy saved response and preserves its method identity', () => {
    const legacy = fixtureBackendAnalysis();
    delete legacy.trend.inference_status;
    delete legacy.trend.inference_reason;
    render(<ResultPanel analysis={adaptBackendAnalysis(legacy)} kind="success" stale={false}
      variableName="TEST FIXTURE" onExport={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Legacy inference not validated' })).toBeVisible();
    const facts = screen.getByText('Method and sources').closest('details')!;
    expect(within(facts).getByText(/version fixture-method/)).toBeInTheDocument();
    expect(within(facts).queryByText('Slope interval')).not.toBeInTheDocument();
  });
});
