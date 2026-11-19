/**
 * Thin client for POST /api/coach, shared by the Coach page.
 *
 * The request shape mirrors what CoachCommandBar and the Today CoachPanel
 * already send, so every surface talks to the same endpoint the same way.
 * The server builds its own training snapshot; `trainingContext` is optional
 * extra on-screen context.
 */

import { supabase } from '../../lib/supabase';
import type { CoachVisualSpec } from './visuals/types';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface UserLocalDate {
  dayOfWeek: number;
  date: number;
  month: number;
  year: number;
  dateString: string;
  timezone: string;
}

/** A part of a visual the athlete selected to talk about (Phase 3). */
export interface CoachFocus {
  kind: 'ride_segment' | 'fitness_day';
  activity_id?: string;
  range_km?: [number, number];
  date?: string;
  /** Human label shown on the chip, e.g. "Sat ride · 31.2–36.8 km". */
  label: string;
}

export interface CoachRequest {
  message: string;
  conversationHistory: HistoryTurn[];
  trainingContext?: string | null;
  userId: string;
  maxTokens?: number;
  quickMode?: boolean;
  focus?: Omit<CoachFocus, 'label'> | null;
  /** Only the /coach page renders visuals; it alone offers the coach show_visual. */
  canShowVisuals?: boolean;
}

export interface WorkoutRecommendation {
  id?: string;
  workout_id: string;
  name?: string;
  scheduled_date?: string;
  scheduledDate?: string;
  added?: boolean;
  [key: string]: unknown;
}

export interface CoachResponse {
  success: boolean;
  message: string;
  workoutRecommendations: WorkoutRecommendation[] | null;
  trainingPlanPreview: (Record<string, unknown> & { error?: string; name?: string }) | null;
  autoActivatedPlan: { planId?: string; planName?: string; workoutCount?: number } | null;
  scheduleAdjusted: boolean;
  scheduleAdjustments: unknown[] | null;
  suggestedActions: unknown[] | null;
  visuals?: CoachVisualSpec[] | null;
}

export function buildUserLocalDate(now: Date = new Date()): UserLocalDate {
  return {
    dayOfWeek: now.getDay(),
    date: now.getDate(),
    month: now.getMonth(),
    year: now.getFullYear(),
    dateString: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function postCoach(body: CoachRequest): Promise<CoachResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ ...body, userLocalDate: buildUserLocalDate() }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Coach request failed (HTTP ${res.status})`);
  }
  return res.json();
}
