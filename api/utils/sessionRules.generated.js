/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/coaching-bible/session-rules.yaml
 * Regenerate: npm run build:session-rules
 *
 * sessionRules.test.js fails if this file and the YAML disagree.
 */

export const SESSION_RULES = {
  "version": 1,
  "rules": [
    {
      "id": "SES-VO2-1",
      "family": "vo2max",
      "claim": "Short intermittent efforts (30/15s, 40/20s) accumulate the most time near VO2max for the least fatigue, so they open a block and defend a lagging top end.",
      "confidence": "leaning",
      "citations": [
        "ronnestad2015",
        "ronnestad2020",
        "ronnestad2022",
        "bossi2020"
      ],
      "decides": "Micro-interval formats: 3 sets of 10–13 × 30/15 s or 8–10 × 40/20 s at 115–125 % FTP, 3–4 min between sets.",
      "params": {
        "sets": 3,
        "set_recovery_min_30_15": 3,
        "set_recovery_min_40_20": 4,
        "pct_ftp": [
          115,
          125
        ]
      },
      "notes": "Rønnestad's 30/15 protocol beat 4×5 min on VO2max, power at 4 mmol and 40-min TT in trained cyclists over 3 weeks (2015) and again over 10 weeks against effort-matched 4×5 (2020). Time ≥ 90 % VO2max per session is the proposed mechanism (Bossi 2020). Amateur evidence is thin but direction is consistent.\n"
    },
    {
      "id": "SES-VO2-2",
      "family": "vo2max",
      "claim": "Three- to five-minute efforts at 108–120 % FTP are the general-purpose VO2 format; they raise the dose in the middle of a block and fit a short day.",
      "confidence": "settled",
      "citations": [
        "helgerud2007",
        "buchheit2013a",
        "milanovic2015"
      ],
      "decides": "4×4 (110–118 %), 5×4 (108–115 %), 5×3 (112–120 %); 3–4 min recovery.",
      "params": {
        "pct_ftp_4x4": [
          110,
          118
        ],
        "pct_ftp_5x4": [
          108,
          115
        ],
        "pct_ftp_5x3": [
          112,
          120
        ],
        "recovery_min_4x4": 3,
        "recovery_min_5x4": 4,
        "recovery_min_5x3": 3
      },
      "notes": "Helgerud 2007: 4×4 at 90–95 % HRmax improved VO2max more than lactate-threshold or long slow distance work matched for total work. Meta-analytic support for 3–5 min intervals is the strongest of any VO2 format (Milanović 2015).\n"
    },
    {
      "id": "SES-VO2-3",
      "family": "vo2max",
      "claim": "Eight-minute efforts at 105–112 % FTP produced the largest gains in Seiler's 4×4 / 4×8 / 4×16 comparison and suit an athlete who can already hold VO2 work and a long event ahead.",
      "confidence": "leaning",
      "citations": [
        "seiler2013"
      ],
      "decides": "3–5 × 8 min at 105–112 %, 4 min recovery, later in a block.",
      "params": {
        "pct_ftp": [
          105,
          112
        ],
        "recovery_min": 4
      },
      "notes": "Seiler 2013 (n=35 trained cyclists, 7 weeks): 4×8 at ~90 % HRmax outperformed 4×4 and 4×16 on VO2max and 40-min power. One study; direction supported by the time-at-intensity argument. Contested against 30/15s (Rønnestad 2020).\n"
    },
    {
      "id": "SES-THR-1",
      "family": "threshold",
      "claim": "Threshold is trained in 8–20 minute blocks at 95–103 % FTP; total time at intensity, not any single format, drives the adaptation.",
      "confidence": "settled",
      "citations": [
        "seiler2010",
        "laursen2019",
        "sylta2016"
      ],
      "decides": "2×20 (95–100), 3×12 (96–102), 4×10 (98–103), 3×8 (98–104) for a short day, 3×20 (93–99) for a long one; 4–6 min recovery.",
      "params": {
        "pct_ftp_2x20": [
          95,
          100
        ],
        "pct_ftp_3x12": [
          96,
          102
        ],
        "pct_ftp_4x10": [
          98,
          103
        ],
        "pct_ftp_3x8": [
          98,
          104
        ],
        "pct_ftp_3x20": [
          93,
          99
        ],
        "short_day_max_min": 54,
        "long_day_min_min": 100
      },
      "notes": "Sylta 2016 compared 4×16, 4×8 and 4×4 across 12 weeks with matched session RPE; no format won on performance, and 4×16 improved ~40-min power as much as the shorter ones. The practical rule is total minutes at intensity per week.\n"
    },
    {
      "id": "SES-THR-2",
      "family": "sweet_spot",
      "claim": "Sweet spot (88–94 % FTP) buys sustained time at intensity at a fatigue cost between tempo and threshold; it is dosed in 12–20 minute blocks.",
      "confidence": "leaning",
      "citations": [
        "seiler2010",
        "sylta2016"
      ],
      "decides": "2×20 (88–92), 3×15 (88–93), 4×12 (89–94), 3×20 (88–92); 4–5 min recovery.",
      "params": {
        "pct_ftp_2x20": [
          88,
          92
        ],
        "pct_ftp_3x15": [
          88,
          93
        ],
        "pct_ftp_4x12": [
          89,
          94
        ],
        "pct_ftp_3x20": [
          88,
          92
        ]
      },
      "notes": "No trial isolates sweet spot from threshold. The band is a practitioner convention (Coggan) sitting inside the 4×16-type evidence. Graded leaning on that basis, not on a sweet-spot-specific RCT.\n"
    },
    {
      "id": "SES-THR-3",
      "family": "tempo",
      "claim": "Tempo (78–87 % FTP) is one or two long blocks; it is the middle zone TID-1 warns about, so it is prescribed deliberately, not as a default.",
      "confidence": "leaning",
      "citations": [
        "seiler2010",
        "burnley2022"
      ],
      "decides": "2×20 (80–87) or 1×40 (78–85); 5–8 min recovery.",
      "params": {
        "pct_ftp_2x20": [
          80,
          87
        ],
        "pct_ftp_1x40": [
          78,
          85
        ]
      }
    },
    {
      "id": "SES-ANA-1",
      "family": "anaerobic",
      "claim": "Anaerobic capacity is trained with 1–2 minute efforts at 125–160 % FTP and full recovery; quality falls fast once recovery is cut.",
      "confidence": "leaning",
      "citations": [
        "buchheit2013b",
        "laursen2019"
      ],
      "decides": "6–10 × 1 min (140–160), 4–8 × 2 min (125–135); 4 min recovery.",
      "params": {
        "pct_ftp_8x1": [
          140,
          160
        ],
        "pct_ftp_6x2": [
          125,
          135
        ],
        "recovery_min": 4
      }
    },
    {
      "id": "SES-ANA-2",
      "family": "sprint",
      "claim": "Sprints are 6–12 × 30 s at 170 %+ FTP with near-complete recovery; the session is judged on the quality of the last one.",
      "confidence": "leaning",
      "citations": [
        "buchheit2013b"
      ],
      "decides": "6–12 × 30 s (170–220), 4.5 min recovery.",
      "params": {
        "pct_ftp": [
          170,
          220
        ],
        "recovery_min": 4.5
      }
    },
    {
      "id": "SES-RACE-1",
      "family": "racing",
      "claim": "A race simulation stacks sustained threshold work and then short attacks on tired legs, because that is the order races impose.",
      "confidence": "contested",
      "citations": [
        "laursen2019"
      ],
      "decides": "2–3 × 10 min (95–102) then 4–6 × 30 s (150–170).",
      "params": {
        "threshold_pct_ftp": [
          95,
          102
        ],
        "attack_pct_ftp": [
          150,
          170
        ]
      },
      "notes": "Mechanism-supported; no trial compares race-simulation formats in amateurs."
    },
    {
      "id": "SES-RACE-2",
      "family": "openers",
      "claim": "Openers the day before an event are 3–4 × 1 min at 100–110 % FTP: enough to prime, nothing to recover from.",
      "confidence": "leaning",
      "citations": [
        "bosquet2007"
      ],
      "decides": "3–4 × 1 min (100–110), 3 min recovery.",
      "params": {
        "pct_ftp": [
          100,
          110
        ],
        "recovery_min": 3
      }
    },
    {
      "id": "SES-END-1",
      "family": "endurance",
      "claim": "For an endurance or gravel goal with low durability, the long ride carries its key effort after 20 kJ/kg of work, with fuelling; the designer places it once durability inputs exist.",
      "confidence": "leaning",
      "citations": [
        "vanerp2021",
        "maunder2021",
        "barsumyan2025"
      ],
      "decides": "Steady Z2 (65–75 % FTP) with a late 15–20 min block at 88–95 % after ≥ 20 kJ/kg. NOT YET APPLIED: freshVsFatiguedDrop5min is null until the bible's Phase 4 lands.",
      "params": {
        "late_effort_after_kj_per_kg": 20,
        "late_effort_min": [
          15,
          20
        ],
        "late_effort_pct_ftp": [
          88,
          95
        ],
        "z2_pct_ftp": [
          65,
          75
        ]
      }
    },
    {
      "id": "SES-WR-1",
      "family": "all",
      "claim": "Recovery between efforts is easy riding at about half of FTP, roughly equal to the effort for VO2 work and a quarter to a half of it for threshold; warmup and cooldown are endurance, not tempo.",
      "confidence": "settled",
      "citations": [
        "buchheit2013a",
        "seiler2010"
      ],
      "decides": "Recovery, warmup and cooldown intensities; the per-format recovery lengths above.",
      "params": {
        "recovery_pct_ftp": 50,
        "warmup_pct_ftp": 65,
        "cooldown_pct_ftp": 50,
        "min_warmup_min": 8,
        "min_cooldown_min": 5,
        "warmup_share_of_spare": 0.6
      }
    },
    {
      "id": "SES-PROG-1",
      "family": "all",
      "claim": "Within a block, dose progresses by lengthening or adding efforts week to week rather than by raising intensity; week one establishes the format, week three or four peaks it.",
      "confidence": "leaning",
      "citations": [
        "seiler2010",
        "laursen2019",
        "foster1998"
      ],
      "decides": "weekInBlock 0 → introductory format, 1 → middle, 2+ → peak (VO2: 30/15s → 5×4 → 4×8; threshold: 2×20 → 3×12 → 4×10; sweet spot: 2×20 → 3×15 → 4×12). Repeat counts grow to the load budget inside each format's range.",
      "params": {
        "week_intro": 0,
        "week_middle": 1,
        "week_peak": 2
      }
    },
    {
      "id": "SES-CAL-1",
      "family": "all",
      "claim": "An FTP is a measurement with an age. For an athlete riding consistently it is stale after 30 days (four or more rides a week) or 45 days (two or more); past that, the 90-day power bests set the targets when they disagree with it by more than 3 %.",
      "confidence": "leaning",
      "citations": [
        "allen2019",
        "mackey2021"
      ],
      "decides": "Which FTP the targets are computed from. Stored %FTP stays relative to the profile FTP, because that is the number on the head unit.",
      "params": {
        "stale_days_high": 30,
        "stale_days_consistent": 45,
        "stale_days_sparse": 90,
        "rides_per_week_high": 4,
        "rides_per_week_consistent": 2,
        "override_min_delta": 0.03,
        "ftp_from_p1200": 0.95,
        "ftp_from_p300": 0.75
      },
      "notes": "The 30/45-day windows are the founder's decision for Tribos's population, not a literature value; the 95 %-of-20-min convention is Allen & Coggan's, and its individual error (±5–8 %) is why a 3 % disagreement is the override floor.\n"
    },
    {
      "id": "SES-CAL-2",
      "family": "vo2max",
      "claim": "An effort above critical power spends W′ at (P − CP) × t; a single interval that would spend more than 85 % of W′ is not repeatable, so its band is lowered until it is.",
      "confidence": "leaning",
      "citations": [
        "jones2010",
        "skiba2012",
        "poole2016"
      ],
      "decides": "The W′ cap on any effort above CP; targets are lowered, never shortened.",
      "params": {
        "wprime_max_share": 0.85,
        "floor_over_cp": 1.02,
        "band_width_below_cap": 0.96
      },
      "notes": "CP/W′ from a two-parameter fit of 1/5/10/20-minute bests (three or more points). The 85 % share is a design decision; the model's validity for prescription in trained cyclists is well supported (Poole 2016).\n"
    },
    {
      "id": "SES-CAL-3",
      "family": "vo2max",
      "claim": "VO2 targets are set from the athlete's 5-minute best rather than a fixed fraction of FTP, because the FTP-to-5-minute ratio varies by ±10 % between riders.",
      "confidence": "leaning",
      "citations": [
        "allen2019",
        "pinot2011"
      ],
      "decides": "Fraction of the 5-minute best by effort length: micro (≤ 1 min) 100–108 %, short (2–3 min) 95–102 %, medium (4–5 min) 90–97 %, long (8 min) 85–91 %.",
      "params": {
        "p300_fraction_micro": [
          1,
          1.08
        ],
        "p300_fraction_short": [
          0.95,
          1.02
        ],
        "p300_fraction_medium": [
          0.9,
          0.97
        ],
        "p300_fraction_long": [
          0.85,
          0.91
        ]
      }
    },
    {
      "id": "SES-DOSE-1",
      "family": "all",
      "claim": "The number of efforts is chosen so the session's predicted load lands within 5 RSS of the coach's budget; when the format cannot reach it in the time, the design says so rather than adding intensity.",
      "confidence": "leaning",
      "citations": [
        "foster1998",
        "coggan2006"
      ],
      "decides": "Repeat count within each format's range. Predicted RSS = Σ (%FTP/100)² × minutes/60 × 100.",
      "params": {
        "load_tolerance_rss": 5
      }
    },
    {
      "id": "SES-DOSE-2",
      "family": "all",
      "claim": "Duration wins over load: a session that does not fit the day is not a session. Efforts are shed before intensity is raised.",
      "confidence": "settled",
      "citations": [
        "coggan2006"
      ],
      "decides": "Shed repeats to the format minimum, then sets, when the smallest version overruns the planned length.",
      "params": {}
    },
    {
      "id": "GATE-FS",
      "family": "all",
      "claim": "At a form score of −15 or below there is no quality work today; the session becomes 75 minutes of endurance at 55 RSS.",
      "confidence": "leaning",
      "citations": [
        "coggan2006",
        "foster1998"
      ],
      "decides": "Quality → endurance substitution.",
      "params": {
        "form_score_no_quality": -15,
        "eased_load_rss": 55,
        "eased_max_min": 75
      }
    },
    {
      "id": "GATE-AFI",
      "family": "all",
      "claim": "When acute fatigue has grown past the recovery-mode ceiling in four days, the dose is trimmed by a quarter and the format kept.",
      "confidence": "leaning",
      "citations": [
        "foster1998"
      ],
      "decides": "Target load × 0.75 before dose sizing.",
      "params": {
        "trim_factor": 0.75
      }
    },
    {
      "id": "SES-MOD-1",
      "family": "all",
      "claim": "On an RDY-3 modify call the session keeps its intensity and loses about half its sets and 40 % of its length; on a skip it becomes rest.",
      "confidence": "leaning",
      "citations": [
        "saw2016",
        "dueking2021"
      ],
      "decides": "Set factor and duration factor for a modify; rest for a skip.",
      "params": {
        "set_factor": 0.5,
        "duration_factor": 0.6,
        "min_duration_min": 30
      }
    }
  ],
  "citations": {
    "ronnestad2015": "Rønnestad BR, Hansen J, Vegge G, Tønnessen E, Slettaløkken G. Scand J Med Sci Sports 2015;25:143–51 — 30/15 s vs 4×5 min, trained cyclists, 10 wk",
    "ronnestad2020": "Rønnestad BR, Hansen J, Nygaard H, Lundby C. Scand J Med Sci Sports 2020;30:849–57 — 3×13 × 30/15 vs 4×5 min, effort-matched, 3 wk",
    "ronnestad2022": "Rønnestad BR et al. Front Physiol 2022 — short-interval mechanisms review [verify]",
    "bossi2020": "Bossi AH et al. IJSPP 2020;15:982–9 — time ≥ 90 % VO2max in varied-intensity intervals",
    "helgerud2007": "Helgerud J et al. MSSE 2007;39:665–71 — 4×4 vs LT vs LSD, matched work",
    "buchheit2013a": "Buchheit M, Laursen PB. Sports Med 2013;43:313–38 — HIIT programming part I",
    "buchheit2013b": "Buchheit M, Laursen PB. Sports Med 2013;43:927–54 — HIIT programming part II (anaerobic, neuromuscular)",
    "milanovic2015": "Milanović Z, Sporiš G, Weston M. Sports Med 2015;45:1469–81 — HIIT vs continuous on VO2max, meta-analysis",
    "seiler2013": "Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Scand J Med Sci Sports 2013;23:74–83 — 4×4 vs 4×8 vs 4×16",
    "seiler2010": "Seiler S. IJSPP 2010;5:276–91",
    "sylta2016": "Sylta Ø et al. MSSE 2016;48:2165–74 — 4×16 vs 4×8 vs 4×4, 12 wk, matched RPE",
    "laursen2019": "Laursen PB, Buchheit M (eds). Science and Application of High-Intensity Interval Training. Human Kinetics 2019",
    "burnley2022": "Burnley M, Bearden SE, Jones AM. MSSE 2022;54:1032–4",
    "foster1998": "Foster C. MSSE 1998;30:1164–8 — monotony and strain",
    "coggan2006": "Allen H, Coggan A. Training and Racing with a Power Meter. VeloPress 2006 — TSS, zones, session construction conventions",
    "allen2019": "Allen H, Coggan A, McGregor S. Training and Racing with a Power Meter, 3rd ed. VeloPress 2019 — FTP testing conventions, 95 % of 20 min",
    "mackey2021": "Mackey J, Horner K. J Sci Cycling 2021 — reliability of FTP field tests [verify]",
    "jones2010": "Jones AM, Vanhatalo A, Burnley M, Morton RH, Poole DC. MSSE 2010;42:1876–90 — critical power: implications for training",
    "skiba2012": "Skiba PF, Chidnok W, Vanhatalo A, Jones AM. MSSE 2012;44:1526–32 — W′ balance model",
    "poole2016": "Poole DC, Burnley M, Vanhatalo A, Rossiter HB, Jones AM. MSSE 2016;48:2320–34 — critical power review",
    "pinot2011": "Pinot J, Grappe F. J Sports Sci 2011;29:1391–8 — record power profile, ratio variability",
    "bosquet2007": "Bosquet L et al. MSSE 2007;39:1358–65 — taper meta-analysis (keep intensity)",
    "vanerp2021": "van Erp T et al. MSSE 2021;53:1903–10",
    "maunder2021": "Maunder E et al. Sports Med 2021;51:1619–28",
    "barsumyan2025": "Barsumyan A et al. BMC Sports Sci Med Rehabil 2025;17:192",
    "saw2016": "Saw AE, Main LC, Gastin PB. BJSM 2016;50:281–91",
    "dueking2021": "Düking P et al. J Sci Med Sport 2021"
  }
};

export default SESSION_RULES;
