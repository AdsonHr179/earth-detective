import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixtureAvailability, fixtureRegions, fixtureVariables } from '../test/fixtures';
import ControlsBar, { type ControlsBarProps } from './ControlsBar';

function setup(overrides: Partial<ControlsBarProps> = {}) {
  const handlers = {
    onVariable: vi.fn(),
    onRegion: vi.fn(),
    onStartDate: vi.fn(),
    onEndDate: vi.fn(),
    onPoint: vi.fn(),
    onUseRegionCenter: vi.fn(),
    onRun: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <ControlsBar
      variables={fixtureVariables}
      regions={fixtureRegions}
      variableId="air_temperature"
      regionId="ceara"
      startDate="2015-01-01"
      endDate="2023-12-31"
      point={{ type: 'Point', coordinates: [-39, -5] }}
      pointIsRegionCenter
      availability={fixtureAvailability('air_temperature', 'ceara')}
      onVariable={handlers.onVariable}
      onRegion={handlers.onRegion}
      onStartDate={handlers.onStartDate}
      onEndDate={handlers.onEndDate}
      onPoint={handlers.onPoint}
      onUseRegionCenter={handlers.onUseRegionCenter}
      run={{ onRun: handlers.onRun, disabled: false, attention: false }}
      {...overrides}
    />,
  );
  return { user, ...handlers };
}

const chip = (name: RegExp | string) => screen.getByRole('button', { name });

describe('ControlsBar chips', () => {
  it('shows the current choices on the chips with accessible names', () => {
    setup();

    expect(chip('Variable: Air temperature (TEST FIXTURE)')).toHaveAttribute('aria-expanded', 'false');
    expect(chip('Region: Ceará (TEST FIXTURE)')).toBeInTheDocument();
    expect(chip('Period: 2015–2023')).toBeInTheDocument();
    expect(chip('Point: 5.00° S, 39.00° W')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Earth Detective' })).toBeInTheDocument();
  });

  it('opens the variable list as a radio group and reports the choice', async () => {
    const { user, onVariable } = setup();

    await user.click(chip(/^Variable:/));
    expect(chip(/^Variable:/)).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'Variable' });
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(['air_temperature', 'precipitation']);
    expect(within(dialog).getByRole('radio', { name: 'Air temperature (TEST FIXTURE)' })).toBeChecked();

    await user.click(within(dialog).getByRole('radio', { name: 'Precipitation (TEST FIXTURE)' }));
    expect(onVariable).toHaveBeenCalledWith('precipitation');
  });

  it('lists regions as radios and moves between them with the arrow keys', async () => {
    const { user, onRegion } = setup();

    await user.click(chip(/^Region:/));
    const dialog = screen.getByRole('dialog', { name: 'Region' });
    expect(within(dialog).getByRole('radio', { name: 'Ceará (TEST FIXTURE)' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(onRegion).toHaveBeenCalledWith('northeast_brazil');
  });

  it('edits the period with labelled date fields limited by availability', async () => {
    const { user } = setup();

    await user.click(chip(/^Period:/));
    const dialog = screen.getByRole('dialog', { name: 'Period' });
    const start = within(dialog).getByLabelText('Start date');
    expect(start).toHaveAttribute('min', '2000-01-01');
    expect(within(dialog).getByLabelText('End date')).toHaveAttribute('max', '2024-12-31');
  });

  it('warns when the start date is after the end date', async () => {
    const { user } = setup({ startDate: '2023-12-31', endDate: '2015-01-01' });

    await user.click(chip(/^Period:/));
    expect(screen.getByRole('alert')).toHaveTextContent('The start date must come before the end date.');
  });

  it('closes with Escape and gives focus back to the chip', async () => {
    const { user } = setup();

    await user.click(chip(/^Region:/));
    expect(screen.getByRole('dialog', { name: 'Region' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip(/^Region:/)).toHaveFocus();
  });

  it('runs the analysis from the floating button and can disable it', async () => {
    const first = setup();
    await first.user.click(screen.getByRole('button', { name: 'Run analysis' }));
    expect(first.onRun).toHaveBeenCalledTimes(1);
  });

  it('shows no run button when the run action lives elsewhere (mobile)', () => {
    setup({ run: undefined });
    expect(screen.queryByRole('button', { name: 'Run analysis' })).not.toBeInTheDocument();
  });

  it('disables the run button when asked', () => {
    setup({ run: { onRun: vi.fn(), disabled: true, attention: false } });
    expect(screen.getByRole('button', { name: 'Run analysis' })).toBeDisabled();
  });
});

describe('coordinate fields (keyboard)', () => {
  it('opens from the keyboard, focuses latitude, and applies a typed point with Enter', async () => {
    const { user, onPoint } = setup();

    await user.tab(); // brand has no tab stop; first chip
    while (!chip(/^Point:/).matches(':focus')) await user.tab();
    await user.keyboard('{Enter}');

    const latitude = screen.getByLabelText(/Latitude/);
    expect(latitude).toHaveFocus();
    await user.clear(latitude);
    await user.type(latitude, '-4,25');
    await user.tab();
    const longitude = screen.getByLabelText(/Longitude/);
    expect(longitude).toHaveFocus();
    await user.clear(longitude);
    await user.type(longitude, '-38.5{Enter}');

    expect(onPoint).toHaveBeenCalledWith({ type: 'Point', coordinates: [-38.5, -4.25] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip(/^Point:/)).toHaveFocus();
  });

  it('rejects out-of-range values, explains them and keeps focus in the form', async () => {
    const { user, onPoint } = setup();

    await user.click(chip(/^Point:/));
    const latitude = screen.getByLabelText(/Latitude/);
    await user.clear(latitude);
    await user.type(latitude, '95{Enter}');
    const longitude = screen.getByLabelText(/Longitude/);
    await user.clear(longitude);
    await user.type(longitude, '181{Enter}');

    expect(onPoint).not.toHaveBeenCalled();
    expect(latitude).toHaveAttribute('aria-invalid', 'true');
    expect(longitude).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Latitude must be between −90 and 90.')).toBeInTheDocument();
    expect(screen.getByText('Longitude must be between −180 and 180.')).toBeInTheDocument();
    expect(latitude).toHaveAccessibleDescription('Latitude must be between −90 and 90.');
    expect(screen.getByRole('dialog', { name: 'Point' })).toBeInTheDocument();
  });

  it('rejects an empty or non-numeric field', async () => {
    const { user, onPoint } = setup();

    await user.click(chip(/^Point:/));
    await user.clear(screen.getByLabelText(/Latitude/));
    await user.type(screen.getByLabelText(/Longitude/), '{Enter}');
    expect(onPoint).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a latitude between −90 and 90.')).toBeInTheDocument();
  });

  it('accepts the limits exactly', async () => {
    const { user, onPoint } = setup();

    await user.click(chip(/^Point:/));
    const latitude = screen.getByLabelText(/Latitude/);
    await user.clear(latitude);
    await user.type(latitude, '-90');
    const longitude = screen.getByLabelText(/Longitude/);
    await user.clear(longitude);
    await user.type(longitude, '180{Enter}');

    expect(onPoint).toHaveBeenCalledWith({ type: 'Point', coordinates: [180, -90] });
  });

  it('offers to go back to the region center once a point was chosen', async () => {
    const { user, onUseRegionCenter } = setup({
      point: { type: 'Point', coordinates: [-38.5, -4.5] },
      pointIsRegionCenter: false,
    });

    await user.click(chip(/^Point:/));
    await user.click(screen.getByRole('button', { name: 'Use region center' }));

    expect(onUseRegionCenter).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
