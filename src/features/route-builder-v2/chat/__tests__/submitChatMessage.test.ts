import { describe, it, expect, vi } from 'vitest';
import { submitChatMessage } from '../submitChatMessage';

function makeArgs(overrides: Partial<Parameters<typeof submitChatMessage>[0]> = {}) {
  const append = vi.fn();
  const setProcessing = vi.fn();
  const markRefused = vi.fn();
  const expand = vi.fn();
  const applyAIEditImpl = vi.fn();

  return {
    args: {
      input: 'make it flatter',
      hasRoute: true,
      append,
      setProcessing,
      markRefused,
      formPanelControl: { expand },
      applyAIEditImpl,
      ...overrides,
    },
    append,
    setProcessing,
    markRefused,
    expand,
    applyAIEditImpl,
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

describe('submitChatMessage — cold start', () => {
  it('expands form panel and appends ack', async () => {
    const { args, append, expand, applyAIEditImpl } = makeArgs({
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
      text: expect.stringMatching(/form/i),
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(applyAIEditImpl).not.toHaveBeenCalled();
  });
});

describe('submitChatMessage — no current route', () => {
  it('refuses chat edits when hasRoute is false', async () => {
    const { args, append, markRefused, applyAIEditImpl } = makeArgs({
      input: 'make it flatter',
      hasRoute: false,
    });

    await submitChatMessage(args);

    expect(applyAIEditImpl).not.toHaveBeenCalled();
    expect(markRefused).toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toMatch(/no route to edit yet/i);
  });
});

describe('submitChatMessage — edit success', () => {
  it('toggles processing, applies edit, appends new-stats ack', async () => {
    const { args, append, setProcessing, applyAIEditImpl } = makeArgs({
      input: 'make it flatter',
    });
    applyAIEditImpl.mockResolvedValue({
      ok: true,
      assistantText: 'Found a flatter route',
      distance_km: 24,
      elevation_gain_m: 60,
    });

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenNthCalledWith(1, true);
    expect(setProcessing).toHaveBeenLastCalledWith(false);
    expect(applyAIEditImpl).toHaveBeenCalledWith('make it flatter');

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toContain('Found a flatter route');
    expect(lastCall.text).toContain('24km');
    expect(lastCall.text).toContain('60m');
  });
});

describe('submitChatMessage — edit failure', () => {
  it('appends a friendly failure message and marks refused', async () => {
    const { args, append, markRefused, setProcessing, applyAIEditImpl } = makeArgs({
      input: 'go to the moon',
    });
    applyAIEditImpl.mockResolvedValue({
      ok: false,
      reason: "I didn't catch that",
    });

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenLastCalledWith(false);
    expect(markRefused).toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/couldn't/i);
    expect(lastCall.text).toMatch(/didn't catch that/i);
  });
});

describe('submitChatMessage — error path', () => {
  it('catches thrown errors and resets processing', async () => {
    const { args, append, setProcessing, applyAIEditImpl } = makeArgs({
      input: 'shorter',
    });
    applyAIEditImpl.mockRejectedValue(new Error('boom'));

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenLastCalledWith(false);
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/hit an error/i);
  });
});
