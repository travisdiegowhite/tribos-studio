import { describe, it, expect, vi } from 'vitest';
import { submitChatMessage } from '../submitChatMessage';

function makeArgs(overrides: Partial<Parameters<typeof submitChatMessage>[0]> = {}) {
  const append = vi.fn();
  const setProcessing = vi.fn();
  const markRefused = vi.fn();
  const expand = vi.fn();
  const persistTurn = vi.fn().mockResolvedValue(undefined);
  const applyAIEditImpl = vi.fn();

  return {
    args: {
      input: 'make it flatter',
      hasRoute: true,
      routeId: 'route-1',
      conversationHistory: [],
      append,
      setProcessing,
      markRefused,
      formPanelControl: { expand },
      persistTurn,
      applyAIEditImpl,
      ...overrides,
    },
    append,
    setProcessing,
    markRefused,
    expand,
    persistTurn,
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
  it('toggles processing, applies edit, appends new-stats ack when route changed', async () => {
    const { args, append, setProcessing, persistTurn, applyAIEditImpl } = makeArgs({
      input: 'make it flatter',
      conversationHistory: [{ role: 'user', content: 'earlier' }],
    });
    applyAIEditImpl.mockResolvedValue({
      ok: true,
      assistantText: 'Found a flatter route',
      distance_km: 24,
      elevation_gain_m: 60,
      routeChanged: true,
    });

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenNthCalledWith(1, true);
    expect(setProcessing).toHaveBeenLastCalledWith(false);
    expect(applyAIEditImpl).toHaveBeenCalledWith(
      'make it flatter',
      [{ role: 'user', content: 'earlier' }],
      'route-1',
    );

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toContain('Found a flatter route');
    expect(lastCall.text).toContain('24.0 km');
    expect(lastCall.text).toContain('60 m');
    expect(persistTurn).toHaveBeenCalledWith('make it flatter', lastCall.text);
  });

  it('omits the stats suffix when the route did not change', async () => {
    const { args, append, persistTurn, applyAIEditImpl } = makeArgs({
      input: 'how long is this?',
    });
    applyAIEditImpl.mockResolvedValue({
      ok: true,
      assistantText: 'It runs about 24km — what would you like to change?',
      distance_km: 24,
      elevation_gain_m: 60,
      routeChanged: false,
    });

    await submitChatMessage(args);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toBe('It runs about 24km — what would you like to change?');
    expect(lastCall.text).not.toMatch(/climbing\./);
    expect(persistTurn).toHaveBeenCalledWith('how long is this?', lastCall.text);
  });
});

