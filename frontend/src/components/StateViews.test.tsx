import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { ErrorState, LoadingState, ReadyState, UnavailableState } from './StateViews';

describe('state views', () => {
  it('ready state says what to do and shows no number', () => {
    render(<ReadyState selection="Variable · Region · 2015-01-01 to 2023-12-31" />);

    expect(
      screen.getByRole('heading', { name: 'Run analysis to read the trend at this point' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Variable · Region · 2015-01-01 to 2023-12-31')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d+/)).not.toBeInTheDocument(); // no number, not even an example
  });

  it('loading state explains the wait and offers Cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<LoadingState onCancel={onCancel} />);

    expect(screen.getByRole('status')).toHaveTextContent('Fetching observations');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('error state is an alert with what happened, what to do and Try again; no raw JSON', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(502, '{"detail":"upstream exploded"}')} onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('What happened: The data provider did not answer correctly.');
    expect(alert).toHaveTextContent('What you can do: Try again in a moment.');
    expect(alert).not.toHaveTextContent('upstream exploded');
    expect(alert).not.toHaveTextContent('{');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error state shows a plain service message when there is one', () => {
    render(<ErrorState error={new ApiError(503, 'Upstream provider unavailable')} onRetry={() => undefined} />);
    expect(screen.getByText('Upstream provider unavailable')).toBeInTheDocument();
  });

  it('unavailable state tells the backend reason', () => {
    render(<UnavailableState message="No validated parameter is configured for this variable." />);
    expect(screen.getByRole('status')).toHaveTextContent('No data for this choice');
    expect(screen.getByText('No validated parameter is configured for this variable.')).toBeInTheDocument();
  });
});
