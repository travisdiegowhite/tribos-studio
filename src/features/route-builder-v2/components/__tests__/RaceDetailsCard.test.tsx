import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { RaceDetailsCard } from '../RaceDetailsCard';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';

function renderCard() {
  return render(
    <MantineProvider>
      <RaceDetailsCard />
    </MantineProvider>,
  );
}

describe('RaceDetailsCard', () => {
  beforeEach(() => {
    useRouteBuilderStore.getState().resetAll();
  });

  it('hides date/finish until a race type is chosen', () => {
    renderCard();
    expect(screen.getByTestId('rb2-race-type')).toBeInTheDocument();
    expect(screen.queryByTestId('rb2-race-date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rb2-race-finish')).not.toBeInTheDocument();
  });

  it('reveals date + finish + clear once a race type is set in the store', () => {
    useRouteBuilderStore.getState().setRaceType('gravel');
    renderCard();
    expect(screen.getByTestId('rb2-race-date')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-race-finish')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-race-clear')).toBeInTheDocument();
  });

  it('clear resets all race fields', () => {
    const store = useRouteBuilderStore.getState();
    store.setRaceType('criterium');
    store.setRaceDate('2026-08-01');
    store.setTargetFinishMinutes(90);
    renderCard();
    fireEvent.click(screen.getByTestId('rb2-race-clear'));
    const s = useRouteBuilderStore.getState();
    expect(s.raceType).toBeNull();
    expect(s.raceDate).toBeNull();
    expect(s.targetFinishMinutes).toBeNull();
  });
});
