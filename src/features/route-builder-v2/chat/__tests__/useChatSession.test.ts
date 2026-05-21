import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatSession } from '../useChatSession';
import type { ChatMessage } from '../types';

const NO_ROUTE = { routeId: null, userId: null };

describe('useChatSession', () => {
  it('starts with a single opening message', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('assistant');
    expect(result.current.messages[0].text).toMatch(/tell me/i);
  });

  it('starts with processing false', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    expect(result.current.isProcessing).toBe(false);
  });

  it('always shows the examples hint persistently', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    expect(result.current.showExamplesHint).toBe(true);
  });

  it('does not show the after-refuse hint until refused once', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    expect(result.current.showAfterRefuseHint).toBe(false);
  });

  it('marks hydrated true when there is no route to load', async () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
  });

  it('uses a persona-voiced opener override when provided', () => {
    const opener: ChatMessage = {
      id: 'opening',
      role: 'assistant',
      text: 'What needs fixing on this route?',
      timestamp: 0,
    };
    const { result } = renderHook(() =>
      useChatSession({ ...NO_ROUTE, openingMessage: opener }),
    );
    expect(result.current.messages[0].text).toBe('What needs fixing on this route?');
  });

  it('appends user and assistant messages with generated ids and timestamps', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    act(() => {
      result.current.append({ role: 'user', text: 'hello' });
    });
    expect(result.current.messages).toHaveLength(2);
    const newMsg = result.current.messages[1];
    expect(newMsg.role).toBe('user');
    expect(newMsg.text).toBe('hello');
    expect(typeof newMsg.id).toBe('string');
    expect(newMsg.id.length).toBeGreaterThan(0);
    expect(typeof newMsg.timestamp).toBe('number');
  });

  it('gives each appended message a unique id', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    act(() => {
      result.current.append({ role: 'user', text: 'one' });
      result.current.append({ role: 'assistant', text: 'two' });
      result.current.append({ role: 'user', text: 'three' });
    });
    const ids = result.current.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toggles isProcessing via setProcessing', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    act(() => result.current.setProcessing(true));
    expect(result.current.isProcessing).toBe(true);
    act(() => result.current.setProcessing(false));
    expect(result.current.isProcessing).toBe(false);
  });

  it('flips showAfterRefuseHint to true after markRefused', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    act(() => result.current.markRefused());
    expect(result.current.showAfterRefuseHint).toBe(true);
  });

  it('keeps showAfterRefuseHint true once flipped', () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    act(() => result.current.markRefused());
    act(() => result.current.append({ role: 'user', text: 'more' }));
    expect(result.current.showAfterRefuseHint).toBe(true);
  });

  it('persistTurn is a no-op without a route id', async () => {
    const { result } = renderHook(() => useChatSession(NO_ROUTE));
    await act(async () => {
      await result.current.persistTurn('hi', 'hello');
    });
    // No throw — the conversation continues regardless.
    expect(result.current.messages).toHaveLength(1);
  });
});
