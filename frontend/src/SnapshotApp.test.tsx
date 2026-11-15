import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import SnapshotApp, { type SnapshotManifest } from './SnapshotApp';
import { server } from './test/server';
import { fixtureBackendAnalysis, fixtureRegions, fixtureVariables } from './test/fixtures';

vi.mock('./components/LazyMap', () => ({ default: ({ readOnly }: { readOnly: boolean }) =>
  <div>TEST FIXTURE map {readOnly ? 'read only' : 'editable'}</div> }));

const record = fixtureBackendAnalysis({
  source: 'NASA POWER TEST FIXTURE', retrieved_at: '2000-01-02T03:04:05Z',
  trend: { ...fixtureBackendAnalysis().trend, inference_status: 'descriptive',
    inference_reason: 'TEST FIXTURE: inference not validated.', significant: null, p_value: null, confidence_interval: null },
});
const manifest: SnapshotManifest = {
  kind: 'archived-nasa-observations', backend_integration_sha: 'TEST-FIXTURE-REVISION',
  analysis_id: record.analysis_id, analysis_path: '/snapshots/test-fixture.json', csv_path: '/snapshots/test-fixture.csv',
  artifact_sha256: 'a'.repeat(64), csv_sha256: 'b'.repeat(64), region: fixtureRegions[0], variable: fixtureVariables[0],
};

describe('static edition (TEST FIXTURES, never NASA observations)', () => {
  it('opens the archived record with fixed inputs and never calls the live API', async () => {
    const api = vi.fn();
    server.use(
      http.get('*/snapshots/manifest.json', () => HttpResponse.json(manifest)),
      http.get('*/snapshots/test-fixture.json', () => HttpResponse.json(record)),
      http.all('*/api/v1/*', () => { api(); return new HttpResponse(null, { status: 500 }); }),
    );
    render(<SnapshotApp />);
    expect(await screen.findByText('Descriptive estimate only')).toBeVisible();
    expect(screen.getByText(/This edition shows a saved record from a real NASA query/)).toBeVisible();
    expect(screen.getByText('No live NASA queries')).toBeVisible();
    expect(screen.getByText('TEST FIXTURE map read only')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Run analysis' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download saved JSON' })).toHaveAttribute('href', manifest.analysis_path);
    expect(api).not.toHaveBeenCalled();
  });
  it('recovers a static load failure by retrying the archive, without generating substitute data', async () => {
    let attempts = 0;
    server.use(
      http.get('*/snapshots/manifest.json', () => ++attempts === 1
        ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(manifest)),
      http.get('*/snapshots/test-fixture.json', () => HttpResponse.json(record)),
    );
    const user = userEvent.setup();
    render(<SnapshotApp />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Descriptive estimate only')).toBeVisible();
    expect(attempts).toBe(2);
  });
  it('rejects an external asset path before requesting that resource', async () => {
    const external = vi.fn();
    server.use(
      http.get('*/snapshots/manifest.json', () => HttpResponse.json({ ...manifest, analysis_path: 'https://example.invalid/not-an-archive.json' })),
      http.get('https://example.invalid/*', () => { external(); return HttpResponse.json(record); }),
    );
    render(<SnapshotApp />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(external).not.toHaveBeenCalled();
    expect(screen.queryByText('Descriptive estimate only')).not.toBeInTheDocument();
  });
});
