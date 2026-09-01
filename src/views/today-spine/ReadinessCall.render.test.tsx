import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ReadinessCall, type ReadinessVerdict } from './ReadinessCall';

function draw(verdict: ReadinessVerdict | null) {
  return render(
    <MantineProvider>
      <ReadinessCall verdict={verdict} />
    </MantineProvider>
  );
}

const verdict = (over: Partial<ReadinessVerdict> = {}): ReadinessVerdict => ({
  id: 'RDY-3-skip',
  claim: 'Today is a skip, not a modify.',
  confidence: 'leaning',
  personaLine: 'Not today. Sick or wrecked is a rest day, full stop. Come back hungry.',
  ...over,
});

describe('ReadinessCall', () => {
  it('renders nothing on a day when no rule fires', () => {
    // MantineProvider emits its own responsive <style> block, so assert on
    // what the component contributes rather than on an empty container.
    draw(null);
    expect(screen.queryByText(/TODAY'S CALL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rest day/i)).not.toBeInTheDocument();
  });

  it('speaks the persona line the engine wrote, not a rephrasing', () => {
    draw(verdict());
    expect(screen.getByText(/Sick or wrecked is a rest day/)).toBeInTheDocument();
  });

  it('labels the call so the answer is readable without reading the sentence', () => {
    draw(verdict());
    expect(screen.getByText("TODAY'S CALL — REST")).toBeInTheDocument();
  });

  it('names the confidence when the research is not settled', () => {
    draw(verdict({ confidence: 'leaning' }));
    expect(screen.getByText(/research leans this way/i)).toBeInTheDocument();
  });

  it('says nothing extra when the research is settled', () => {
    draw(verdict({ id: 'RDY-4-trust-rider', confidence: 'settled' }));
    expect(screen.queryByText(/research/i)).not.toBeInTheDocument();
  });

  it('falls back to a plain heading for a rule id it does not know', () => {
    draw(verdict({ id: 'RDY-9-future' }));
    expect(screen.getByText("TODAY'S CALL")).toBeInTheDocument();
  });

  it('shows the claim only through the persona line — no metric jargon leaks', () => {
    const { container } = draw(verdict({ id: 'RDY-2-hrv-band' }));
    for (const banned of ['HRV', 'rMSSD', 'TSS', 'CTL', 'readiness score']) {
      expect(container.textContent).not.toContain(banned);
    }
  });
});
