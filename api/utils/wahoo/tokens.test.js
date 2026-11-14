import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseAdmin.js', () => ({ getSupabaseAdmin: () => { throw new Error('use deps.supabase'); } }));

const { getValidWahooToken, tokenNeedsRefresh, WahooReauthRequired, deauthorizeWahoo } = await import('./tokens.js');

/** Minimal fake of the supabase-js chains tokens.js uses. */
function fakeSupabase({ lockAcquired = true, freshRow = null } = {}) {
  const updates = [];
  const client = {
    updates,
    from() {
      const q = {
        _update: null,
        update(payload) { q._update = payload; updates.push(payload); return q; },
        select() { return q; },
        eq() { return q; },
        or() { return q; },
        maybeSingle: () => Promise.resolve({ data: freshRow, error: null }),
        then(resolve) {
          // update(...).eq().or().select() → lock attempt; other chains just resolve.
          const isLock = q._update && 'refresh_lock_until' in q._update && q._update.refresh_lock_until;
          const data = isLock ? (lockAcquired ? [{ id: 'i1' }] : []) : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return client;
}

const soon = () => new Date(Date.now() + 60 * 1000).toISOString();
const later = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function tokenResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  process.env.WAHOO_CLIENT_ID = 'cid';
  process.env.WAHOO_CLIENT_SECRET = 'secret';
});

describe('tokenNeedsRefresh', () => {
  it('refreshes inside the 5-minute buffer only', () => {
    expect(tokenNeedsRefresh({ token_expires_at: later() })).toBe(false);
    expect(tokenNeedsRefresh({ token_expires_at: soon() })).toBe(true);
    expect(tokenNeedsRefresh({ token_expires_at: null })).toBe(true);
  });
});

describe('getValidWahooToken', () => {
  it('returns the stored token without calling Wahoo when it is still valid', async () => {
    const fetchImpl = vi.fn();
    const supabase = fakeSupabase();
    const token = await getValidWahooToken({ id: 'i1', access_token: 'live', token_expires_at: later() }, { supabase, fetchImpl });
    expect(token).toBe('live');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token, stores the rotated pair and clears the lock', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse(200, { access_token: 'new', refresh_token: 'r2', expires_in: 7200 }));
    const supabase = fakeSupabase();
    const integration = { id: 'i1', access_token: 'old', refresh_token: 'r1', token_expires_at: soon() };
    const token = await getValidWahooToken(integration, { supabase, fetchImpl });

    expect(token).toBe('new');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=r1');
    const saved = supabase.updates.find((u) => u.access_token === 'new');
    expect(saved).toMatchObject({ refresh_token: 'r2', refresh_lock_until: null, refresh_token_invalid: false });
    expect(integration.access_token).toBe('new');
  });

  it('uses the lock holder’s fresh token instead of minting another', async () => {
    const fetchImpl = vi.fn();
    const supabase = fakeSupabase({ lockAcquired: false, freshRow: { access_token: 'theirs', token_expires_at: later() } });
    const token = await getValidWahooToken(
      { id: 'i1', access_token: 'old', refresh_token: 'r1', token_expires_at: soon() },
      { supabase, fetchImpl, lockWaitMs: 0 },
    );
    expect(token).toBe('theirs');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flags the connection for reconnect when Wahoo rejects the refresh token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse(401, { error: 'invalid_grant' }));
    const supabase = fakeSupabase();
    await expect(
      getValidWahooToken({ id: 'i1', access_token: 'old', refresh_token: 'r1', token_expires_at: soon() }, { supabase, fetchImpl }),
    ).rejects.toBeInstanceOf(WahooReauthRequired);
    expect(supabase.updates.some((u) => u.refresh_token_invalid === true && u.status === 'reauth_required')).toBe(true);
  });

  it('does not touch Wahoo for a connection already flagged invalid', async () => {
    const fetchImpl = vi.fn();
    await expect(
      getValidWahooToken({ id: 'i1', refresh_token_invalid: true }, { supabase: fakeSupabase(), fetchImpl }),
    ).rejects.toBeInstanceOf(WahooReauthRequired);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('deauthorizeWahoo', () => {
  it('calls DELETE /v1/permissions and never throws', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await deauthorizeWahoo({ id: 'i1', access_token: 'live', token_expires_at: later() }, { supabase: fakeSupabase(), fetchImpl });
    expect(result).toEqual({ revoked: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.wahooligan.com/v1/permissions', expect.objectContaining({ method: 'DELETE' }));

    const failing = await deauthorizeWahoo({ id: 'i1', refresh_token_invalid: true }, { supabase: fakeSupabase(), fetchImpl });
    expect(failing.revoked).toBe(false);
  });
});
