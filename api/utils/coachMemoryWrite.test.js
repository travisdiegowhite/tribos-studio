import { describe, it, expect, vi } from 'vitest';
import { memoryExpiresAt, saveCoachMemory } from './coachMemoryWrite.js';

const NOW = new Date('2026-10-18T12:00:00Z');

describe('memoryExpiresAt', () => {
  it('a dated memory expires after its event day', () => {
    expect(memoryExpiresAt({ memory_type: 'long', until: '2026-10-24' }, NOW)).toBe('2026-10-26T00:00:00.000Z');
  });

  it('keeps the type defaults without a date', () => {
    expect(memoryExpiresAt({ memory_type: 'short' }, NOW)).toBe('2026-10-25T12:00:00.000Z');
    expect(memoryExpiresAt({ memory_type: 'medium' }, NOW)).toBe('2026-11-17T12:00:00.000Z');
    expect(memoryExpiresAt({ memory_type: 'long' }, NOW)).toBeNull();
  });

  it('ignores a malformed until', () => {
    expect(memoryExpiresAt({ memory_type: 'long', until: 'next week' }, NOW)).toBeNull();
  });
});

function fakeSupabase(existing) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => Promise.resolve({ data: existing }),
    insert,
  };
  return { client: { from: () => chain }, insert };
}

describe('saveCoachMemory', () => {
  it('skips an identical active memory', async () => {
    const { client, insert } = fakeSupabase([{ id: 'm1', content: 'A race is  The Hustle CX' }]);
    const r = await saveCoachMemory(client, 'u1', { memory_type: 'long', category: 'goal', content: 'a race is the hustle cx' }, { now: NOW });
    expect(r).toEqual({ saved: false, duplicate: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts with the until-derived expiry', async () => {
    const { client, insert } = fakeSupabase([]);
    const r = await saveCoachMemory(client, 'u1', { memory_type: 'long', category: 'goal', content: '10K on Oct 31', until: '2026-10-31' }, { now: NOW });
    expect(r).toEqual({ saved: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', category: 'goal', expires_at: '2026-11-02T00:00:00.000Z',
    }));
  });
});
