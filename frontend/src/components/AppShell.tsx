import type { ReactNode } from 'react';

type AppShellProps = {
  /** Map layer, fills the stage. */
  map: ReactNode;
  /** Chips and the run button floating over the map. */
  controls: ReactNode;
  /** Small readouts anchored to the bottom of the map. */
  mapFooter?: ReactNode;
  /** The result column (desktop) or bottom sheet (mobile). */
  result: ReactNode;
  /** Mobile only: the sheet is collapsed to its header, so the map takes the room. */
  sheetCollapsed?: boolean;
};

/** Map-first layout: map stage with floating controls, plus the result panel beside or below it. */
export default function AppShell({ map, controls, mapFooter, result, sheetCollapsed = false }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#result">
        Skip to the result
      </a>
      <main className={`stage${sheetCollapsed ? ' stage--sheet-collapsed' : ''}`}>
        <section className="map-stage" aria-label="Map and choices">
          <div className="map-layer">{map}</div>
          <div className="floating-controls">{controls}</div>
          {mapFooter ? <div className="map-footer">{mapFooter}</div> : null}
        </section>
        {result}
      </main>
    </div>
  );
}
