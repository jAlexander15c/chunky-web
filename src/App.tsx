import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { Cart, CartButton, CartProvider, PastaBuilder, PastaBuilderProvider, SiteFooter, SiteHeader } from "@/components";
import { AdminView, Cotizador, GestionView, Home, Items, KitchenView, Mantenimiento, Menu, OrderStatusView, StaffView } from "@/views";
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
      <PastaBuilderProvider>
        <SiteHeader />
        <Outlet />
        <SiteFooter />
        <PastaBuilder />
        <Cart />
        <CartButton />
      </PastaBuilderProvider>
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
        {/* Tablero administrativo: ventas, inventario y movimientos */}
        <Route path="/admin" element={<AdminView />} />
        {/* Se llamaba /tablero: los enlaces guardados siguen funcionando */}
        <Route path="/tablero" element={<Navigate to="/admin" replace />} />
        {/* Colaboradores: solo cargan inventario, sin ver ventas */}
        <Route path="/gestion" element={<GestionView />} />
        {/* Accesos del equipo a /admin y /gestion: no se enlaza desde el sitio publico */}
        <Route path="/staff" element={<StaffView />} />
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/items" element={<Items />} />
          <Route path="/pedido/:orderId" element={<OrderStatusView />} />
          {/* Cotizador de cakes: no es carrito, se guarda en el API y se sigue por WhatsApp */}
          <Route path="/cotizador" element={<Cotizador />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App
