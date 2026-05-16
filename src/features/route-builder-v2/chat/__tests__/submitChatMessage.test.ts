import { describe, it, expect, vi } from 'vitest';
import { submitChatMessage } from '../submitChatMessage';
import type { ExecutorResult } from '../../../../routing/executor';

function makeArgs(overrides: Partial<Parameters<typeof submitChatMessage>[0]> = {}) {
  const append = vi.fn();
  const setProcessing = vi.fn();
  const markRefused = vi.fn();
  const expand = vi.fn();
  const applyMutation = vi.fn();

  return {
    args: {
      input: 'make it hillier',
      hasRoute: true,
      append,
      setProcessing,
      markRefused,
      editing: { applyMutation },
      formPanelControl: { expand },
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
