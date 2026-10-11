import { describe, it, expect, vi } from 'vitest';
import { RACE_TYPES } from '../../src/utils/raceTypes.js';
import {
  MAX_CANDIDATES,
  RACE_TYPE_VALUES,
  REPORT_RACES_TOOL,
  collectSourceUrls,
  nameKey,
  searchDirectory,
  upsertDirectory,
  validateCandidates,
  webSearchRaces,
} from './raceSearch.js';

const TODAY = '2026-10-11';

/** A recording Supabase stub: each from() call takes the next canned result. */
function fakeSupabase(results) {
  const calls = [];
  const from = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const result = results.shift() ?? { data: null, error: null };
    const chain = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (resolve) => Promise.resolve(result).then(resolve);
          if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result);
          return (...args) => {
            call.ops.push([prop, ...args]);
            return chain;
          };
        },
      },
    );
    return chain;
  };
  return { from, calls };
}

describe('nameKey', () => {
  it('drops years, editions, accents and punctuation', () => {
    expect(nameKey('The 2027 Unbound Gravel 200!')).toBe('the unbound gravel 200');
    expect(nameKey('15th Annual Tour de Café')).toBe('tour de cafe');
    expect(nameKey('  BWR — San Diego ')).toBe('bwr san diego');
  });
});

describe('RACE_TYPE_VALUES', () => {
  it('matches src/utils/raceTypes.js', () => {
    expect(RACE_TYPE_VALUES).toEqual(RACE_TYPES.map((t) => t.value));
  });
});

describe('validateCandidates', () => {
  const race = {
    name: 'Unbound Gravel 200',
    race_date: '2027-05-29',
    date_status: 'announced',
    location: 'Emporia, KS',
    race_type: 'gravel',
    distance_km: 321.9,
    elevation_gain_m: 3000,
    url: 'https://www.unboundgravel.com/races/200',
    note: '',
  };
  const sources = new Set(['https://unboundgravel.com/', 'https://bikereg.com/x']);

  it('keeps a candidate backed by a page the search returned', () => {
    expect(validateCandidates([race], sources, TODAY)).toEqual([
      expect.objectContaining({ name: 'Unbound Gravel 200', site: 'unboundgravel.com', distance_km: 321.9 }),
    ]);
  });

  it('drops a link to a site the search never returned', () => {
    expect(validateCandidates([{ ...race, url: 'https://made-up-race.example/' }], sources, TODAY)).toEqual([]);
  });

  it('counts why candidates were dropped', () => {
    const dropped = {};
    validateCandidates([{ ...race, url: 'https://nope.example/' }, { ...race, race_type: 'bmx' }], sources, TODAY, dropped);
    expect(dropped).toEqual({ host: 1, type: 1 });
  });

  it('keeps an edition more than 15 months out, but flags it', () => {
    const [c] = validateCandidates([{ ...race, race_date: '2028-05-27' }], sources, TODAY);
    expect(c.note).toMatch(/more than a year away/);
  });

  it('drops past dates, bad dates and unknown race types', () => {
    expect(validateCandidates([{ ...race, race_date: '2026-05-30' }], sources, TODAY)).toEqual([]);
    expect(validateCandidates([{ ...race, race_date: 'May 29' }], sources, TODAY)).toEqual([]);
    expect(validateCandidates([{ ...race, race_type: 'bmx' }], sources, TODAY)).toEqual([]);
  });

  it('drops duplicates and caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...race, distance_km: 50 + i }));
    expect(validateCandidates([race, race, ...many], sources, TODAY)).toHaveLength(MAX_CANDIDATES);
  });

  it('treats anything but announced as an estimate, and zero distance as unknown', () => {
    const [c] = validateCandidates([{ ...race, date_status: 'maybe', distance_km: 0 }], sources, TODAY);
    expect(c.date_status).toBe('estimated_from_last_year');
    expect(c.distance_km).toBeNull();
  });
});

describe('collectSourceUrls', () => {
  it('finds URLs in any result block but ignores the report itself', () => {
    const urls = collectSourceUrls([
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.com/1' }] },
      { type: 'text', text: 'x', citations: [{ url: 'https://b.com/2' }] },
      { type: 'tool_use', name: 'report_races', input: { races: [{ url: 'https://fake.com' }] } },
    ]);
    expect([...urls].sort()).toEqual(['https://a.com/1', 'https://b.com/2']);
  });

  it('finds URLs inside code-execution output text (dynamic filtering)', () => {
    const urls = collectSourceUrls([
      {
        type: 'bash_code_execution_tool_result',
        content: { type: 'bash_code_execution_result', stdout: 'Unbound 200 (https://www.unboundgravel.com/races/200), see also https://bikereg.com/unbound.', return_code: 0 },
      },
    ]);
    expect([...urls].sort()).toEqual(['https://bikereg.com/unbound', 'https://www.unboundgravel.com/races/200']);
  });
});

