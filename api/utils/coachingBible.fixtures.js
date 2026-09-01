/**
 * Phase 1 behavior-floor fixtures — one saved coach reply per persona.
 *
 * PROVENANCE, read this before trusting them: these are HAND-AUTHORED
 * exemplars, not captured model output. This environment has no
 * ANTHROPIC_API_KEY, so no real generation was possible. They encode what a
 * floor-compliant reply looks like in each voice, and the assertions in
 * coachingBible.test.js are the executable form of the Phase 1 "done when"
 * list. Replace any `text` below with a genuine captured reply and the same
 * assertions apply unchanged — that is the point of keeping them as plain
 * strings in a separate file.
 *
 * Each fixture is one turn: the athlete asks something, the coach answers with
 * the floor applied. `state` is the rider state that produced it, recorded so
 * a later capture can be run against the same context.
 */

export const PERSONA_FIXTURES = [
  {
    persona: 'hammer',
    state: {
      age: 52,
      goal: 'gravel event, 6 weeks out',
      note: 'short efforts behind, efficiency holding',
    },
    prompt: 'What should I do this week?',
    text:
      "Short hard efforts go back in this week, because your one- and five-minute power is behind where it was a month ago and that is the part that goes first once you stop using it. Your efficiency is holding fine, so this is not a fitness problem — it is a top-end problem. Two ways to do it: five-minute climbs, or the same efforts on the flat if the wind is up. Put one of them on Wednesday.",
  },
  {
    persona: 'scientist',
    state: {
      age: 41,
      goal: 'no goal event',
      note: 'flat week, every day the same effort',
    },
    prompt: 'My training feels stale. What is going on?',
    text:
      "Your last seven days are almost identical in effort, and that flatness is the thing to change — not the total. Riding the same moderate load every day gives the body no clear signal to adapt to and no real recovery to adapt during, which is why it feels stale even though the volume is fine. The research here is reasonably settled on contrast mattering, less settled on the exact ratio, so I would not chase a precise split. Keep the same weekly total, make Thursday genuinely hard and Friday genuinely nothing, and tell me how Saturday feels.",
  },
  {
    persona: 'encourager',
    state: {
      age: 34,
      goal: 'first century, 10 weeks out',
      note: 'consistent, two rides missed after a work trip',
    },
    prompt: 'I missed two rides last week. How bad is that?',
    text:
      "Not bad at all — two rides out of a month does not move the needle, and the four weeks behind them do. What matters more is that the long ride is still landing, because that is the one your century is actually built on. So this week we protect that: keep Saturday long and easy, and let the midweek rides be short if the calendar gets tight again. Book Saturday now while the week is still open.",
  },
  {
    persona: 'pragmatist',
    state: {
      age: 46,
      goal: 'no goal event',
      note: 'no strength work in eight weeks, six hours a week riding',
    },
    prompt: 'I only have about six hours a week. What is the best use of it?',
    text:
      "Give up thirty minutes of riding and put it in the gym once a week. Heavy legs does more for you at six hours than a sixth hour on the bike would, because you are past the point where a little more easy riding changes anything, and strength is the piece you have not touched in two months. Either Tuesday before work or Sunday after the long ride — whichever one you will actually keep. Book thirty minutes for squats and step-ups this week.",
  },
  {
    persona: 'competitor',
    state: {
      age: 38,
      goal: 'road race, 2 weeks out',
      note: 'taper window, fitness built',
    },
    prompt: 'Should I get one more big week in?',
    text:
      "No — the hours come down starting now, because two weeks out another big week only adds fatigue you cannot shed before the start line. The work that wins this race is already in the bank; halving the volume while keeping the intensity is what turns it into speed on the day. Same ride days, same one hard session each week, just shorter. Cut this Saturday's ride to half its usual length and keep Tuesday's efforts exactly as they are.",
  },
];
