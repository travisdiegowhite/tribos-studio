import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub the enhanced-context collector so the throwing variant doesn't try
// to touch the real Supabase client during a unit test.
vi.mock('./enhancedContext', () => ({
  EnhancedContextCollector: {
    gatherDetailedPreferences: vi.fn().mockResolvedValue({}),
    buildEnhancedRoutePrompt: vi.fn().mockReturnValue('test-prompt'),
  },
}));

import {
  generateClaudeRoutesOrThrow,
  ClaudeRouteServiceError,
  CLAUDE_TIMEOUT_MS,
} from './claudeRouteService';

const baseParams = {
  startLocation: [-105, 40],
  timeAvailable: 90,
  trainingGoal: 'endurance',
  routeType: 'road',
  targetDistanceKm: 30,
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  // @ts-expect-error -- jsdom global
  global.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown = {}) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('generateClaudeRoutesOrThrow', () => {
  it('throws ClaudeRouteServiceError with reason "claude_empty" on empty suggestions', async () => {
    fetchSpy.mockResolvedValue(okResponse({ success: true, content: 'no json here' }));

    await expect(generateClaudeRoutesOrThrow(baseParams as never)).rejects.toMatchObject({
      name: 'ClaudeRouteServiceError',
      reason: 'claude_empty',
    });
  });

  it('throws with reason "claude_error" on non-OK HTTP status', async () => {
    fetchSpy.mockResolvedValue(errorResponse(429, { error: 'rate limited' }));

    await expect(generateClaudeRoutesOrThrow(baseParams as never)).rejects.toBeInstanceOf(
      ClaudeRouteServiceError
    );
  });

  it('throws with reason "claude_error" when success:false', async () => {
    fetchSpy.mockResolvedValue(okResponse({ success: false, error: 'auth' }));

    await expect(generateClaudeRoutesOrThrow(baseParams as never)).rejects.toMatchObject({
      reason: 'claude_error',
    });
  });

  it('throws with reason "claude_timeout" when the request is aborted', async () => {
    fetchSpy.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal | undefined;
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    vi.useFakeTimers();
    const promise = generateClaudeRoutesOrThrow(baseParams as never);
    // Attach the rejection handler before advancing, then push past the
    // 15s timeout — the async variant flushes microtasks so the pre-fetch
    // auth-header await resolves and the timeout actually gets armed.
    const expectation = expect(promise).rejects.toMatchObject({ reason: 'claude_timeout' });
    await vi.advanceTimersByTimeAsync(CLAUDE_TIMEOUT_MS + 100);
    await expectation;
    vi.useRealTimers();
  });
});
