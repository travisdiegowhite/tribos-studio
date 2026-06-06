import { describe, it, expect, vi } from 'vitest';

let sessionsFixture = [];
vi.mock('./sequencerBlockOps.js', () => ({
  generateSessionsForBlock: () => sessionsFixture,
}));

const { buildProjectionRows } = await import('./sequencerProjection.js');

const TODAY = '2026-06-10';
const RACE = '2026-06-20';

describe('buildProjectionRows', () => {
  it('forward-simulates TFI/AFI/FS across in-window days only', () => {
    sessionsFixture = [
      { date: '2026-06-09', target_rss: 80 }, // before today → excluded
      { date: TODAY, target_rss: 80 },
      { date: '2026-06-11', target_rss: 80 },
      { date: RACE, target_rss: 80 }, // race day → excluded
    ];
    const ctx = { daily_stats: [{ tfi: 50, afi: 40 }] };

    const rows = buildProjectionRows({
      sequenceId: 'seq1',
      userId: 'u1',
      blocks: [{ block_type: 'threshold', start_date: TODAY, end_date: RACE }],
      ctx,
      today: TODAY,
      raceDate: RACE,
    });

    expect(rows.map((r) => r.date)).toEqual([TODAY, '2026-06-11']);
    // RSS (80) above TFI (50) → TFI rises each day; AFI rises faster (shorter tau).
    expect(rows[0].projected_tfi).toBeGreaterThan(50);
    expect(rows[1].projected_tfi).toBeGreaterThan(rows[0].projected_tfi);
    expect(rows[0].projected_fs).toBe(
      Math.round((rows[0].projected_tfi - rows[0].projected_afi) * 100) / 100
    );
  });

  it('defaults the initial state to 42/42 when there is no daily snapshot', () => {
    sessionsFixture = [{ date: TODAY, target_rss: 42 }];
    const rows = buildProjectionRows({
      sequenceId: 'seq1', userId: 'u1',
      blocks: [{ block_type: 'maintenance', start_date: TODAY, end_date: RACE }],
      ctx: { daily_stats: [] }, today: TODAY, raceDate: RACE,
    });
    // RSS == initial TFI/AFI (42) → no change.
    expect(rows[0].projected_tfi).toBe(42);
    expect(rows[0].projected_afi).toBe(42);
  });
});
