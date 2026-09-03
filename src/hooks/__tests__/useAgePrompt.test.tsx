import { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The scheduling is the whole feature, so that is what is tested: who gets
 * asked, how often, and — most importantly — when we STOP. The dialog itself
 * is one field and two buttons and is not worth a render test.
 */
const { selectMock, updateMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => selectMock() }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () => updateMock(payload),
      }),
    }),
  },
}));

import { useAgePrompt, MAX_AGE_PROMPTS, OPENS_BETWEEN_PROMPTS } from '../useAgePrompt';

const USER = 'user-1';

/** Today, in the local calendar form the hook writes. */
function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** A profile with no age at all — the only kind that ever gets asked. */
function profile(over: Record<string, unknown> = {}) {
  return {
    data: {
      date_of_birth: null,
      birth_year: null,
      metrics_age: null,
      age_prompt_opens: 0,
      age_prompt_shown: 0,
      age_prompt_last_open: null,
      ...over,
    },
    error: null,
  };
}

beforeEach(() => {
  selectMock.mockReset();
  updateMock.mockReset();
  updateMock.mockResolvedValue({ error: null });
});

const render = (enabled = true) =>
  renderHook(() => useAgePrompt(USER, { enabled }));

describe('useAgePrompt — who gets asked', () => {
  it('does nothing without a user', async () => {
    renderHook(() => useAgePrompt(undefined, { enabled: true }));
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('does nothing at all while another overlay owns the screen', async () => {
    render(false);
    // Not even the visit is counted: a suppressed showing must be deferred,
    // not spent.
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a date of birth', { date_of_birth: '1984-06-15' }],
    ['a birth year', { birth_year: 1984 }],
    ['a stated age', { metrics_age: 42 }],
  ])('never asks an athlete who already gave us %s', async (_label, age) => {
    selectMock.mockResolvedValue(profile({ ...age, age_prompt_opens: 99 }));
    const { result } = render();
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
    // No bookkeeping either — there is nothing left to schedule.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('stops permanently once the cap is reached, answered or not', async () => {
    selectMock.mockResolvedValue(
      profile({ age_prompt_shown: MAX_AGE_PROMPTS, age_prompt_opens: 99 })
    );
    const { result } = render();
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('useAgePrompt — how often', () => {
  it('counts the visit but stays quiet before the interval', async () => {
    selectMock.mockResolvedValue(profile({ age_prompt_opens: 0 }));
    const { result } = render();
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith({
      age_prompt_opens: 1,
      age_prompt_last_open: today(),
    });
    expect(result.current.shouldShow).toBe(false);
  });

  it('asks on the interval, and resets the counter as it does', async () => {
    selectMock.mockResolvedValue(
      profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1, age_prompt_shown: 1 })
    );
    const { result } = render();
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    expect(updateMock).toHaveBeenCalledWith({
      age_prompt_opens: 0,
      age_prompt_shown: 2,
      age_prompt_last_open: today(),
    });
  });

  it('counts one visit per calendar day, not per page load', async () => {
    // Otherwise a refresh-happy afternoon burns the whole allowance in an hour.
    selectMock.mockResolvedValue(
      profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1, age_prompt_last_open: today() })
    );
    const { result } = render();
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('evaluates once per mount, however often it re-renders', async () => {
    selectMock.mockResolvedValue(profile());
    const { rerender } = render();
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('still shows under StrictMode, which double-invokes the effect', async () => {
    // The app runs in StrictMode (src/main.jsx). A plain "already ran" ref
    // made the first invocation do the work while its own cleanup marked it
    // stale, and turned the second away — paying for a showing that never
    // appeared. The prompt was unreachable in dev and the cost was real.
    selectMock.mockResolvedValue(profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1 }));
    const { result } = renderHook(() => useAgePrompt(USER, { enabled: true }), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    // Paid for exactly once, despite the doubled effect.
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('stops for good after MAX_AGE_PROMPTS, over a long run of real visits', async () => {
    // Drives the actual hook across remounts against a row that evolves the
    // way the database would. This is the promise the design makes — bounded
    // by construction, no "never ask again" button needed — so it is worth
    // testing against the code rather than against a restatement of it.
    const row = {
      date_of_birth: null,
      birth_year: null,
      metrics_age: null,
      age_prompt_opens: 0,
      age_prompt_shown: 0,
      age_prompt_last_open: null as string | null,
    };

    let day = 0;
    selectMock.mockImplementation(async () => ({ data: { ...row }, error: null }));
    updateMock.mockImplementation(async (payload: Record<string, unknown>) => {
      Object.assign(row, payload);
      return { error: null };
    });

    let shows = 0;
    const visits = OPENS_BETWEEN_PROMPTS * MAX_AGE_PROMPTS + 10;
    for (let i = 0; i < visits; i++) {
      // A fresh calendar day each visit, so the day gate never suppresses one.
      day += 1;
      row.age_prompt_last_open =
        row.age_prompt_last_open === null ? null : `2026-01-${String(day).padStart(2, '0')}`;

      const { result, unmount } = render();
      await waitFor(() => expect(selectMock).toHaveBeenCalled());
      await waitFor(() => expect(result.current).toBeTruthy());
      if (result.current.shouldShow) shows += 1;
      unmount();
      selectMock.mockClear();
      // The hook stamps the real today(); rewind it so the next visit is a
      // new day rather than a same-day repeat.
      if (row.age_prompt_last_open === today()) {
        row.age_prompt_last_open = `2026-01-${String(day).padStart(2, '0')}`;
      }
    }

    expect(shows).toBe(MAX_AGE_PROMPTS);
    expect(row.age_prompt_shown).toBe(MAX_AGE_PROMPTS);
  });
});

describe('useAgePrompt — failure is silent', () => {
  it('does not show when the profile read fails', async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = render();
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
  });

  it('does not show when the bookkeeping write fails', async () => {
    // Showing without recording it would re-show on every open forever, which
    // is the one outcome worse than never showing.
    selectMock.mockResolvedValue(profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1 }));
    updateMock.mockResolvedValue({ error: { message: 'denied' } });
    const { result } = render();
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
  });

  it('survives a thrown read without breaking the app around it', async () => {
    selectMock.mockRejectedValue(new Error('offline'));
    const { result } = render();
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    expect(result.current.shouldShow).toBe(false);
  });
});

describe('useAgePrompt — saving', () => {
  it('writes the derived age columns and closes', async () => {
    selectMock.mockResolvedValue(profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1 }));
    const { result } = render();
    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    updateMock.mockClear();
    let ok: boolean | undefined;
    await waitFor(async () => {
      ok = await result.current.saveBirthYear(1984);
    });

    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      birth_year: 1984,
      metrics_age: new Date().getFullYear() - 1984,
    });
    await waitFor(() => expect(result.current.shouldShow).toBe(false));
  });

  it('reports a failed save instead of closing on a lie', async () => {
    selectMock.mockResolvedValue(profile({ age_prompt_opens: OPENS_BETWEEN_PROMPTS - 1 }));
    const { result } = render();
    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    updateMock.mockResolvedValue({ error: { message: 'denied' } });
    let ok: boolean | undefined;
    await waitFor(async () => {
      ok = await result.current.saveBirthYear(1984);
    });

    expect(ok).toBe(false);
    expect(result.current.shouldShow).toBe(true);
  });
});
