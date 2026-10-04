import { Link } from 'react-router-dom';
import { Box, Group, Image, Stack, Text, UnstyledButton } from '@mantine/core';
import { Wrench } from '@phosphor-icons/react';
import { DisplayId } from './DisplayId';
import type { ShopItem } from '../types';

interface Props {
  item: ShopItem;
  locationLabel: string;
  photoUrl?: string;
}

export function isLowStock(item: Pick<ShopItem, 'quantity' | 'min_quantity'>): boolean {
  return item.min_quantity != null && item.quantity < item.min_quantity;
}

/** One line in a list: thumbnail, ID, name, brand, where it is, how many. */
export function ItemRow({ item, locationLabel, photoUrl }: Props) {
  const low = isLowStock(item);
  return (
    <UnstyledButton
      component={Link}
      to={`/shop/items/${item.display_id}`}
      py="sm"
      style={{ display: 'block', borderBottom: '1px solid var(--color-border)' }}
    >
      <Group wrap="nowrap" gap="md" align="center">
        <Box w={56} h={56} style={{ flexShrink: 0, background: 'var(--color-card)', display: 'grid', placeItems: 'center' }}>
          {photoUrl ? <Image src={photoUrl} w={56} h={56} fit="cover" alt="" /> : <Wrench size={22} aria-hidden />}
        </Box>
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <DisplayId value={item.display_id} size="xs" c="dimmed" />
            {item.archived_at && <Text size="xs" c="dimmed">archived</Text>}
          </Group>
          <Text fw={600} truncate>{item.name}</Text>
          <Text size="xs" c="dimmed" truncate>
            {[item.brand, item.model, locationLabel].filter(Boolean).join(' · ')}
          </Text>
        </Stack>
        <Stack gap={0} align="flex-end" style={{ flexShrink: 0 }}>
          <Text ff="'Courier Prime', monospace" fw={700} fz="lg" style={{ color: low ? 'var(--color-signal-text)' : undefined }}>
            ×{item.quantity}
          </Text>
          {low && <Text size="xs" style={{ color: 'var(--color-signal-text)' }}>low</Text>}
        </Stack>
      </Group>
    </UnstyledButton>
  );
}
