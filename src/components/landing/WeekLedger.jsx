import HandTick from '../ui/HandTick';

// "A plan that bends when your week does" — an example week as a ledger,
// with the one moved session marked by hand. Static example content.

const WEEK = [
  { day: 'Mon', session: 'Rest', planned: '—', ridden: '—' },
  { day: 'Tue', session: 'Threshold 3 × 12', planned: '110', ridden: '114', done: true },
  { day: 'Wed', session: 'Endurance 90 min', planned: '70', ridden: '0', moved: 'work ran late → Friday' },
  { day: 'Thu', session: 'VO2 5 × 4', planned: '95', ridden: '98', done: true },
  { day: 'Fri', session: 'Endurance 90 min', planned: '70', ridden: '—', note: 'Moved here' },
  { day: 'Sat', session: 'Long ride, 4 hours', planned: '175', ridden: '—' },
  { day: 'Sun', session: 'Easy spin', planned: '40', ridden: '—' },
];

export default function WeekLedger() {
  return (
    <section className="lp-wrap">
      <div className="lp-week">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 className="lp-h2">A plan that bends when your week does.</h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            Missed Wednesday? The load moves, not the whole block. Every change shows up on your
            calendar with a note saying why.
          </p>
        </div>

        <div className="lp-ledger-sheet">
        <table className="lp-ledger">
          <caption>An example week. Numbers are ride stress (RSS).</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Session</th>
              <th scope="col" className="num">Planned</th>
              <th scope="col" className="num">Ridden</th>
              <th scope="col" className="note-col">Note</th>
            </tr>
          </thead>
          <tbody>
            {WEEK.map((row) => (
              <tr key={row.day}>
                <td>{row.day}</td>
                <td
                  style={row.moved ? { textDecoration: 'line-through', color: 'var(--color-text-muted)' } : undefined}
                >
                  {row.session}
                </td>
                <td className="num">{row.planned}</td>
                <td className="num" style={row.done ? { color: 'var(--color-done)' } : undefined}>
                  {row.ridden}
                </td>
                <td className="note-col" style={{ color: 'var(--color-text-muted)' }}>
                  {row.done && (
                    <span style={{ color: 'var(--color-done)' }}>
                      <HandTick size={18} />{' '}
                      Done
                    </span>
                  )}
                  {row.moved && <span className="tribos-hand" style={{ fontSize: 22 }}>{row.moved}</span>}
                  {row.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
