import { describe, it, expect } from 'vitest';
import { historyForModel, rowToMessage } from './useCoachChat';
import type { ChatMessage } from './useCoachChat';

const msg = (id: string, role: 'user' | 'coach', content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role,
  content,
  timestamp: '2026-11-19T10:00:00Z',
  ...extra,
});

describe('historyForModel', () => {
  it('sends only the current topic', () => {
    const history = historyForModel([
      msg('1', 'user', 'old question'),
      msg('2', 'coach', 'old answer'),
      msg('3', 'user', 'new topic', { topicStart: true }),
      msg('4', 'coach', 'new answer'),
    ]);
    expect(history.map((h) => h.content)).toEqual(['new topic', 'new answer']);
    expect(history.map((h) => h.role)).toEqual(['user', 'assistant']);
  });

  it('keeps the selection label and recommended workouts in the text the model reads', () => {
    const history = historyForModel([
      msg('1', 'user', 'why did I fade here?', { focusLabel: 'Sat loop · 31.2–36.8 km' }),
      msg('2', 'coach', 'Try this.', {
        workoutRecommendations: [{ workout_id: 'ss_2x20', name: 'Sweet Spot 2x20', scheduled_date: '2026-11-21' }],
      }),
    ]);
    expect(history[0].content).toContain('[about: Sat loop · 31.2–36.8 km]');
    expect(history[1].content).toContain('workout_id: ss_2x20, date: 2026-11-21');
  });
});

describe('rowToMessage', () => {
  it('restores visuals and flags from context_snapshot', () => {
    const m = rowToMessage({
      id: 'row-1',
      role: 'coach',
      message: 'Here is the climb.',
      timestamp: '2026-11-19T10:00:00Z',
      context_snapshot: {
        visuals: [{ kind: 'ride_streams', activity_id: 'a1', range_km: [1, 2] }],
        planActivated: true,
      },
    });
    expect(m.role).toBe('coach');
    expect(m.visuals).toHaveLength(1);
    expect(m.planActivated).toBe(true);
  });

  it('tolerates rows written by other surfaces', () => {
    const m = rowToMessage({ id: 'r', role: 'user', message: 'hi', timestamp: 't', context_snapshot: null });
    expect(m.visuals).toBeNull();
    expect(m.topicStart).toBe(false);
  });
});
