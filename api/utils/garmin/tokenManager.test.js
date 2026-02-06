import { ensureValidAccessToken } from './tokenManager.js';

// Helper to build a mock supabase client with RPC support
function mockSupabase(overrides = {}) {
  const defaults = {
    rpcResult: { data: { acquired: true, lock_until: new Date().toISOString() }, error: null },
    updateResult: { error: null },
    refreshedIntegration: null
  };
  const opts = { ...defaults, ...overrides };

  return {
    rpc: vi.fn().mockResolvedValue(opts.rpcResult),
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'int-1' }, error: null })
            })
          }),
          ...opts.updateResult
        })
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: opts.refreshedIntegration,
            error: null
          })
        })
      })
    })
  };
}

describe('ensureValidAccessToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GARMIN_CONSUMER_KEY = 'test-key';
    process.env.GARMIN_CONSUMER_SECRET = 'test-secret';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns existing token if not expiring within 6 hours', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'still-valid-token',
      token_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      refresh_token: 'refresh-123'
    };

    const supabase = mockSupabase();
    const token = await ensureValidAccessToken(integration, supabase);
    expect(token).toBe('still-valid-token');
    // Should not have called supabase or rpc at all
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('acquires lock via RPC and refreshes token', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1h from now
      refresh_token: 'refresh-123'
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 86400
      })
    });

    const supabase = mockSupabase();
    const token = await ensureValidAccessToken(integration, supabase);

    expect(token).toBe('new-token');
    expect(supabase.rpc).toHaveBeenCalledWith('acquire_token_refresh_lock', {
      p_integration_id: 'int-1',
      p_lock_duration_seconds: 30
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://diauth.garmin.com/di-oauth2-service/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when lock is held and other process did not refresh', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
      refresh_token: 'refresh-123'
    };

    const supabase = mockSupabase({
      rpcResult: {
        data: {
          acquired: false,
          reason: 'locked',
          access_token: 'old-token',
          token_expires_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      },
      refreshedIntegration: {
        access_token: 'old-token',
        token_expires_at: new Date(Date.now() - 1000).toISOString() // still expired
      }
    });

    await expect(ensureValidAccessToken(integration, supabase))
      .rejects.toThrow('Token refresh lock held by another process');
  }, 10000);

  it('returns refreshed token when lock is held by another process that succeeded', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: 'refresh-123'
    };

    const freshExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const supabase = mockSupabase({
      rpcResult: {
        data: {
          acquired: false,
          reason: 'locked',
          access_token: 'old-token',
          token_expires_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      },
      refreshedIntegration: {
        access_token: 'other-process-refreshed-token',
        token_expires_at: freshExpiry
      }
    });

    const token = await ensureValidAccessToken(integration, supabase);
    expect(token).toBe('other-process-refreshed-token');
  }, 10000);

  it('falls back to direct lock when RPC is not deployed', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: 'refresh-123'
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 86400
      })
    });

    const supabase = mockSupabase({
      rpcResult: { data: null, error: { message: 'function not found' } }
    });

    const token = await ensureValidAccessToken(integration, supabase);
    expect(token).toBe('new-token');
    // Should have tried RPC first, then fallen back to direct update
    expect(supabase.rpc).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalled();
  });

  it('throws when missing Garmin API credentials', async () => {
    delete process.env.GARMIN_CONSUMER_KEY;
    delete process.env.GARMIN_CONSUMER_SECRET;

    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: 'refresh-123'
    };

    await expect(ensureValidAccessToken(integration, mockSupabase()))
      .rejects.toThrow('Missing Garmin API credentials');
  });

  it('throws when no refresh token available', async () => {
    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: null
    };

    await expect(ensureValidAccessToken(integration, mockSupabase()))
      .rejects.toThrow('No refresh token available');
  });
});
