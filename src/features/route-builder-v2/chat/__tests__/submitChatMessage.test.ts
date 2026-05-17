import { describe, it, expect, vi } from 'vitest';
import { submitChatMessage } from '../submitChatMessage';
import type { ExecutorResult } from '../../../../routing/executor';

function makeFetch(response: unknown, ok = true): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => response,
  }) as unknown as typeof fetch;
}

function makeArgs(overrides: Partial<Parameters<typeof submitChatMessage>[0]> = {}) {
  const append = vi.fn();
  const setProcessing = vi.fn();
  const markRefused = vi.fn();
  const expand = vi.fn();
  const applyMutation = vi.fn();
  // Default AI fallback returns refusal so the heuristic-refuse path keeps
  // its old assertions working unless a test overrides fetchImpl.
  const defaultFetch = makeFetch({ refusal: "I don't understand that one yet." });

  return {
    args: {
      input: 'make it hillier',
      hasRoute: true,
      append,
      setProcessing,
      markRefused,
      editing: { applyMutation },
      formPanelControl: { expand },
      fetchImpl: defaultFetch,
      ...overrides,
    },
    append,
    setProcessing,
    markRefused,
    expand,
    applyMutation,
  };
}

function successResult(distance = 32, gain = 920): ExecutorResult {
  return {
    ok: true,
    route: {
      geometry: [
        [-105, 40],
        [-105.1, 40.1],
      ],
      waypoints: [{ coordinate: [-105, 40] }, { coordinate: [-105.1, 40.1] }],
      stats: {
        distance_km: distance,
        elevation_gain_m: gain,
        elevation_loss_m: 0,
        duration_s: 1800,
      },
    },
    metadata: {
      provider_used: 'stadia',
      duration_ms: 50,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

describe('submitChatMessage — empty input', () => {
  it('does nothing when input is empty', async () => {
    const { args, append } = makeArgs({ input: '' });
    await submitChatMessage(args);
    expect(append).not.toHaveBeenCalled();
  });

  it('does nothing when input is whitespace', async () => {
    const { args, append } = makeArgs({ input: '   ' });
    await submitChatMessage(args);
    expect(append).not.toHaveBeenCalled();
  });
});

describe('submitChatMessage — refuse', () => {
  it('appends user message, refuse message, and marks refused', async () => {
    const { args, append, markRefused, applyMutation } = makeArgs({
      input: 'tell me a joke',
    });

    await submitChatMessage(args);

    expect(append).toHaveBeenNthCalledWith(1, {
      role: 'user',
      text: 'tell me a joke',
    });
    expect(append).toHaveBeenNthCalledWith(2, {
      role: 'assistant',
      text: expect.stringMatching(/don't understand/i),
    });
    expect(markRefused).toHaveBeenCalled();
    expect(applyMutation).not.toHaveBeenCalled();
  });
});

describe('submitChatMessage — cold start', () => {
  it('expands form panel and appends ack', async () => {
    const { args, append, expand, applyMutation } = makeArgs({
      input: 'build me a 2 hour ride',
    });

    await submitChatMessage(args);

    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenNthCalledWith(1, {
      role: 'user',
      text: 'build me a 2 hour ride',
    });
    expect(append).toHaveBeenNthCalledWith(2, {
      role: 'assistant',
      text: expect.stringMatching(/build|opening the form/i),
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(applyMutation).not.toHaveBeenCalled();
  });
});

describe('submitChatMessage — modify success', () => {
  it('toggles processing, applies mutation, appends ack with new stats', async () => {
    const { args, append, setProcessing, applyMutation } = makeArgs({
      input: 'make it hillier',
    });
    applyMutation.mockResolvedValue(successResult(32, 920));

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenNthCalledWith(1, true);
    expect(setProcessing).toHaveBeenLastCalledWith(false);
    expect(applyMutation).toHaveBeenCalledTimes(1);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toContain('Adding some climbing');
    expect(lastCall.text).toContain('32km');
    expect(lastCall.text).toContain('920m');
  });
});

describe('submitChatMessage — modify failure', () => {
  it('appends a friendly failure message', async () => {
    const { args, append, setProcessing, applyMutation } = makeArgs({
      input: 'less climbing',
    });
    applyMutation.mockResolvedValue({
      ok: false,
      reason: { kind: 'constraint_infeasible', explanation: 'too steep' },
    } as ExecutorResult);

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenLastCalledWith(false);
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/couldn't/i);
    expect(lastCall.text).toMatch(/constraint infeasible/);
  });
});

describe('submitChatMessage — modify with no route', () => {
  it('does not call applyMutation when hasRoute is false', async () => {
    const { args, append, applyMutation } = makeArgs({
      input: 'less climbing',
      hasRoute: false,
    });

    await submitChatMessage(args);

    expect(applyMutation).not.toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/no route to edit yet/i);
  });
});

describe('submitChatMessage — error path', () => {
  it('catches thrown errors and resets processing', async () => {
    const { args, append, setProcessing, applyMutation } = makeArgs({
      input: 'shorter',
    });
    applyMutation.mockRejectedValue(new Error('boom'));

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenLastCalledWith(false);
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/hit an error/i);
  });
});

describe('submitChatMessage — AI fallback success', () => {
  it('falls back to AI translator on heuristic refuse and applies returned mutation', async () => {
    const fetchImpl = makeFetch({
      mutation: { type: 'anchor_at_poi', poi_query: 'coffee shop' },
    });
    const { args, append, applyMutation } = makeArgs({
      input: 'add a coffee stop in Boulder',
      fetchImpl,
    });
    applyMutation.mockResolvedValue(successResult(40, 500));

    await submitChatMessage(args);

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/route-builder-2-chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(applyMutation).toHaveBeenCalledWith({
      type: 'anchor_at_poi',
      poi_query: 'coffee shop',
    });
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toContain('40km');
  });
});

describe('submitChatMessage — AI fallback refusal', () => {
  it('shows AI refusal text and marks refused', async () => {
    const fetchImpl = makeFetch({ refusal: 'Out of scope for me.' });
    const { args, append, markRefused, applyMutation } = makeArgs({
      input: 'do a barrel roll',
      fetchImpl,
    });

    await submitChatMessage(args);

    expect(applyMutation).not.toHaveBeenCalled();
    expect(markRefused).toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toBe('Out of scope for me.');
  });
});

describe('submitChatMessage — AI fallback error', () => {
  it('shows a translator-unavailable message and marks refused on network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { args, append, markRefused } = makeArgs({
      input: 'do something weird',
      fetchImpl,
    });

    await submitChatMessage(args);

    expect(markRefused).toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toMatch(/translator unavailable/i);
  });
});
