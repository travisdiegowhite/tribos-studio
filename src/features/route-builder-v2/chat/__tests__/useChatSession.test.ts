import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSession } from '../useChatSession';

describe('useChatSession', () => {
  it('starts with a single opening message', () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('assistant');
    expect(result.current.messages[0].text).toMatch(/tell me/i);
  });

  it('starts with processing false', () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.isProcessing).toBe(false);
  });

  it('always shows the examples hint persistently', () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.showExamplesHint).toBe(true);
  });

  it('does not show the after-refuse hint until refused once', () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.showAfterRefuseHint).toBe(false);
  });

  it('appends user and assistant messages with generated ids and timestamps', () => {
    const { result } = renderHook(() => useChatSession());
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
    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.append({ role: 'user', text: 'one' });
      result.current.append({ role: 'assistant', text: 'two' });
      result.current.append({ role: 'user', text: 'three' });
    });
    const ids = result.current.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toggles isProcessing via setProcessing', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => result.current.setProcessing(true));
    expect(result.current.isProcessing).toBe(true);
    act(() => result.current.setProcessing(false));
    expect(result.current.isProcessing).toBe(false);
  });

  it('flips showAfterRefuseHint to true after markRefused', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => result.current.markRefused());
    expect(result.current.showAfterRefuseHint).toBe(true);
  });

  it('keeps showAfterRefuseHint true once flipped', () => {
    const { result } = renderHook(() => useChatSession());
    act(() => result.current.markRefused());
    act(() => result.current.append({ role: 'user', text: 'more' }));
    expect(result.current.showAfterRefuseHint).toBe(true);
  });
});
