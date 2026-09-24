import { useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { Cart, CartButton, CartProvider, PastaBuilder, PastaBuilderProvider, SiteFooter, SiteHeader } from "@/components";
import { AdminView, Cotizador, GestionView, Home, Items, Mantenimiento, Menu, OrderStatusView, StaffView } from "@/views";
import { getTrackedPath, trackEvent } from "@/helpers";
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

/** Una visita por cada ruta del sitio publico: es el primer paso del embudo. */
const usePageTracking = () => {
  const { pathname } = useLocation();
  const lastPathRef = useRef("");

  useEffect(() => {
    const path = getTrackedPath(pathname);
    // StrictMode corre el efecto dos veces en desarrollo: la misma ruta cuenta una vez
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    trackEvent("page_view", path);
  }, [pathname]);
};

const SiteLayout = () => {
  useScrollOnNavigate();
  usePageTracking();

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
        {/* La cocina ahora es una seccion de /gestion (rol caja, PIN de cada colaborador) */}
        <Route path="/cocina" element={<Navigate to="/gestion" replace />} />
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
