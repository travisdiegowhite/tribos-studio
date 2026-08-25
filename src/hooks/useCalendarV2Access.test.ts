/**
 * The Calendar 2.0 gate's truth table.
 *
 * This is the same table `docs/route-builder-2-scaffolding.md` documents for
 * the RB2 gate, which is the one rebuild in this codebase whose cutover
 * actually completed. It is worth asserting rather than assuming because the
 * failure mode is silent in both directions: fail-open surfaces a half-built
 * calendar to everyone, and a nav link whose visibility drifts from the
 * route's guard shows a tab that redirects straight back to /train.
 *
 * | env   | user column | result |
 * |-------|-------------|--------|
 * | true  | true        | access |
 * | true  | false       | denied |
 * | true  | null row    | denied |
 * | true  | read error  | denied |  ← fails CLOSED
 * | false | any         | denied |  ← no query is even issued
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalendarV2Access } from './useCalendarV2Access';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...(args as [])) },
}));

const USER = '11111111-1111-1111-1111-111111111111';

function setEnv(enabled: boolean) {
  vi.stubEnv('VITE_CALENDAR_V2_ENABLED', enabled ? 'true' : 'false');
}

describe('useCalendarV2Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence the deliberate fail-closed warnings.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('grants access when the env flag and the user column are both true', async () => {
    setEnv(true);
    maybeSingle.mockResolvedValue({ data: { calendar_v2_enabled: true }, error: null });

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(true);
    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(eq).toHaveBeenCalledWith('id', USER);
  });

  it('denies when the user column is false', async () => {
    setEnv(true);
    maybeSingle.mockResolvedValue({ data: { calendar_v2_enabled: false }, error: null });

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
  });

  it('denies when the profile row is missing entirely', async () => {
    setEnv(true);
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
  });

  it('fails CLOSED on a read error rather than defaulting open', async () => {
    setEnv(true);
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
  });

  it('fails CLOSED when the query throws', async () => {
    setEnv(true);
    maybeSingle.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
  });

  it('denies without issuing a query when the env kill switch is off', async () => {
    setEnv(false);
    maybeSingle.mockResolvedValue({ data: { calendar_v2_enabled: true }, error: null });

    const { result } = renderHook(() => useCalendarV2Access(USER));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('denies without a query when there is no signed-in user', async () => {
    setEnv(true);

    const { result } = renderHook(() => useCalendarV2Access(undefined));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('re-evaluates when the user changes', async () => {
    setEnv(true);
    maybeSingle.mockResolvedValue({ data: { calendar_v2_enabled: true }, error: null });

    const { result, rerender } = renderHook(({ id }) => useCalendarV2Access(id), {
      initialProps: { id: USER as string | undefined },
    });
    await waitFor(() => expect(result.current.hasAccess).toBe(true));

    rerender({ id: undefined });
    await waitFor(() => expect(result.current.hasAccess).toBe(false));
  });
});
