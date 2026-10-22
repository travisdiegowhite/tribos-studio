import { isAiConsentGranted, hasAiConsent, rejectWithoutAiConsent, AI_CONSENT_REQUIRED } from './aiConsent.js';

function supabaseWith(profile, error = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: profile, error }),
  };
  return { from: vi.fn(() => chain) };
}

describe('isAiConsentGranted', () => {
  it('is true only when granted and not withdrawn', () => {
    expect(isAiConsentGranted({ ai_consent_granted_at: '2026-01-01', ai_consent_withdrawn_at: null })).toBe(true);
    expect(isAiConsentGranted({ ai_consent_granted_at: '2026-01-01', ai_consent_withdrawn_at: '2026-02-01' })).toBe(false);
    expect(isAiConsentGranted({ ai_consent_granted_at: null, ai_consent_withdrawn_at: null })).toBe(false);
    expect(isAiConsentGranted(null)).toBe(false);
  });
});

describe('hasAiConsent', () => {
  it('reads the profile', async () => {
    const sb = supabaseWith({ ai_consent_granted_at: '2026-01-01', ai_consent_withdrawn_at: null });
    expect(await hasAiConsent('u1', sb)).toBe(true);
    expect(sb.from).toHaveBeenCalledWith('user_profiles');
  });

  it('fails closed on a lookup error or a missing user', async () => {
    expect(await hasAiConsent('u1', supabaseWith(null, { message: 'boom' }))).toBe(false);
    expect(await hasAiConsent(null, supabaseWith({ ai_consent_granted_at: 'x' }))).toBe(false);
  });
});

describe('rejectWithoutAiConsent', () => {
  function mockRes() {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  }

  it('sends 403 AI_CONSENT_REQUIRED without consent', async () => {
    const res = mockRes();
    expect(await rejectWithoutAiConsent(res, 'u1', supabaseWith({}))).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: AI_CONSENT_REQUIRED }));
  });

  it('lets the request through with consent', async () => {
    const res = mockRes();
    const sb = supabaseWith({ ai_consent_granted_at: '2026-01-01', ai_consent_withdrawn_at: null });
    expect(await rejectWithoutAiConsent(res, 'u1', sb)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
