import { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { Cart, CartButton, CartProvider, PastaBuilder, PastaBuilderProvider, SiteFooter, SiteHeader, UpdateBanner, useCart, usePastaBuilder } from "@/components";
// Cada vista por su archivo y no desde "@/views": importar el indice metería todo en el paquete principal
import { Home } from "@/views/home";
import { Items } from "@/views/items";
import { Mantenimiento } from "@/views/mantenimiento";
import { Menu } from "@/views/menu";
import { OrderStatusView } from "@/views/order-status";
import { getTrackedPath, isAppReloading, trackEvent, useAppUpdate, useSettings } from "@/helpers";
import { useOperationalAutoUpdate } from "@/hooks/useOperationalAutoUpdate";
import { useSilentSiteUpdate } from "@/hooks/useSilentSiteUpdate";
import { useWwwRedirect } from "@/hooks/useWwwRedirect";

import './App.css'

/**
 * Pantallas que el cliente casi nunca abre o que son del equipo: se descargan al entrar a ellas,
 * así el menú y el checkout cargan sin el tablero, la gestión ni el cotizador.
 */
const AdminView = lazy(() => import("@/views/admin").then((module) => ({ default: module.AdminView })));
const GestionView = lazy(() => import("@/views/gestion").then((module) => ({ default: module.GestionView })));
const StaffView = lazy(() => import("@/views/staff").then((module) => ({ default: module.StaffView })));
const Cotizador = lazy(() => import("@/views/cotizador").then((module) => ({ default: module.Cotizador })));
const Privacidad = lazy(() => import("@/views/privacidad").then((module) => ({ default: module.Privacidad })));

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
    // Se recarga por una version nueva: la pagina recargada registra esta visita
    if (isAppReloading()) return;
    trackEvent("page_view", path);
  }, [pathname]);
};

/**
 * Vive dentro de los providers porque no recarga con el carrito o el armador abiertos.
 * El aviso al cliente solo sale si se encendio desde /admin; si no, la actualizacion es invisible.
 */
const SiteUpdate = () => {
  useSilentSiteUpdate();
  const isUpdateAvailable = useAppUpdate();
  const { settings } = useSettings();
  const { count, isOpen: isCartOpen } = useCart();
  const { isOpen: isPastaBuilderOpen } = usePastaBuilder();

  if (!isUpdateAvailable || !settings.clientUpdateNotice || isCartOpen || isPastaBuilderOpen) return null;
  return <UpdateBanner isAboveCart={count > 0} />;
};

/** /admin, /gestion y /staff: se recargan solas en un momento seguro y mientras tanto muestran el aviso. */
const OperationalLayout = () => {
  const isUpdateAvailable = useOperationalAutoUpdate();

  return (
    <>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      {isUpdateAvailable ? <UpdateBanner /> : null}
    </>
  );
};

const SiteLayout = () => {
  useScrollOnNavigate();
  usePageTracking();

  return (
    <CartProvider>
      <PastaBuilderProvider>
        <SiteHeader />
        <Suspense fallback={<main className="section" aria-busy="true" />}>
          <Outlet />
        </Suspense>
        <SiteFooter />
        <PastaBuilder />
        <Cart />
        <CartButton />
        <SiteUpdate />
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
        {/* Se llamaba /tablero: los enlaces guardados siguen funcionando */}
        <Route path="/tablero" element={<Navigate to="/admin" replace />} />
        {/* Pantallas del equipo: el aviso de version nueva siempre se muestra aqui */}
        <Route element={<OperationalLayout />}>
          {/* Tablero administrativo: ventas, inventario y movimientos */}
          <Route path="/admin" element={<AdminView />} />
          {/* Colaboradores: solo cargan inventario, sin ver ventas */}
          <Route path="/gestion" element={<GestionView />} />
          {/* Accesos del equipo a /admin y /gestion: no se enlaza desde el sitio publico */}
          <Route path="/staff" element={<StaffView />} />
        </Route>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/items" element={<Items />} />
          <Route path="/pedido/:orderId" element={<OrderStatusView />} />
          {/* Cotizador de cakes: no es carrito, se guarda en el API y se sigue por WhatsApp */}
          <Route path="/cotizador" element={<Cotizador />} />
          {/* Ley 81 de 2019: qué datos se guardan y cómo pedir verlos, corregirlos o borrarlos */}
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App
