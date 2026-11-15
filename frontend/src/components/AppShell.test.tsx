import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import AppShell from './AppShell';
import ResultSheet from './ResultSheet';

function Harness({ compact }: { compact: boolean }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <AppShell
      sheetCollapsed={compact && !expanded}
      map={<div>map layer</div>}
      controls={<button type="button">control</button>}
      result={
        <ResultSheet compact={compact} expanded={expanded} onToggle={() => setExpanded((v) => !v)} summary="Ready">
          <p>result content</p>
        </ResultSheet>
      }
    />
  );
}

describe('AppShell and ResultSheet', () => {
  it('renders the map, the controls and the result column on desktop without a toggle', () => {
    render(<Harness compact={false} />);

    expect(screen.getByText('map layer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'control' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Result' })).toBeInTheDocument();
    expect(screen.getByText('result content')).toBeVisible();
    expect(screen.queryByRole('button', { name: /result/i })).not.toBeInTheDocument();
  });

  it('collapses and expands the bottom sheet with aria-expanded on mobile', async () => {
    const user = userEvent.setup();
    render(<Harness compact />);
    const toggle = screen.getByRole('button', { name: /Collapse result/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('result content')).toBeVisible();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Expand result/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('result content')).not.toBeVisible();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /Collapse result/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers a skip link to the result', () => {
    render(<Harness compact={false} />);
    expect(screen.getByRole('link', { name: 'Skip to the result' })).toHaveAttribute('href', '#result');
  });
});
