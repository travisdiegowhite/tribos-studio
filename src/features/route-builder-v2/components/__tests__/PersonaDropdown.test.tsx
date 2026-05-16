import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { PersonaDropdown } from '../PersonaDropdown';

function renderDropdown(onChange = vi.fn().mockResolvedValue(undefined)) {
  return {
    onChange,
    ...render(
      <MantineProvider>
        <PersonaDropdown persona="pragmatist" onChange={onChange} />
      </MantineProvider>,
    ),
  };
}

describe('PersonaDropdown', () => {
  it('renders the current persona', () => {
    renderDropdown();
    expect(screen.getByTestId('rb2-persona-dropdown')).toHaveTextContent('Pragmatist');
  });

  it('calls onChange when a different persona is selected', async () => {
    const { onChange } = renderDropdown();
    fireEvent.click(screen.getByTestId('rb2-persona-dropdown'));
    const hammer = await screen.findByText('The Hammer');
    fireEvent.click(hammer);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('hammer'));
  });

  it('does not call onChange when the current persona is reselected', () => {
    const { onChange } = renderDropdown();
    fireEvent.click(screen.getByTestId('rb2-persona-dropdown'));
    const current = screen.getAllByText('The Pragmatist')[0];
    fireEvent.click(current);
    expect(onChange).not.toHaveBeenCalled();
  });
});
