import { useEffect, useMemo, useState } from 'react';
import { fetchVariables, type VariableRecord } from './api/client';

function App() {
  const [variables, setVariables] = useState<VariableRecord[]>([]);
  const [selectedVariable, setSelectedVariable] = useState('air_temperature');
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    fetchVariables()
      .then((items) => {
        setVariables(items);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }, []);

  const activeVariable = useMemo(
    () => variables.find((item) => item.id === selectedVariable) ?? variables[0],
    [selectedVariable, variables],
  );

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Earth observation</p>
          <h1>Earth Detective</h1>
        </div>
        <button type="button" className="secondary-button">
          Example analysis
        </button>
      </header>

      <section className="panel grid-layout">
        <div className="controls-column">
          <label htmlFor="variable">Variable</label>
          <select
            id="variable"
            value={selectedVariable}
            onChange={(event) => setSelectedVariable(event.target.value)}
          >
            {variables.map((variable) => (
              <option key={variable.id} value={variable.id}>
                {variable.name}
              </option>
            ))}
          </select>

          {status === 'error' ? (
            <p className="error-text">The catalog could not be loaded.</p>
          ) : null}

          {activeVariable ? (
            <article className="summary-card">
              <h2>{activeVariable.name}</h2>
              <p>{activeVariable.description}</p>
              <dl>
                <div>
                  <dt>Unit</dt>
                  <dd>{activeVariable.unit}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{activeVariable.source}</dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>

        <div className="map-card">
          <div className="map-placeholder">
            <span>Map selection</span>
          </div>
          <div className="region-list">
            <button type="button" className="selected-region">Ceará</button>
            <button type="button">Northeast Brazil</button>
          </div>
        </div>
      </section>

      <section className="panel result-grid">
        <div className="chart-card">
          <h2>Trend view</h2>
          <div className="chart-placeholder">Monthly series + linear trend</div>
        </div>
        <div className="metric-card">
          <h2>Trend summary</h2>
          <ul>
            <li>Direction: increasing</li>
            <li>Rate per decade: +0.42 °C</li>
            <li>Significance: p-value 0.03</li>
            <li>Confidence interval: [0.10, 0.74]</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

export default App;
