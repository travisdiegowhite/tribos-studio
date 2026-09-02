import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  tablesFromMigrations,
  tablesFromCode,
  unbackedTables,
  EXTERNALLY_CREATED,
  RETIRED,
} from '../../scripts/lib/schemaExpectations.js';

// vitest runs from the repo root.
const MIGRATIONS = join(process.cwd(), 'database', 'migrations');
const API = join(process.cwd(), 'api');

const migrationTables = tablesFromMigrations(MIGRATIONS);
const codeTables = tablesFromCode(API);

describe('schema contract: code vs migrations', () => {
  it('finds both sides', () => {
    expect(migrationTables.size).toBeGreaterThan(50);
    expect(codeTables.size).toBeGreaterThan(30);
  });

  it('every table the API queries is created by a migration', () => {
    // The cheap half of the problem: a table name in code that no migration
    // creates is a typo or an undocumented hand-made table. CI can catch this
    // without a database.
    //
    // The EXPENSIVE half — a migration that exists but was never APPLIED — is
    // invisible here by construction. That is what `npm run audit:schema`
    // is for; run it against production when a feature mysteriously does
    // nothing.
    const missing = unbackedTables(codeTables, migrationTables);
    const report = missing
      .map((m) => `  ${m.name}  (read by ${[...new Set(m.files)].join(', ')})`)
      .join('\n');
    expect(missing, `Tables read by api/ that no migration creates:\n${report}`).toEqual([]);
  });

  it('keeps the externally-created allowlist honest', () => {
    // An entry here that a migration DOES create is stale bookkeeping, and it
    // would mask a real miss for that table.
    const stale = [...EXTERNALLY_CREATED].filter((t) => migrationTables.has(t));
    expect(stale, `Allowlisted as external but a migration creates them: ${stale.join(', ')}`)
      .toEqual([]);
  });

  it('keeps the retired list honest', () => {
    // Retired means "a migration creates it and nothing reads it". A retired
    // table that code has started reading again is a contradiction worth
    // failing on.
    const resurrected = [...RETIRED].filter((t) => codeTables.has(t));
    expect(resurrected, `Marked retired but api/ reads them: ${resurrected.join(', ')}`)
      .toEqual([]);
  });

  it('names the two tables this guard was written for', () => {
    // Regression anchor. Both were committed migrations that never ran; both
    // are read by api/ code. If either ever drops out of the migrations
    // directory, the first test above starts failing instead of the app.
    expect(migrationTables.get('fitness_evidence_weekly')).toBe('106_fitness_evidence_weekly.sql');
    expect(migrationTables.get('fitness_summaries')).toBe('054_fitness_language_layer.sql');
    expect(codeTables.has('fitness_evidence_weekly')).toBe(true);
    expect(codeTables.has('fitness_summaries')).toBe(true);
  });
});
