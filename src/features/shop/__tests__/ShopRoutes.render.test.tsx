import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

let email: string | undefined = 'travis@tribos.studio';

// Every query answers "no rows" (null for a single-row read) so the screens
// render their empty states.
const empty = () => {
  let one = false;
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'insert', 'update', 'eq', 'is', 'in', 'or', 'order', 'limit', 'single', 'maybeSingle']) {
    b[op] = () => { if (op === 'single' || op === 'maybeSingle') one = true; return b; };
  }
  b.then = (resolve: (v: unknown) => void) => resolve({ data: one ? null : [], error: null });
  return b;
};

vi.mock('../host', async () => {
  const owner = await import('../owner');
  return {
    ...owner,
    supabase: {
      from: () => empty(),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
    useAuth: () => ({ user: email ? { id: 'u1', email } : null }),
    AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    resizeImageFile: vi.fn(),
  };
});

const { default: ShopRoutes } = await import('../ShopRoutes');

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <ShopRoutes />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('ShopRoutes', () => {
  beforeEach(() => { email = 'travis@tribos.studio'; });

  it('shows the owner an empty shop with a way to add the first item', async () => {
    renderAt('/');
    expect(await screen.findByText(/Add the first thing on your bench/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Add/ }).length).toBeGreaterThan(0);
  });

  it('hides the shop from anyone else', () => {
    email = 'someone@example.com';
    renderAt('/');
    expect(screen.getByText("This page isn't available.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Name, ID, brand/)).not.toBeInTheDocument();
  });

  it('says plainly when a label points at nothing', async () => {
    renderAt('/items/TL-9999');
    expect(await screen.findByText(/No item labelled/)).toBeInTheDocument();
  });
});
