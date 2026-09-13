import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const resetPassword = vi.fn();
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: (...args) => resetPassword(...args),
  }),
}));

import Auth from '../Auth.jsx';

function renderAt(url) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Auth page modes', () => {
  beforeEach(() => {
    resetPassword.mockReset();
  });

  it('opens in sign-in mode by default', () => {
    renderAt('/auth');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('opens the signup form from ?mode=signup', () => {
    // The guest route-builder modal and the landing CTAs link here; this
    // used to land on "Welcome back" when the router state was missing.
    renderAt('/auth?mode=signup');
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    expect(screen.queryByText(/added to the beta list/)).not.toBeInTheDocument();
  });

  it('explains a failed callback from ?error=callback_failed', () => {
    renderAt('/auth?error=callback_failed');
    expect(screen.getByText(/couldn't complete sign-in from that link/)).toBeInTheDocument();
  });

  it('sends a reset link from the forgot-password form with a neutral message', async () => {
    resetPassword.mockResolvedValue({ data: {}, error: null });
    renderAt('/auth?mode=forgot');
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('rider@example.com'));
    expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
  });

  it('shows the same neutral message when the address has no account', async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 400, message: 'User not found' } });
    renderAt('/auth?mode=forgot');
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
    expect(screen.queryByText(/User not found/)).not.toBeInTheDocument();
  });

  it('surfaces the rate limit', async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 429, message: 'rate limited' } });
    renderAt('/auth?mode=forgot');
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
  });
});
