import { describe, it, expect } from 'vitest';
import { resolveTrainTab, trainHref } from './trainTabs';

const r = (q: string) => resolveTrainTab(new URLSearchParams(q));

describe('resolveTrainTab', () => {
  it('reads the six tabs', () => {
    for (const tab of ['calendar', 'season', 'coach', 'progress', 'rides', 'events']) {
      expect(r(`tab=${tab}`)).toEqual({ tab, view: null, browse: false });
    }
  });

  it('defaults to the calendar', () => {
    expect(r('')).toEqual({ tab: 'calendar', view: null, browse: false });
    expect(r('tab=nonsense')).toEqual({ tab: 'calendar', view: null, browse: false });
  });

  it('redirects every old tab', () => {
    expect(r('tab=race')).toEqual({ tab: 'season', view: 'race', browse: false });
    expect(r('tab=trends').tab).toBe('progress');
    expect(r('tab=power').tab).toBe('progress');
    expect(r('tab=insights').tab).toBe('progress');
    expect(r('tab=history')).toEqual({ tab: 'rides', view: null, browse: false });
    expect(r('tab=repeats')).toEqual({ tab: 'rides', view: 'repeats', browse: false });
    expect(r('tab=browse')).toEqual({ tab: 'calendar', view: null, browse: true });
  });

  it('accepts views only on the tab that has them', () => {
    expect(r('tab=rides&view=repeats').view).toBe('repeats');
    expect(r('tab=season&view=race').view).toBe('race');
    expect(r('tab=coach&view=race').view).toBeNull();
    expect(r('tab=events&view=race').view).toBeNull();
    expect(r('tab=calendar&browse=1').browse).toBe(true);
    expect(r('tab=coach&browse=1').browse).toBe(false);
  });
});

describe('trainHref', () => {
  it('keeps extra params such as ride and segment', () => {
    expect(trainHref('rides', { ride: 'abc' })).toBe('/train?tab=rides&ride=abc');
    expect(trainHref('rides', { view: 'repeats', segment: 's 1' })).toBe('/train?tab=rides&view=repeats&segment=s+1');
  });
});
