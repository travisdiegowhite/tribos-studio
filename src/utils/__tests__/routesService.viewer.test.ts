import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../../lib/supabase';
import { getRouteForViewer } from '../routesService';

describe('getRouteForViewer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the public read for a signed-out visitor and marks it not owned', async () => {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: null } as never);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ route: { id: 'r1', name: 'Shared' } }),
    });
    const route = await getRouteForViewer('r1');
    expect(route).toEqual({ id: 'r1', name: 'Shared', is_owner: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.action).toBe('get_public_route');
  });

  it('returns null when a guest asks for a route that is not shared', async () => {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: null } as never);
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await getRouteForViewer('private-1')).toBeNull();
  });
});
