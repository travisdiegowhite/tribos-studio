/**
 * Shop inventory — parts, spares and shop tools.
 *
 * Mounted by the host at SHOP_BASE_PATH/* (see host.tsx). Self-contained by
 * design so it can be lifted into its own app: see docs/shop-inventory.md.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { ShopFrame, shopPath } from './host';
import { ShopProvider, useShop } from './state/ShopProvider';
import ShopHome from './screens/ShopHome';
import ItemScreen from './screens/ItemScreen';
import ItemEditor from './screens/ItemEditor';
import SetupScreen from './screens/SetupScreen';
import TransferScreen from './screens/TransferScreen';
import { ShopPage } from './ui/primitives';

export default function ShopApp() {
  return (
    <ShopFrame>
      <ShopProvider>
        <ShopRoutes />
      </ShopProvider>
    </ShopFrame>
  );
}

function ShopRoutes() {
  const { loading, error, items, reload } = useShop();

  if (loading) {
    return <Center py={80}><Loader size="sm" color="dark" /></Center>;
  }
  // A failed first load has nothing to show; a failed re-read keeps the data on screen.
  if (error && items.length === 0) {
    return (
      <ShopPage title="Shop">
        <Stack gap="sm" align="flex-start">
          <Text style={{ color: 'var(--color-signal-text)' }}>{error}</Text>
          <Button variant="default" onClick={() => reload()}>Try again</Button>
        </Stack>
      </ShopPage>
    );
  }

  return (
    <Routes>
      <Route index element={<ShopHome />} />
      <Route path="items/new" element={<ItemEditor />} />
      <Route path="items/:displayId" element={<ItemScreen />} />
      <Route path="items/:displayId/edit" element={<ItemEditor />} />
      <Route path="setup" element={<SetupScreen />} />
      <Route path="transfer" element={<TransferScreen />} />
      <Route path="*" element={<Navigate to={shopPath()} replace />} />
    </Routes>
  );
}
