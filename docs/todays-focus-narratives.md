# Harvested copy — TodaysFocusCard `getStory()` narratives

**Provenance:** `src/pages/TrainingDashboard.jsx` (deleted in the thesis-audit
dead-code purge — the component was defined but never mounted). Preserved here
because the audit (M9) called these out as model calendar-terms decision copy:
race proximity outranks the load model, and every line is a decision in plain
language, not a metric to decode. Reuse when building the Today/coach
prescription surfaces.

Context phrases composed in: `weekContext` = "after 2 rides and 1 run this
week" / "with fresh legs this week"; `raceContext` = "With {race} in {n}
days, ".

| Condition | Copy |
|---|---|
| Planned rest day | "{race}Your training plan has a rest day scheduled today {week}. Recovery is part of the process." |
| Plan workout (recovery) | "{race}Your plan calls for easy recovery today {week}. Keep it light and let your body absorb recent training." |
| Plan workout (other) | "{race}Your training plan has {workout name} scheduled today {week}." |
| Race in ≤2 days | "{race}race day is almost here! Focus on rest and mental preparation. A short easy spin or complete rest is best today." |
| Race in ≤7 days | "{race}it's race week! Keep your legs fresh with easy spins or rest. Short openers can help you stay sharp without adding fatigue." |
| Race in ≤14 days | "{race}you're in the taper zone {week}. Reduce volume but keep some intensity. Focus on feeling fresh and sharp for race day." |
| FS ≥ +15 | "{race}You're feeling fresh {week}. Today is perfect for a hard effort or long ride to build fitness." |
| FS ≥ +5 | "{race}Good energy {week}. A quality session like sweet spot or tempo would be ideal today." |
| FS ≥ −10 | "{race}You're in the optimal training zone {week}. Keep the momentum with a structured workout." |
| FS ≥ −25 | "{race}You're carrying some fatigue {week}. Consider an easy spin or rest day to absorb your training." |
| FS < −25 | "{race}High fatigue detected {week}. Prioritize recovery today to avoid overtraining." |

Note per the audit's C6: if these are revived as *standing* copy, the
prescriptive lines below the load-model cuts should route through the gated
coach layer (or soften to descriptive) — the race-proximity and plan-driven
lines are safe as-is.
