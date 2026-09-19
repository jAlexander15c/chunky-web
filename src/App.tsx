import { useEffect } from "react";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router";

import { Cart, CartButton, CartProvider, SiteFooter, SiteHeader } from "@/components";
import { Home, Items, KitchenView, Mantenimiento, Menu, OrderStatusView } from "@/views";
import { useWwwRedirect } from "@/hooks/useWwwRedirect";

import './App.css'

/** Con VITE_MAINTENANCE_MODE=true todas las rutas muestran la vista de mantenimiento. */
const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === "true";

/** Lleva al ancla (/#como-pedir) o al inicio de la pagina al cambiar de ruta. */
const useScrollOnNavigate = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
};

const SiteLayout = () => {
  useScrollOnNavigate();

  return (
    <CartProvider>
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <Cart />
      <CartButton />
    </CartProvider>
  );
};

const App = () => {
  useWwwRedirect();

  if (isMaintenanceMode) return <Mantenimiento />;

  return (
    <BrowserRouter>
      <Routes>
        {/* Pantalla de cocina del iPad: sin encabezado, pie ni carrito */}
        <Route path="/cocina" element={<KitchenView />} />
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/items" element={<Items />} />
          <Route path="/pedido/:orderId" element={<OrderStatusView />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App
