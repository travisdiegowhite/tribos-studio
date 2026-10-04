import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { useAuth } from '../host';
import { isShopOwner } from '../owner';
import { ShopLayout } from './ShopLayout';

/** Hides the shop from everyone but its owner. RLS is the real boundary. */
export function OwnerGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isShopOwner(user?.email)) {
    return (
      <ShopLayout>
        <Text c="dimmed">{"This page isn't available."}</Text>
      </ShopLayout>
    );
  }
  return <>{children}</>;
}