describe('webSearchRaces', () => {
  const searchBlock = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://bikereg.com/boulder-roubaix' }] };
  const report = (races) => ({ type: 'tool_use', id: 't1', name: 'report_races', input: { races } });
  const rbx = {
    name: 'Boulder Roubaix',
    race_date: '2027-04-25',
    date_status: 'estimated_from_last_year',
    location: 'Boulder, CO',
    race_type: 'road_race',
    distance_km: 97,
    elevation_gain_m: null,
    url: 'https://www.bikereg.com/boulder-roubaix',
    note: 'Date not announced.',
  };

  it('sends web search plus the strict report tool, and returns validated candidates', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'tool_use', content: [searchBlock, report([rbx])] });
    const out = await webSearchRaces({ messages: { create } }, { query: 'Boulder Roubaix', near: 'Boulder', today: TODAY });
    expect(out.candidates).toHaveLength(1);
    expect(out.message).toBeNull();
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.tools[0]).toMatchObject({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
    expect(params.tools[1]).toMatchObject({ type: 'web_fetch_20260209', name: 'web_fetch' });
    expect(params.tools[2]).toBe(REPORT_RACES_TOOL);
    expect(params.tool_choice).toBeUndefined();
    expect(params.messages[0].content).toContain('"Boulder Roubaix" near Boulder');
  });

  it('resumes a paused turn by sending it back, and keeps sources from earlier turns', async () => {
    const paused = { stop_reason: 'pause_turn', content: [searchBlock] };
    const create = vi
      .fn()
      .mockResolvedValueOnce(paused)
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [report([rbx])] });
    const out = await webSearchRaces({ messages: { create } }, { query: 'Boulder Roubaix', today: TODAY });
    expect(create).toHaveBeenCalledTimes(2);
    const second = create.mock.calls[1][0].messages;
    expect(second.at(-1)).toEqual({ role: 'assistant', content: paused.content });
    expect(out.candidates).toHaveLength(1);
  });

  it('asks once for the report when the model answers in prose', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [searchBlock, { type: 'text', text: 'Found it.' }] })
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [report([rbx])] });
    const out = await webSearchRaces({ messages: { create } }, { query: 'Boulder Roubaix', today: TODAY });
    expect(create.mock.calls[1][0].messages.at(-1).content).toMatch(/call report_races/);
    expect(out.candidates).toHaveLength(1);
  });

  it('returns an explanation, not candidates, on a refusal or an empty report', async () => {
    const refused = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] });
    expect((await webSearchRaces({ messages: { create: refused } }, { query: 'x race', today: TODAY })).candidates).toEqual([]);
    const empty = vi.fn().mockResolvedValue({ stop_reason: 'tool_use', content: [report([])] });
    const out = await webSearchRaces({ messages: { create: empty } }, { query: 'nothing race', today: TODAY });
    expect(out).toEqual({ candidates: [], message: expect.stringMatching(/Couldn't find/) });
  });
});

describe('searchDirectory', () => {
  it('narrows on distinctive words, so extra words in the query still match', async () => {
    const sb = fakeSupabase([
      {
        data: [
          { id: 'a', name: 'Unbound Gravel XL', name_key: 'unbound gravel xl' },
          { id: 'b', name: 'Unbound Gravel 200', name_key: 'unbound gravel 200' },
        ],
        error: null,
      },
    ]);
    const rows = await searchDirectory(sb, { query: 'Unbound Gravel 200', today: TODAY });
    const ilikes = sb.calls[0].ops.filter((o) => o[0] === 'ilike');
    // 'gravel' is filler and '200' only ranks, so a stored "Unbound Gravel" would match too.
    expect(ilikes).toEqual([['ilike', 'name_key', '%unbound%']]);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('matches on the name key, upcoming only, most-confirmed first', async () => {
    const sb = fakeSupabase([{ data: [{ id: 'd1' }], error: null }]);
    expect(await searchDirectory(sb, { query: 'Unbound 2027', today: TODAY })).toEqual([{ id: 'd1' }]);
    const ops = sb.calls[0].ops;
    expect(ops).toContainEqual(['ilike', 'name_key', '%unbound%']);
    expect(ops).toContainEqual(['gte', 'race_date', TODAY]);
    expect(ops).toContainEqual(['order', 'confirmed_count', { ascending: false }]);
  });

  it('skips the query for fewer than 3 letters', async () => {
    const sb = fakeSupabase([]);
    expect(await searchDirectory(sb, { query: 'ab', today: TODAY })).toEqual([]);
    expect(sb.calls).toHaveLength(0);
  });
});

describe('upsertDirectory', () => {
  const race = { name: 'Boulder Roubaix', race_date: '2027-04-25', race_type: 'road_race', distance_km: 97 };

  it('counts another confirmation of the same race within 3 days, and takes the athlete date', async () => {
    const sb = fakeSupabase([
      { data: [{ id: 'd1', race_date: '2027-04-24', lat: null, lng: null, confirmed_count: 2, url: null }], error: null },
      { data: null, error: null },
    ]);
    expect(await upsertDirectory(sb, race, { url: 'https://x.com' })).toEqual({ action: 'confirmed', id: 'd1' });
    const update = sb.calls[1].ops.find((o) => o[0] === 'update')[1];
    expect(update).toMatchObject({ race_date: '2027-04-25', confirmed_count: 3, url: 'https://x.com' });
  });

  it('treats a same-name race more than 25 km away as a different race', async () => {
    const sb = fakeSupabase([
      { data: [{ id: 'd1', race_date: '2027-04-25', lat: 40.0, lng: -105.3, confirmed_count: 1 }], error: null },
      { data: { id: 'new' }, error: null },
    ]);
    const far = { ...race, lat: 39.0, lng: -105.3 }; // ~111 km south
    expect(await upsertDirectory(sb, far)).toEqual({ action: 'added', id: 'new' });
    const insert = sb.calls[1].ops.find((o) => o[0] === 'insert')[1];
    expect(insert).toMatchObject({ name_key: 'boulder roubaix', source: 'athlete', race_type: 'road_race' });
  });

  it('skips a race without a usable name or date', async () => {
    expect(await upsertDirectory(fakeSupabase([]), { name: '', race_date: '2027-04-25' })).toEqual({ action: 'skipped' });
  });
});
