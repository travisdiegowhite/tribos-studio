// Example chat phrases rendered as clickable suggestion chips (submitted
// verbatim on click — keep them plain, no quote characters).
export const EXAMPLE_PHRASES: readonly string[] = [
  'make it flatter',
  'more gravel',
  'more scenic',
  'shorter',
  'longer',
  'reverse it',
  'avoid the highway',
];

export const COLD_START_EXAMPLES: readonly string[] = [
  'build me a 2 hour endurance ride',
  'generate a 30km gravel loop',
];

/**
 * One-tap edit chips shown above the input while a route is loaded.
 * Mirrors v1's QUICK_ACTIONS (src/utils/aiRouteEditService.js) but as
 * full phrases the conversational /api/route-coach endpoint understands.
 */
export const QUICK_EDIT_CHIPS: readonly { id: string; label: string; phrase: string }[] = [
  { id: 'flatten', label: 'Flatter', phrase: 'Make it flatter' },
  { id: 'scenic', label: 'Scenic', phrase: 'Make it more scenic' },
  { id: 'gravel', label: 'More gravel', phrase: 'Add more gravel' },
  { id: 'paved', label: 'More paved', phrase: 'Keep it on pavement' },
  { id: 'faster', label: 'Faster', phrase: 'Make it faster and more direct' },
  { id: 'reverse', label: 'Reverse', phrase: 'Reverse the direction' },
];
