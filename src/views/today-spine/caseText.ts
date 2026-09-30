/**
 * Display-case helpers for Today. The spine's data layer keeps its uppercase
 * labels (date labels like 'TUE 30 JUN', state words like 'STEADY') because
 * logic and tests key on them; the blend design sets them in sentence case,
 * so conversion happens here, at display time only.
 */

const KEEP_UPPER = new Set(['TFI', 'AFI', 'RSS', 'FTP', 'AI', 'HR', 'EP', 'RI', 'W', 'KM', 'MI', 'FT', 'KJ', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7']);

function wordCase(word: string, capitalize: boolean): string {
  if (KEEP_UPPER.has(word.toUpperCase().replace(/[^A-Z0-9]/g, ''))) return word.toUpperCase();
  const lower = word.toLowerCase();
  return capitalize ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

/** 'FITNESS · TFI · 42-DAY' → 'Fitness · TFI · 42-day' */
export function sentenceCase(text: string): string {
  let first = true;
  return text.replace(/[A-Za-z0-9’'-]+/g, (w) => {
    const out = wordCase(w, first);
    first = false;
    return out;
  });
}

/** 'TUE 30 JUN' → 'Tue 30 Jun' (every word capitalised — for dates). */
export function titleCase(text: string): string {
  return text.replace(/[A-Za-z0-9’'-]+/g, (w) => wordCase(w, true));
}
