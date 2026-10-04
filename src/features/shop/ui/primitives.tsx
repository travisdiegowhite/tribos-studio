/**
 * Small building blocks shared by the shop screens. Plain Mantine plus the
 * host's CSS custom properties (--color-*, --font-*), so a spin-off only needs
 * a theme that defines the same variables.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, Container, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ArrowLeft, Package, Wrench } from '@phosphor-icons/react';
import { SHOP_EXIT_PATH, shopPath } from '../host';

export const MONO = 'var(--font-mono)';

export function ShopPage({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Where the back arrow goes; defaults to the shop home. */
  back?: { to: string; label: string } | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const backTo = back === undefined ? { to: shopPath(), label: 'Shop' } : back;
  return (
    <Container size="md" py="lg" px="md">
      <Stack gap="lg">
        <Box>
          {backTo && (
            <UnstyledButton
              component={Link}
              to={backTo.to}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', marginBottom: 8 }}
            >
              <ArrowLeft size={14} />
              <Text size="sm" style={{ fontFamily: MONO, letterSpacing: 1, textTransform: 'uppercase' }}>{backTo.label}</Text>
            </UnstyledButton>
          )}
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
            <Box style={{ minWidth: 0 }}>
              <Title order={1} style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>{title}</Title>
              {subtitle && <Text style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</Text>}
            </Box>
            {actions && <Group gap="xs">{actions}</Group>}
          </Group>
        </Box>
        {children}
      </Stack>
    </Container>
  );
}

export const shopHomeBack = { to: SHOP_EXIT_PATH, label: 'Garage' };

/** The printed label, e.g. TL-0001. */
export function ItemLabel({ id, size = 'sm' }: { id: string; size?: 'xs' | 'sm' | 'md' | 'xl' }) {
  return (
    <Text
      component="span"
      size={size}
      style={{ fontFamily: MONO, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}
    >
      {id}
    </Text>
  );
}

/** Section heading: the 5×5 swatch + mono caps used across tribos cards. */
export function Eyebrow({ children, accent = 'var(--color-ink)', right }: { children: ReactNode; accent?: string; right?: ReactNode }) {
  return (
    <Group justify="space-between" align="center" mb={8} wrap="nowrap">
      <Group gap={9} align="center" wrap="nowrap">
        <span style={{ width: 5, height: 5, background: accent, display: 'inline-block', flex: '0 0 auto' }} />
        <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
          {children}
        </Text>
      </Group>
      {right}
    </Group>
  );
}

export function Thumb({ url, size = 44, tool = false }: { url?: string | null; size?: number; tool?: boolean }) {
  const Icon = tool ? Wrench : Package;
  return (
    <Box
      style={{
        width: size, height: size, flex: '0 0 auto', overflow: 'hidden', borderRadius: 0,
        background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {url
        ? <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <Icon size={Math.round(size * 0.45)} color="var(--color-text-muted)" />}
    </Box>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: ReactNode; tone?: 'signal' }) {
  return (
    <Box style={{ border: '1px solid var(--color-border)', padding: '10px 12px', borderRadius: 0, minWidth: 0 }}>
      <Text style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: tone === 'signal' ? 'var(--color-signal-text)' : 'var(--color-text-primary)' }}>
        {value}
      </Text>
      <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</Text>
    </Box>
  );
}

/** Low-stock marker: magenta text, no fill (palette: signal is effort/attention). */
export function LowTag() {
  return (
    <Text component="span" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--color-signal-text)', border: '1px solid var(--color-signal-border)', padding: '1px 5px', whiteSpace: 'nowrap' }}>
      LOW
    </Text>
  );
}

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const formatMoney = (n: number, cents = false) => (cents ? moneyCents : money).format(n);

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Box style={{ border: '1.5px dashed var(--color-border)', padding: 28, textAlign: 'center', borderRadius: 0 }}>
      <Text fw={700} style={{ color: 'var(--color-text-primary)' }}>{title}</Text>
      {children && <Box mt={6} style={{ color: 'var(--color-text-secondary)' }}>{children}</Box>}
    </Box>
  );
}
