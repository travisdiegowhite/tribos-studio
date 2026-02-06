import { ensureValidAccessToken } from './tokenManager.js';

// Helper to build a mock supabase client
function mockSupabase(overrides = {}) {
  const defaults = {
    lockResult: { data: { id: 'int-1' }, error: null },
    updateResult: { error: null },
    refreshedIntegration: null
  };
  const opts = { ...defaults, ...overrides };

  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(opts.lockResult)
            })
          }),
          // plain .update().eq() for token persist and lock release
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
      token_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h from now
      refresh_token: 'refresh-123'
    };

    const supabase = mockSupabase();
    const token = await ensureValidAccessToken(integration, supabase);
    expect(token).toBe('still-valid-token');
    // Should not have called supabase at all (no refresh needed)
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('refreshes token when expiring within 6 hours', async () => {
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

    // Build a supabase mock that supports the chained calls
    const updateEqMock = vi.fn().mockReturnThis();
    const updateOrMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'int-1' }, error: null })
      })
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        or: updateOrMock,
        // For the final token persist update
        error: null
      }))
    });

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    };

    const token = await ensureValidAccessToken(integration, supabase);
    expect(token).toBe('new-token');
    expect(fetch).toHaveBeenCalledWith(
      'https://diauth.garmin.com/di-oauth2-service/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when missing Garmin API credentials', async () => {
    delete process.env.GARMIN_CONSUMER_KEY;
    delete process.env.GARMIN_CONSUMER_SECRET;

    const integration = {
      id: 'int-1',
      access_token: 'old-token',
      token_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
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
