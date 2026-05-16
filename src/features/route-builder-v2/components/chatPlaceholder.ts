/**
 * PLACEHOLDER: hardcoded example messages for P1.3 visual review.
 * P1.4 replaces this with real conversation state from the chat hook.
 */

export type Role = 'user' | 'assistant';

export interface PlaceholderMessage {
  id: string;
  role: Role;
  text: string;
}

export const PLACEHOLDER_BUBBLES: PlaceholderMessage[] = [
  {
    id: 'p1',
    role: 'assistant',
    text: 'Loop set up — 52km at endurance pace. Avoided 287 like you asked.',
  },
  {
    id: 'p2',
    role: 'user',
    text: 'less climbing in the middle section',
  },
  {
    id: 'p3',
    role: 'assistant',
    text: 'Rerouted. Now 580m gain, mostly in the first hour.',
  },
];
