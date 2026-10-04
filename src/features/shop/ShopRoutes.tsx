import { Navigate, Route, Routes } from 'react-router-dom';
import { OwnerGate } from './components/OwnerGate';
import ShopHome from './pages/ShopHome';
import ItemsPage from './pages/ItemsPage';
import ItemDetailPage from './pages/ItemDetailPage';
import AddItemPage from './pages/AddItemPage';

/** Everything under /shop. Mounted once by App.jsx at `/shop/*`. */
export default function ShopRoutes() {
  return (
    <OwnerGate>
      <Routes>
        <Route index element={<ShopHome />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="items/:displayId" element={<ItemDetailPage />} />
        <Route path="add" element={<AddItemPage />} />
        <Route path="*" element={<Navigate to="/shop" replace />} />
      </Routes>
    </OwnerGate>
  );
}