describe('submitChatMessage — edit failure', () => {
  it('appends a friendly failure message and marks refused', async () => {
    const { args, append, markRefused, setProcessing, persistTurn, applyAIEditImpl } =
      makeArgs({ input: 'go to the moon' });
    applyAIEditImpl.mockResolvedValue({
      ok: false,
      reason: "I didn't catch that",
    });

    await submitChatMessage(args);

    expect(setProcessing).toHaveBeenLastCalledWith(false);
    expect(markRefused).toHaveBeenCalled();
    expect(persistTurn).not.toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toMatch(/couldn't/i);
    expect(lastCall.text).toMatch(/didn't catch that/i);
  });
});

describe('submitChatMessage — generate fresh route', () => {
  it('build phrasing calls the generator and reports the new route', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 40,
      elevation_gain_m: 520,
      name: 'Hilly 40km loop',
    });
    const { args, append, persistTurn, applyAIEditImpl } = makeArgs({
      input: 'build me a hilly 40km loop from downtown',
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    expect(onGenerateFromPrompt).toHaveBeenCalledWith('build me a hilly 40km loop from downtown');
    expect(applyAIEditImpl).not.toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.text).toContain('40.0 km');
    expect(lastCall.text).toContain('520 m');
    expect(persistTurn).toHaveBeenCalledWith(
      'build me a hilly 40km loop from downtown',
      lastCall.text,
    );
  });

  it('appends a familiarity note when the generated route reports one', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 30,
      elevation_gain_m: 200,
      familiarity_percent: 64,
    });
    const { args, append } = makeArgs({
      input: 'build me a familiar loop',
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toMatch(/64% on roads you've ridden/);
  });

  it('generates from any prompt when there is no route (non-build phrasing)', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 18,
      elevation_gain_m: 90,
    });
    const { args, applyAIEditImpl } = makeArgs({
      input: 'something flat and easy',
      hasRoute: false,
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    expect(onGenerateFromPrompt).toHaveBeenCalledTimes(1);
    expect(applyAIEditImpl).not.toHaveBeenCalled();
  });

  it('asks for a start and opens the form when start is unresolved', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({ ok: false, reason: 'no_start' });
    const { args, append, expand, markRefused } = makeArgs({
      input: 'build me a ride',
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    expect(expand).toHaveBeenCalledTimes(1);
    expect(markRefused).toHaveBeenCalled();
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toMatch(/starting point/i);
  });

  it('falls back to the form on a generic generation failure', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({ ok: false, reason: 'routing_failed' });
    const { args, append, expand } = makeArgs({
      input: 'create a loop',
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    expect(expand).toHaveBeenCalledTimes(1);
    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toMatch(/form/i);
  });

  it('renders imperial units in the reply when isImperial is set', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 64.4,
      elevation_gain_m: 610,
    });
    const { args, append } = makeArgs({
      input: 'build me a 40 mile loop',
      isImperial: true,
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.text).toContain('40.0 mi');
    expect(lastCall.text).toContain('2001 ft');
  });

  it('appends a route-options message with cards when alternatives exist', async () => {
    const options = [
      {
        index: 0,
        name: 'Northeast Loop',
        distance_km: 72.1,
        elevation_gain_m: 520,
        direction_label: 'Northeast',
        familiarity_percent: null,
        surface_label: 'gravel-biased',
      },
      {
        index: 1,
        name: 'Northeast Loop (ccw)',
        distance_km: 75.4,
        elevation_gain_m: 480,
        direction_label: 'Northeast',
        familiarity_percent: 22,
        surface_label: 'gravel-biased',
      },
      {
        index: 2,
        name: 'East Loop',
        distance_km: 69.8,
        elevation_gain_m: 610,
        direction_label: 'East',
        familiarity_percent: null,
        surface_label: 'gravel-biased',
      },
    ];
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 72.1,
      elevation_gain_m: 520,
      name: 'Northeast Loop',
      gravel_actual_pct: 48,
      options,
    });
    const { args, append, persistTurn } = makeArgs({
      input: 'build me a loop heading east and north',
      isImperial: true,
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.role).toBe('assistant');
    expect(lastCall.kind).toBe('route-options');
    expect(lastCall.options).toHaveLength(3);
    expect(lastCall.selectedOptionIndex).toBe(0);
    // Planning-voiced reply names the applied route and reports gravel.
    expect(lastCall.text).toMatch(/Planned 3 routes heading northeast/i);
    expect(lastCall.text).toContain("'Northeast Loop'");
    expect(lastCall.text).toContain('44.8 mi');
    expect(lastCall.text).toContain('~48% gravel');
    // Persistence carries a readable per-option summary (cards are session-only).
    const persisted = persistTurn.mock.calls[0][1];
    expect(persisted).toContain('1) Northeast Loop');
    expect(persisted).toContain('3) East Loop');
  });

  it('keeps the plain single-route reply when only one option exists', async () => {
    const onGenerateFromPrompt = vi.fn().mockResolvedValue({
      ok: true,
      distance_km: 30,
      elevation_gain_m: 150,
      options: [
        {
          index: 0,
          name: 'Solo loop',
          distance_km: 30,
          elevation_gain_m: 150,
          direction_label: '',
          familiarity_percent: null,
        },
      ],
    });
    const { args, append } = makeArgs({
      input: 'build me a loop via River Trail',
      onGenerateFromPrompt,
    });

    await submitChatMessage(args);

    const lastCall = append.mock.calls[append.mock.calls.length - 1][0];
    expect(lastCall.kind).toBeUndefined();
    expect(lastCall.text).toMatch(/built you a/i);
  });

  it('still edits an existing route for non-build phrasing', async () => {
    const onGenerateFromPrompt = vi.fn();
    const { args, applyAIEditImpl } = makeArgs({
      input: 'make it flatter',
      hasRoute: true,
      onGenerateFromPrompt,
    });
    applyAIEditImpl.mockResolvedValue({ ok: true, assistantText: 'ok', routeChanged: false });

    await submitChatMessage(args);

    expect(onGenerateFromPrompt).not.toHaveBeenCalled();
    expect(applyAIEditImpl).toHaveBeenCalledTimes(1);
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
