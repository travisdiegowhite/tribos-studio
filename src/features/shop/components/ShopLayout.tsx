import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Container, Group, Stack, Text, Title } from '@mantine/core';
import { AppShell } from '../host';

const TABS = [
  { to: '/shop', label: 'Home', end: true },
  { to: '/shop/items', label: 'Items', end: false },
  { to: '/shop/add', label: 'Add', end: false },
];

/** Page frame for every shop screen: tribos' shell, a title, the shop's own tabs. */
export function ShopLayout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <AppShell>
      <Container size="md" py="lg" px="md">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end" wrap="nowrap">
            <Title order={1} style={{ textTransform: 'uppercase' }}>{title ?? 'Shop'}</Title>
            <Group gap="md" component="nav" aria-label="Shop" wrap="nowrap">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} style={{ textDecoration: 'none' }}>
                  {({ isActive }) => (
                    <Text
                      fw={isActive ? 700 : 500}
                      size="sm"
                      style={{
                        color: isActive ? 'var(--color-ink)' : 'var(--color-text-muted)',
                        borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                        paddingBottom: 2,
                      }}
                    >
                      {t.label}
                    </Text>
                  )}
                </NavLink>
              ))}
            </Group>
          </Group>
          {children}
        </Stack>
      </Container>
    </AppShell>
  );
}
