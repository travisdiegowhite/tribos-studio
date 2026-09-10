/**
 * Sentences for the backload flows. Pure, so the copy is testable: the
 * preview line, the "and these stay put" clause, and the toast.
 */

import type { BackfillSkipped, BackfillSummary, ProviderGearItem } from '../../hooks/useGear';
import { formatWhole } from './wearSeries';

const unitShort = (useImperial: boolean) => (useImperial ? 'mi' : 'km');

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "212 rides, 4,120 mi — 3,900 road, 220 gravel." */
export function describeSummary(summary: BackfillSummary, useImperial: boolean): string {
  if (!summary.rides) return 'No rides to link.';
  const u = unitShort(useImperial);
  const mix = [
    summary.bySurface.road > 0 ? `${formatWhole(summary.bySurface.road, useImperial)} road` : null,
    summary.bySurface.offroad > 0 ? `${formatWhole(summary.bySurface.offroad, useImperial)} gravel or trail` : null,
    summary.bySurface.indoor > 0 ? `${formatWhole(summary.bySurface.indoor, useImperial)} on the trainer` : null,
  ].filter((s): s is string => Boolean(s));
  const head = `${plural(summary.rides, 'ride')}, ${formatWhole(summary.distanceM, useImperial)} ${u}`;
  return mix.length > 1 ? `${head} — ${mix.join(', ')}.` : `${head}.`;
}

/** "14 are on Tarmac by hand and stay there. 8 more are on Tarmac already." */
export function describeSkipped(skipped: BackfillSkipped, includeAuto: boolean): string {
  const parts: string[] = [];
  const protectedTotal = skipped.byGear.reduce((s, g) => s + g.protected, 0);
  if (protectedTotal > 0) {
    const where = joinList(skipped.byGear.filter((g) => g.protected > 0).map((g) => g.name));
    parts.push(`${protectedTotal.toLocaleString('en-US')} ${protectedTotal === 1 ? 'is' : 'are'} on ${where} by hand and ${protectedTotal === 1 ? 'stays' : 'stay'} there.`);
  }
  const otherTotal = skipped.byGear.reduce((s, g) => s + g.otherBike, 0);
  if (otherTotal > 0) {
    const where = joinList(skipped.byGear.filter((g) => g.otherBike > 0).map((g) => g.name));
    parts.push(includeAuto
      ? `${otherTotal.toLocaleString('en-US')} Strava put on ${where} ${otherTotal === 1 ? 'stays' : 'stay'} there.`
      : `${otherTotal.toLocaleString('en-US')} ${otherTotal === 1 ? 'is' : 'are'} on ${where} already — untick the box to take ${otherTotal === 1 ? 'it' : 'them'} over.`);
  }
  if (skipped.alreadyHere > 0) {
    parts.push(`${skipped.alreadyHere.toLocaleString('en-US')} ${skipped.alreadyHere === 1 ? 'is' : 'are'} on this bike already.`);
  }
  return parts.join(' ');
}

/** The opening line on the card. */
export function describeUnassigned(count: number, oldest: string | null): string {
  if (!count) return 'Every ride you have is on a bike.';
  const since = oldest ? ` going back to ${formatMonth(oldest)}` : '';
  return `${plural(count, 'ride')} ${count === 1 ? 'isn’t' : 'aren’t'} on any bike yet,${since}.`.replace(',.', '.');
}

export function describeLinked(linked: number, distanceM: number, useImperial: boolean): string {
  if (!linked) return 'Nothing new to link — those rides were already here.';
  return `Linked ${plural(linked, 'ride')}, ${formatWhole(distanceM, useImperial)} ${unitShort(useImperial)}.`;
}

/** "Road · 212 rides · 4,120 mi · Mar 2024 – Sep 2026" */
export function describeProviderGear(item: ProviderGearItem, useImperial: boolean): string {
  const span = item.firstDate && item.lastDate
    ? (formatMonth(item.firstDate) === formatMonth(item.lastDate) ? formatMonth(item.firstDate) : `${formatMonth(item.firstDate)} – ${formatMonth(item.lastDate)}`)
    : null;
  return [plural(item.rides, 'ride'), `${formatWhole(item.distanceM, useImperial)} ${unitShort(useImperial)}`, span].filter(Boolean).join(' · ');
}

export function providerGearName(item: ProviderGearItem): string {
  if (item.name) return item.name;
  const bm = [item.brand, item.model].filter(Boolean).join(' ');
  if (bm) return bm;
  return `Strava bike ${item.providerGearId}`;
}

export function formatMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  if (!y || !m) return dateKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
