import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optionalColumn } from './optionalColumn.js';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('optionalColumn (routes.sport, migration 135 unapplied)', () => {
  it('retries a write without the column on a schema-cache error, then stops sending it', async () => {
    const col = optionalColumn('routes', 'sport');
    const run = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "Could not find the 'sport' column of 'routes' in the schema cache" } })
      .mockResolvedValue({ data: { id: 'r1' }, error: null });

    const result = await col.write({ name: 'Run', sport: 'running' }, run);
    expect(result.data.id).toBe('r1');
    expect(run).toHaveBeenNthCalledWith(2, { name: 'Run' });
    expect(col.available()).toBe(false);

    await col.write({ name: 'Again', sport: 'running' }, run);
    expect(run).toHaveBeenLastCalledWith({ name: 'Again' });
  });

  it('retries a read without the column', async () => {
    const col = optionalColumn('routes', 'sport');
    const run = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'column routes.sport does not exist' } })
      .mockResolvedValue({ data: [], error: null });
    await col.select('id, name,\n  surface_type, sport, created_at', run);
    expect(run).toHaveBeenLastCalledWith('id, name, surface_type, created_at');
  });

  it('passes other errors through untouched', async () => {
    const col = optionalColumn('routes', 'sport');
    const run = vi.fn().mockResolvedValue({ error: { message: 'permission denied for table routes' } });
    const result = await col.write({ sport: 'cycling' }, run);
    expect(result.error.message).toMatch(/permission/);
    expect(run).toHaveBeenCalledTimes(1);
    expect(col.available()).toBe(true);
  });

  it('does not match another table’s column', () => {
    const col = optionalColumn('routes', 'sport');
    expect(col.isMissingError({ message: 'column calendar_entries.sport does not exist' })).toBe(false);
    expect(col.isMissingError({ message: 'column routes.sport does not exist' })).toBe(true);
    expect(
      col.isMissingError({ message: "Could not find the 'sport' column of 'calendar_entries' in the schema cache" }),
    ).toBe(false);
  });
});
