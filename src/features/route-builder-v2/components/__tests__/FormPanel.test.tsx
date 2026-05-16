import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { FormPanel } from '../FormPanel';
import type { UseAIGenerationReturn } from '../../../../hooks/route-builder';

function makeGen(overrides: Partial<UseAIGenerationReturn> = {}): UseAIGenerationReturn {
  return {
    isGenerating: false,
    lastError: null,
    suggestions: [],
    generate: vi.fn().mockResolvedValue(undefined),
    selectSuggestion: vi.fn(),
    clearSuggestions: vi.fn(),
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof FormPanel>> = {}) {
  const generation = props.generation ?? makeGen();
  return {
    generation,
    ...render(
      <MantineProvider>
        <FormPanel generation={generation} {...props} />
      </MantineProvider>,
    ),
  };
}

describe('FormPanel', () => {
  it('renders collapsed by default', () => {
    renderPanel();
    const toggle = screen.getByTestId('rb2-form-panel-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('rb2-form-submit')).toBeNull();
  });

  it('expands on toggle click', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    expect(screen.getByTestId('rb2-form-submit')).toBeInTheDocument();
  });

  it('calls generate.generate on submit', async () => {
    const { generation } = renderPanel();
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    fireEvent.click(screen.getByTestId('rb2-form-submit'));
    expect(generation.generate).toHaveBeenCalledTimes(1);
  });

  it('renders an error banner when lastError is set', () => {
    renderPanel({ generation: makeGen({ lastError: 'Boom' }) });
    fireEvent.click(screen.getByTestId('rb2-form-panel-toggle'));
    expect(screen.getByTestId('rb2-form-error')).toHaveTextContent('Boom');
  });
});
