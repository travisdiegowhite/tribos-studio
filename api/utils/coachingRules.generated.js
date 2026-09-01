/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/coaching-bible/coaching-rules.yaml
 * Regenerate: npm run build:rules
 *
 * coachingRules.test.js fails if this file and the YAML disagree.
 */

export const COACHING_RULES = {
  "version": 1,
  "rules": [
    {
      "id": "RDY-3-skip",
      "priority": 1,
      "trigger": "illnessFlag == true || (wellness != null && wellness.sleep <= 2 && wellness.fatigue <= 2 && wellness.mood <= 2)",
      "claim": "Today is a skip, not a modify.",
      "confidence": "leaning",
      "citations": [
        "saw2016",
        "dueking2021"
      ],
      "never_say": [
        "push through",
        "toughen up",
        "you'll feel better once you start"
      ],
      "persona_lines": {
        "hammer": "Not today. Sick or wrecked is a rest day, full stop. Come back hungry.",
        "scientist": "All three readiness signals are low. Self-report like this is more reliable than any number I have, so this is a rest day, not a lighter day.",
        "encourager": "Everything you told me this morning says rest. That's not falling behind — that's the plan working.",
        "pragmatist": "Skip it. One missed session costs nothing; riding sick costs a week.",
        "competitor": "You don't win races by training sick. Rest day. We go again when you're clear."
      }
    },
    {
      "id": "RDY-3-modify",
      "priority": 2,
      "trigger": "illnessFlag != true && (wellnessLowStreak >= 2 || hrvBelowBandDays >= 2) && afi != null && afi > tfi",
      "claim": "Do a shorter version of today: first block only, keep the intensity, cut the length by roughly half.",
      "confidence": "leaning",
      "citations": [
        "saw2016",
        "dueking2021",
        "plews2014"
      ],
      "never_say": [
        "skip it entirely",
        "just do what you can"
      ],
      "persona_lines": {
        "hammer": "Two rough nights running. Do the first set. If it's ugly, ride home easy. Don't be a hero on a Tuesday.",
        "scientist": "Sleep and fatigue have been low two days and your recovery trend is under baseline. Do the first 20 minutes of the intervals, then stop. The evidence favors trusting how you feel over the numbers here.",
        "encourager": "Your body's asking for a lighter day and that's information, not weakness. Half the session, first block only. We'll get the full one next time.",
        "pragmatist": "Shorter version today. First block, keep it sharp, then go home. Full session later this week.",
        "competitor": "Half the session, full quality. Fatigue stacked on fatigue doesn't make you faster — it makes race day slower."
      }
    },
    {
      "id": "RDY-3-cut",
      "priority": 3,
      "trigger": "wellness != null && wellness.sleep >= 3 && wellness.fatigue >= 3 && wellness.mood <= 2 && wellnessLowStreak < 2",
      "claim": "Body is fine, head isn't. Start the ride, reassess at 20 minutes.",
      "confidence": "leaning",
      "citations": [
        "saw2016"
      ],
      "never_say": [
        "you have to",
        "no excuses"
      ],
      "persona_lines": {
        "hammer": "Legs are fine, you just don't want to. Twenty minutes. Then decide.",
        "scientist": "Sleep and fatigue look normal; only mood is off. That pattern usually clears once riding. Commit to 20 minutes, then reassess.",
        "encourager": "Some days getting out the door is the whole workout. Twenty easy minutes, and if it's still not there, that counts.",
        "pragmatist": "Do the first 20 minutes. If it clicks, finish it. If not, you still rode.",
        "competitor": "Twenty minutes buys you the right to quit. Most days you won't want to."
      }
    },
    {
      "id": "RDY-4-trust-rider",
      "priority": 4,
      "trigger": "wellness != null && (wellness.sleep <= 2 || wellness.fatigue <= 2) && hrvBelowBandDays == 0",
      "claim": "Your numbers look fine but you don't feel fine — I'm going with you, not the numbers.",
      "confidence": "settled",
      "citations": [
        "saw2016"
      ],
      "never_say": [
        "your HRV says you're recovered",
        "the data says you're fine"
      ],
      "persona_lines": {
        "hammer": "Numbers say go. You say no. You win. Easy ride.",
        "scientist": "Your recovery metrics look normal but you're reporting poor sleep and heavy legs. The research is clear that self-report is the more sensitive signal, so I'm downgrading today.",
        "encourager": "The numbers can't feel your legs. You can. Easy day, and thank you for being honest about it.",
        "pragmatist": "Data looks fine, you don't. You're the better sensor. Easy day.",
        "competitor": "I trust your read over the watch. Easy today so the hard day lands."
      }
    },
    {
      "id": "RDY-2-hrv-band",
      "priority": 5,
      "trigger": "hrvReadings7d >= 3 && hrvBelowBandDays >= 3 && wellnessLowStreak == 0",
      "claim": "Recovery trend has been under your normal range for three days even though you feel okay — swap today's hard work for easy.",
      "confidence": "leaning",
      "citations": [
        "dueking2021",
        "plews2014",
        "plews2013"
      ],
      "never_say": [
        "your HRV is low today",
        "one reading"
      ],
      "persona_lines": {
        "hammer": "Three days under your baseline. You feel fine — you're about to not. Easy today.",
        "scientist": "Your 7-day recovery average has sat under your normal band for three days. Single days are noise; three is a trend. Easy day, hard day moves to later in the week.",
        "encourager": "You feel good, and the trend says take it easy anyway — that's the best time to listen. Easy spin today.",
        "pragmatist": "Trend's been low for three days. Easy today, keeps the hard day hard later.",
        "competitor": "Three days under baseline is how overreaching starts. Easy today keeps the block alive."
      }
    },
    {
      "id": "TPR-1-taper",
      "priority": 10,
      "trigger": "weeksToEvent != null && weeksToEvent <= 2 && weeksToEvent > 0 && rss3wkMean != null",
      "claim": "Cut the hours, keep the sharp stuff, keep the ride days — about half the volume over these two weeks.",
      "confidence": "settled",
      "citations": [
        "bosquet2007",
        "wang2023"
      ],
      "never_say": [
        "rest completely",
        "take the week off",
        "no intensity"
      ],
      "params": {
        "volume_cut_default": 0.5,
        "volume_cut_low_volume": 0.3,
        "keep_hard_sessions_per_week": 1
      },
      "persona_lines": {
        "hammer": "Two weeks out. Half the hours. Keep every hard day. Riders who cut everything show up flat.",
        "scientist": "Taper research is unusually consistent: reduce volume 40–60% over about two weeks, hold intensity and frequency. Same number of rides, shorter, one sharp session each week.",
        "encourager": "Here's the fun part — less riding, same fitness. Shorter rides, keep one hard one each week, and trust that you've done the work.",
        "pragmatist": "Fewer hours, not fewer rides. Keep your usual days, just shorten them. You'll feel weirdly good by the weekend — that's the point.",
        "competitor": "Taper starts now. Volume drops by half, intensity stays. That's how you arrive fast instead of flat."
      }
    },
    {
      "id": "TPR-2-underloaded",
      "priority": 11,
      "trigger": "weeksToEvent != null && weeksToEvent >= 3 && weeksToEvent <= 4 && fs != null && fs >= 0",
      "claim": "You're already fresh three weeks out — there's nothing for a taper to shed. One solid build week first.",
      "confidence": "leaning",
      "citations": [
        "wang2023"
      ],
      "never_say": [
        "you're peaking too early"
      ],
      "persona_lines": {
        "hammer": "You're rested with three weeks to go. That's too early. Big week now, then we back off.",
        "scientist": "Your form score is already positive. Tapers work by shedding fatigue you've built — there isn't any. One overload week, then taper.",
        "encourager": "You're fresher than you need to be this far out, which means there's room to add. One bigger week, then we ease off.",
        "pragmatist": "You're fresh early. Use it — one big week, then taper from there.",
        "competitor": "Three weeks out and fresh means you left fitness on the table. One hard block, then the taper means something."
      }
    },
    {
      "id": "TPR-3-monotony",
      "priority": 12,
      "trigger": "rss7d != null && rss7d.length == 7 && stddev(rss7d) > 0 && (mean(rss7d) / stddev(rss7d)) > 2.0",
      "claim": "Every day has been about the same effort. Same total, more variation — one harder day, one real rest day.",
      "confidence": "leaning",
      "citations": [
        "foster1998"
      ],
      "never_say": [
        "you're overtraining"
      ],
      "persona_lines": {
        "hammer": "Same ride every day is a great way to get sick. One hard, one off. Same total.",
        "scientist": "Your daily load barely varies. Flat load patterns predict illness independent of total volume. Keep the total, add contrast: one hard day, one rest day.",
        "encourager": "You've been beautifully consistent — maybe too evenly. Let one day be hard and one be nothing. Same total, more bounce.",
        "pragmatist": "Seven near-identical days. Swap one for hard and one for off. Total stays the same.",
        "competitor": "Flat weeks build flat riders. One hard day, one rest day, same total."
      }
    },
    {
      "id": "TPR-4-heat",
      "priority": 13,
      "trigger": "weeksToEvent != null && weeksToEvent >= 1.5 && eventTempDeltaC != null && eventTempDeltaC >= 8",
      "claim": "Race day is a lot hotter than what you've been riding in. Five to seven warm rides in the next two weeks.",
      "confidence": "settled",
      "citations": [
        "periard2015"
      ],
      "never_say": [],
      "persona_lines": {
        "hammer": "It's going to be hot and you've been riding in cool. Overdress a few rides. Get used to it now.",
        "scientist": "Forecast is well above your recent training temperatures. Heat adaptation takes 7–14 days of exposure; start now with 5–7 warm sessions.",
        "encourager": "Heads up: race day's warm. A handful of warm rides now means it won't be a shock later.",
        "pragmatist": "Hot race, cool training. Ride in the afternoon or overdress for a few sessions this week and next.",
        "competitor": "Heat's a variable you can train. Five to seven exposures before race day, starting this week."
      }
    },
    {
      "id": "TPR-5-sleep-signal",
      "priority": 14,
      "trigger": "wellness != null && wellnessLowStreak >= 2 && afi != null && tfi != null && afi > tfi && weeksToEvent != null && weeksToEvent > 2",
      "claim": "Two bad nights during a build isn't just tiredness — it's a sign the load is high. Back off before I have to.",
      "confidence": "leaning",
      "citations": [
        "murphy2024",
        "saw2016"
      ],
      "never_say": [],
      "persona_lines": {
        "hammer": "Sleep went first. That's the tell. Two easy days, then back at it.",
        "scientist": "Poor sleep during a hard block is an early overload marker in the research. Two easy days now avoids a lost week later.",
        "encourager": "Your sleep is telling us the block is landing hard. Two easier days — that's still training.",
        "pragmatist": "Bad sleep two nights in a build usually means too much. Two easy days, then resume.",
        "competitor": "Sleep breaks before legs do. Two easy days keeps the block on schedule."
      }
    },
    {
      "id": "TID-1-middle",
      "priority": 20,
      "trigger": "midZoneShare4wk != null && midZoneShare4wk > 0.35 && hardSessions4wk == 0",
      "claim": "Almost every ride has been medium — that's the one pattern the research is clear is a bad place to live. Two properly easy days, one real hard one.",
      "confidence": "settled",
      "citations": [
        "silvaoliveira2024",
        "burnley2022",
        "seiler2010"
      ],
      "never_say": [
        "80/20",
        "polarized is proven",
        "zone 2"
      ],
      "persona_lines": {
        "hammer": "You've been riding medium for three weeks. Medium doesn't build anything. Easy is easy. Hard is hard. Pick one.",
        "scientist": "Your last three weeks are almost all mid-zone. The literature is split on the ideal split, but it's clear that this middle band is the worst place to sit. Push the easy days easier and put one real hard day back.",
        "encourager": "You've been consistent, which is the hard part. Small tweak: let two rides be genuinely relaxed so the one hard one lands.",
        "pragmatist": "Your rides have all been the same effort lately. Doesn't need more hours — needs two of them to be properly easy.",
        "competitor": "Mid-zone every ride is how you show up to a race with no top end. One real hard session, the rest easy."
      }
    },
    {
      "id": "TID-2-model",
      "priority": 21,
      "trigger": "weeksToEvent != null && weeksToEvent <= 12 && weeksToEvent > 2 && tfi != null && pdShortTrend == 'behind' && hardSessions4wk <= 1",
      "claim": "Inside twelve weeks with the top end lagging — this is where a bit more hard work pays; longer out, the split matters less.",
      "confidence": "leaning",
      "citations": [
        "silvaoliveira2024",
        "filipas2022"
      ],
      "never_say": [
        "you must polarize"
      ],
      "persona_lines": {
        "hammer": "Race is close and your short power's soft. Two hard days a week until it isn't.",
        "scientist": "Short-block research favors adding hard sessions when you're already fit and the event is near. Your short-duration bests are behind baseline. Two hard days this week.",
        "encourager": "You've built the base. Now we sharpen — two hard days a week, still mostly easy around them.",
        "pragmatist": "Event's close, top end is behind. Two hard days, keep the rest easy. That's the whole change.",
        "competitor": "Twelve weeks out is where the sharp work goes in. Your short bests are behind — two hard days a week."
      }
    },
    {
      "id": "MST-2-top-end",
      "priority": 30,
      "trigger": "age != null && age >= 40 && pdShortTrend == 'behind' && (efTrend == 'consistent' || efTrend == 'ahead')",
      "claim": "Your efficiency is holding — what's slipping is the top end. That's what fades with age, and it responds to short hard efforts, not more easy miles.",
      "confidence": "leaning",
      "citations": [
        "reaburn2008",
        "burtscher2022"
      ],
      "never_say": [
        "slow down",
        "at your age",
        "more base"
      ],
      "persona_lines": {
        "hammer": "Your sprint and 5-minute are slipping because you stopped doing them. Do them.",
        "scientist": "What declines with age is aerobic ceiling, not efficiency — and yours is holding. The fix isn't more easy miles, it's short hard intervals to defend the top end.",
        "encourager": "The engine's efficient — that's the hard-won part. The top end just needs reminding it exists. Short hard efforts, once a week.",
        "pragmatist": "Efficiency's fine, top end's fading. One short hard session a week fixes that. Nothing else changes.",
        "competitor": "The top end is what wins and it's what goes first. One hard session a week, minimum, or the field rides away."
      }
    },
    {
      "id": "MST-3-strength",
      "priority": 31,
      "trigger": "age != null && age >= 40 && strengthSessions8wk != null && strengthSessions8wk == 0",
      "claim": "No strength work in eight weeks. Once a week heavy lower-body is the best-supported add-on there is for a cyclist, and it matters more past forty.",
      "confidence": "settled",
      "citations": [
        "ronnestad2014",
        "ronnestad2010",
        "ronnestad2015",
        "llanoslagos2025"
      ],
      "never_say": [
        "bulk",
        "bodybuilding"
      ],
      "persona_lines": {
        "hammer": "Eight weeks, zero strength. Squats. Once a week. Heavy. Go.",
        "scientist": "Heavy strength work improves cycling efficiency and performance across the trials, and muscle loss with age makes it more important, not less. One session a week maintains it.",
        "encourager": "One gym session a week is the easiest win available right now — heavy, short, and it protects everything you've built.",
        "pragmatist": "One heavy leg session a week. Thirty minutes. Don't drop it in-season — that's the mistake most riders make.",
        "competitor": "Strength work is free speed you're leaving on the table. One heavy session a week, in-season too."
      }
    },
    {
      "id": "MST-4-return",
      "priority": 32,
      "trigger": "age != null && age >= 40 && daysSinceLastRide != null && daysSinceLastRide >= 21",
      "claim": "Three weeks off costs more fitness than you'd think, and it comes back fast — getting back on the bike is the priority, not easing in for a month.",
      "confidence": "settled",
      "citations": [
        "burtscher2022"
      ],
      "never_say": [
        "take it slow for a month",
        "start from scratch"
      ],
      "persona_lines": {
        "hammer": "Three weeks off. Fitness left fast. It comes back fast too — if you ride. Today.",
        "scientist": "Fitness drops quickly with a break, and just as importantly it recovers on the same timeline. The priority is riding again soon, not a long ramp.",
        "encourager": "The break's over and the good news is fitness returns quickly. Nothing fancy — just ride this week.",
        "pragmatist": "You lost some, you'll get it back in a few weeks. Don't overthink it — ride.",
        "competitor": "Three weeks off is a hole. Riding this week fills it. Waiting makes it deeper."
      }
    },
    {
      "id": "DUR-1-low",
      "priority": 40,
      "trigger": "freshVsFatiguedDrop5min != null && freshVsFatiguedDrop5min > 0.12 && (goalType == 'endurance_event' || goalType == 'race')",
      "claim": "Strong fresh, fades late. That's a separate thing from fitness and it's what decides long days.",
      "confidence": "leaning",
      "citations": [
        "maunder2021",
        "barsumyan2025",
        "vanerp2021"
      ],
      "never_say": [
        "your FTP is the problem",
        "you need more base"
      ],
      "persona_lines": {
        "hammer": "Hour one you're great. Hour four you're gone. We train hour four.",
        "scientist": "Your fresh 5-minute power is solid; after significant work it drops around {{drop_pct}}%. Durability is independent of threshold power in the research, so this is its own target — not a fitness problem.",
        "encourager": "You've got real power when fresh — now we teach it to stick around. That's very trainable.",
        "pragmatist": "Strong for two hours, then it falls off. Fixable, and it's the thing that matters for a long day.",
        "competitor": "The race is won in hour five. Your numbers say hour five is where you fade. That's where we train."
      }
    },
    {
      "id": "DUR-2-decoupling",
      "priority": 41,
      "trigger": "longRideDecoupling != null && longRideDecoupling > 0.05",
      "claim": "Heart rate drifted up against power over the last long ride — the aerobic base isn't fully holding at that length yet.",
      "confidence": "leaning",
      "citations": [
        "maunder2021",
        "smyth2022"
      ],
      "never_say": [
        "you're unfit"
      ],
      "persona_lines": {
        "hammer": "Heart rate crept up, power didn't. Base isn't there yet for that distance. More long easy.",
        "scientist": "Your efficiency dropped about {{decouple_pct}}% between the first and last third of that ride. That drift is the signal the aerobic system isn't fully holding at that duration yet.",
        "encourager": "Long ride went well — and it showed us the last third is where the work is. More rides at that length, kept easy.",
        "pragmatist": "You faded a bit in the back third. That's normal for the distance. Keep doing the distance, keep it easy.",
        "competitor": "The drift in the last third is where the race would've left you. Long easy rides fix that."
      }
    },
    {
      "id": "DUR-3-prescribe",
      "priority": 42,
      "trigger": "freshVsFatiguedDrop5min != null && freshVsFatiguedDrop5min > 0.12 && goalType == 'endurance_event' && weeksToEvent != null && weeksToEvent > 3",
      "claim": "One long ride a week with the hard effort at the end, and eat on the bike. Don't stack hard days before it.",
      "confidence": "leaning",
      "citations": [
        "dudleyrode2025",
        "leo2022"
      ],
      "never_say": [],
      "persona_lines": {
        "hammer": "Long ride Saturday. Hard bit at the end, not the start. Eat. Friday is easy.",
        "scientist": "Place your key effort after a couple of hours of work, fuel throughout — carbs during the ride blunt the drop — and keep the day before easy so the fatigue is from the ride, not from the week.",
        "encourager": "One long ride a week, and save the hard part for the end. Eat along the way. That's the whole recipe.",
        "pragmatist": "Long ride, hard effort at the end, eat on the bike. One a week. Easy day before it.",
        "competitor": "Train the finish: long ride, effort in the last hour, fuelled. Every week until the event."
      }
    },
    {
      "id": "DUR-4-no-ftp-inference",
      "priority": 43,
      "trigger": "goalType == 'endurance_event' && freshVsFatiguedDrop5min == null && pdLongTrend != null",
      "claim": "I can see your threshold trend but I can't yet see how you hold up late in a long ride — that's a different thing and I won't guess at it.",
      "confidence": "settled",
      "citations": [
        "barsumyan2025",
        "valenzuela2023"
      ],
      "never_say": [
        "your FTP means you'll be fine on the long day",
        "your threshold predicts"
      ],
      "persona_lines": {
        "hammer": "Threshold's fine. Tells me nothing about hour four. Go do a long one so I can see.",
        "scientist": "Threshold power and durability are independent in the research. I have the first, not the second. A long ride with a hard effort late will tell us.",
        "encourager": "Your threshold's looking good — and the long-ride question is still open. One long ride with a push at the end and we'll know.",
        "pragmatist": "Threshold doesn't tell me how you'll do at hour four. One long ride with a hard bit late and I'll have an answer.",
        "competitor": "Threshold isn't the race. I need a long ride with a late effort before I'll say you're ready."
      }
    }
  ],
  "evals": [
    {
      "name": "middle_zone_drift_scientist",
      "state": {
        "persona": "scientist",
        "midZoneShare4wk": 0.48,
        "hardSessions4wk": 0,
        "easySessions4wk": 1
      },
      "mustFire": [
        "TID-1-middle"
      ],
      "mustNotFire": [
        "TID-2-model"
      ]
    },
    {
      "name": "taper_two_weeks_out",
      "state": {
        "persona": "competitor",
        "weeksToEvent": 2,
        "rss3wkMean": 420,
        "weeklyHours4wkMean": 9
      },
      "mustFire": [
        "TPR-1-taper"
      ],
      "mustNotFire": [
        "TPR-2-underloaded"
      ]
    },
    {
      "name": "taper_low_volume_rider_uses_lighter_cut",
      "state": {
        "persona": "pragmatist",
        "weeksToEvent": 1.5,
        "rss3wkMean": 210,
        "weeklyHours4wkMean": 5
      },
      "mustFire": [
        "TPR-1-taper"
      ],
      "mustNotFire": [],
      "expectParam": {
        "rule": "TPR-1-taper",
        "volume_cut": 0.3
      }
    },
    {
      "name": "fresh_too_early",
      "state": {
        "persona": "hammer",
        "weeksToEvent": 3,
        "fs": 12,
        "tfi": 60,
        "afi": 40
      },
      "mustFire": [
        "TPR-2-underloaded"
      ],
      "mustNotFire": [
        "TPR-1-taper"
      ]
    },
    {
      "name": "monotony_flat_week",
      "state": {
        "persona": "encourager",
        "rss7d": [
          60,
          62,
          58,
          61,
          60,
          59,
          63
        ]
      },
      "mustFire": [
        "TPR-3-monotony"
      ],
      "mustNotFire": []
    },
    {
      "name": "varied_week_no_monotony",
      "state": {
        "persona": "encourager",
        "rss7d": [
          0,
          110,
          30,
          0,
          140,
          45,
          0
        ]
      },
      "mustFire": [],
      "mustNotFire": [
        "TPR-3-monotony"
      ]
    },
    {
      "name": "masters_top_end_fading_ef_stable",
      "state": {
        "persona": "hammer",
        "age": 52,
        "pdShortTrend": "behind",
        "efTrend": "consistent"
      },
      "mustFire": [
        "MST-2-top-end"
      ],
      "mustNotFire": []
    },
    {
      "name": "masters_no_age_gated_recovery",
      "state": {
        "persona": "scientist",
        "age": 58,
        "wellness": {
          "sleep": 4,
          "fatigue": 4,
          "mood": 4
        },
        "wellnessLowStreak": 0,
        "hrvBelowBandDays": 0,
        "hrvReadings7d": 5,
        "afi": 55,
        "tfi": 60
      },
      "mustFire": [],
      "mustNotFire": [
        "RDY-3-modify",
        "RDY-3-skip",
        "RDY-2-hrv-band"
      ]
    },
    {
      "name": "masters_no_strength",
      "state": {
        "persona": "pragmatist",
        "age": 45,
        "strengthSessions8wk": 0
      },
      "mustFire": [
        "MST-3-strength"
      ],
      "mustNotFire": []
    },
    {
      "name": "masters_return_from_break",
      "state": {
        "persona": "encourager",
        "age": 47,
        "daysSinceLastRide": 25
      },
      "mustFire": [
        "MST-4-return"
      ],
      "mustNotFire": []
    },
    {
      "name": "bad_subjective_good_hrv_trust_rider",
      "state": {
        "persona": "competitor",
        "wellness": {
          "sleep": 2,
          "fatigue": 2,
          "mood": 3
        },
        "wellnessLowStreak": 1,
        "hrvBelowBandDays": 0,
        "hrvReadings7d": 6,
        "afi": 70,
        "tfi": 65
      },
      "mustFire": [
        "RDY-4-trust-rider"
      ],
      "mustNotFire": [
        "RDY-2-hrv-band"
      ]
    },
    {
      "name": "two_bad_days_modify_not_skip",
      "state": {
        "persona": "hammer",
        "wellness": {
          "sleep": 2,
          "fatigue": 2,
          "mood": 3
        },
        "wellnessLowStreak": 2,
        "hrvBelowBandDays": 1,
        "hrvReadings7d": 4,
        "afi": 72,
        "tfi": 60
      },
      "mustFire": [
        "RDY-3-modify"
      ],
      "mustNotFire": [
        "RDY-3-skip"
      ]
    },
    {
      "name": "all_low_or_ill_is_skip",
      "state": {
        "persona": "encourager",
        "illnessFlag": true,
        "wellness": {
          "sleep": 3,
          "fatigue": 3,
          "mood": 3
        }
      },
      "mustFire": [
        "RDY-3-skip"
      ],
      "mustNotFire": [
        "RDY-3-modify",
        "RDY-3-cut"
      ]
    },
    {
      "name": "head_not_body_cut_to_20",
      "state": {
        "persona": "pragmatist",
        "wellness": {
          "sleep": 4,
          "fatigue": 4,
          "mood": 2
        },
        "wellnessLowStreak": 1
      },
      "mustFire": [
        "RDY-3-cut"
      ],
      "mustNotFire": [
        "RDY-3-modify",
        "RDY-3-skip"
      ]
    },
    {
      "name": "hrv_trend_three_days_feels_fine",
      "state": {
        "persona": "scientist",
        "hrvReadings7d": 5,
        "hrvBelowBandDays": 3,
        "wellnessLowStreak": 0,
        "wellness": {
          "sleep": 4,
          "fatigue": 4,
          "mood": 4
        }
      },
      "mustFire": [
        "RDY-2-hrv-band"
      ],
      "mustNotFire": [
        "RDY-4-trust-rider"
      ]
    },
    {
      "name": "hrv_single_low_day_ignored",
      "state": {
        "persona": "scientist",
        "hrvReadings7d": 5,
        "hrvBelowBandDays": 1,
        "wellnessLowStreak": 0
      },
      "mustFire": [],
      "mustNotFire": [
        "RDY-2-hrv-band"
      ]
    },
    {
      "name": "readiness_outranks_prescription",
      "state": {
        "persona": "hammer",
        "illnessFlag": true,
        "midZoneShare4wk": 0.5,
        "hardSessions4wk": 0
      },
      "mustFire": [
        "RDY-3-skip"
      ],
      "mustNotFire": [],
      "expectOrder": [
        "RDY-3-skip",
        "TID-1-middle"
      ]
    },
    {
      "name": "gravel_low_durability",
      "state": {
        "persona": "competitor",
        "goalType": "endurance_event",
        "weeksToEvent": 8,
        "freshVsFatiguedDrop5min": 0.16
      },
      "mustFire": [
        "DUR-1-low",
        "DUR-3-prescribe"
      ],
      "mustNotFire": [
        "DUR-4-no-ftp-inference"
      ]
    },
    {
      "name": "gravel_durability_unknown_no_guessing",
      "state": {
        "persona": "scientist",
        "goalType": "endurance_event",
        "pdLongTrend": "ahead",
        "freshVsFatiguedDrop5min": null
      },
      "mustFire": [
        "DUR-4-no-ftp-inference"
      ],
      "mustNotFire": [
        "DUR-1-low"
      ]
    },
    {
      "name": "max_three_rules_injected",
      "state": {
        "persona": "hammer",
        "age": 50,
        "strengthSessions8wk": 0,
        "daysSinceLastRide": 0,
        "midZoneShare4wk": 0.5,
        "hardSessions4wk": 0,
        "rss7d": [
          60,
          61,
          60,
          62,
          59,
          60,
          61
        ],
        "weeksToEvent": 2,
        "rss3wkMean": 300,
        "weeklyHours4wkMean": 8
      },
      "mustFire": [
        "TPR-1-taper",
        "TPR-3-monotony",
        "TID-1-middle"
      ],
      "mustNotFire": [],
      "expectInjectedCount": 3
    }
  ],
  "citations": {
    "seiler2010": "Seiler S. IJSPP 2010;5:276–91",
    "burnley2022": "Burnley M, Bearden SE, Jones AM. MSSE 2022;54:1032–4",
    "silvaoliveira2024": "Silva Oliveira P et al. Sports Med 2024;54:2071–95",
    "filipas2022": "Filipas L et al. Scand J Med Sci Sports 2022;32:498–511",
    "maunder2021": "Maunder E et al. Sports Med 2021;51:1619–28",
    "vanerp2021": "van Erp T et al. MSSE 2021;53:1903–10",
    "barsumyan2025": "Barsumyan A et al. BMC Sports Sci Med Rehabil 2025;17:192",
    "valenzuela2023": "Valenzuela PL et al. IJSPP 2023;18:99–103",
    "smyth2022": "Smyth B et al. Sports Med 2022;52:2283–95",
    "dudleyrode2025": "Dudley-Rode H et al. EJAP 2025;125:1349–59",
    "leo2022": "Leo P et al. Ger J Exerc Sport Res 2022;52:673–7",
    "saw2016": "Saw AE, Main LC, Gastin PB. BJSM 2016;50:281–91",
    "dueking2021": "Düking P et al. J Sci Med Sport 2021",
    "plews2013": "Plews DJ et al. Sports Med 2013;43:773–81",
    "plews2014": "Plews DJ et al. IJSPP 2014;9:783–90",
    "bosquet2007": "Bosquet L et al. MSSE 2007;39:1358–65",
    "wang2023": "Wang Z et al. PLOS One 2023;18:e0282838",
    "foster1998": "Foster C. MSSE 1998;30:1164–8",
    "murphy2024": "Murphy C et al. PLOS One 2024;19:e0303748",
    "periard2015": "Périard JD et al. Scand J Med Sci Sports 2015;25(S1):20–38",
    "reaburn2008": "Reaburn P, Dascombe B. Eur Rev Aging Phys Act 2008;5:31–42",
    "burtscher2022": "Burtscher J et al. IJERPH 2022;19:11050",
    "ronnestad2014": "Rønnestad BR, Mujika I. Scand J Med Sci Sports 2014;24:603–12",
    "ronnestad2010": "Rønnestad BR et al. EJAP 2010;110:1269–82",
    "ronnestad2015": "Rønnestad BR et al. IJSPP 2015;11:727–35",
    "llanoslagos2025": "Llanos-Lagos C et al. EJAP 2025;126:193–222"
  }
};

export default COACHING_RULES;
