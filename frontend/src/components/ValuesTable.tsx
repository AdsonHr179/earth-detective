import { isValid, type ChartPoint } from '../lib/chart';
import { formatMonth, formatNumber, parseDate } from '../lib/format';

type ValuesTableProps = {
  points: ChartPoint[];
  unit: string;
  variableName: string;
};

/** The plotted values as a table, for anyone who cannot or would rather not read the chart. Missing months say 'no data'. */
export default function ValuesTable({ points, unit, variableName }: ValuesTableProps) {
  const rows = [...points]
    .filter((point) => Number.isFinite(parseDate(point.date)))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  return (
    <details className="more">
      <summary>Show the values as a table</summary>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">
            {`Monthly values of ${variableName} in ${unit}; months without data are marked no data`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row">{formatMonth(row.date)}</th>
                <td>{isValid(row.value) ? formatNumber(row.value, 2) : 'no data'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
