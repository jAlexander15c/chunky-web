import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface IMapPoint {
    lat: number;
    lng: number;
}

interface IDeliveryMapProps {
    /** La casa del cliente. Null si solo hay dirección escrita. */
    destination: IMapPoint | null;
    /** Última posición del repartidor. Null mientras no llegue la primera. */
    courier: (IMapPoint & { accuracy?: number | null }) | null;
    /** El local: de ahí sale el pedido. */
    store?: IMapPoint | null;
    /** Texto para lectores de pantalla (el mapa en sí no se lee). */
    label: string;
}

// Mapa de OpenStreetMap: gratis y sin llave. Su política pide la atribución visible.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const DEFAULT_ZOOM = 16;
const FIT_PADDING: L.PointTuple = [36, 36];

// Pines dibujados con CSS: los íconos de imagen de Leaflet se rompen al empaquetar con Vite
const homeIcon = L.divIcon({
    className: "map-pin map-pin--home",
    html: '<span aria-hidden="true"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
});
const storeIcon = L.divIcon({
    className: "map-pin map-pin--store",
    html: '<span aria-hidden="true"></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
});
const courierIcon = L.divIcon({
    className: "map-pin map-pin--courier",
    html: '<span aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});

const toLatLng = (point: IMapPoint): L.LatLngTuple => [point.lat, point.lng];

/**
 * Mapa del pedido en camino: la casa y el repartidor. Se carga aparte (lazy) para que Leaflet
 * no pese en el resto de la web. Encuadra los dos puntos al empezar y vuelve a encuadrar solo si
 * el repartidor se sale de lo que se ve, para no pelear con quien mueve el mapa con el dedo.
 */
const DeliveryMap = ({ destination, courier, store = null, label }: IDeliveryMapProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const homeRef = useRef<L.Marker | null>(null);
    const storeRef = useRef<L.Marker | null>(null);
    const courierRef = useRef<L.Marker | null>(null);
    const hasFramedRef = useRef(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
        mapRef.current = map;
        return () => {
            map.remove();
            mapRef.current = null;
            homeRef.current = null;
            storeRef.current = null;
            courierRef.current = null;
            hasFramedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (destination) {
            homeRef.current ??= L.marker(toLatLng(destination), { icon: homeIcon, keyboard: false }).addTo(map);
            homeRef.current.setLatLng(toLatLng(destination));
        }
        if (store) {
            storeRef.current ??= L.marker(toLatLng(store), { icon: storeIcon, keyboard: false }).addTo(map);
            storeRef.current.setLatLng(toLatLng(store));
        }
        if (courier) {
            courierRef.current ??= L.marker(toLatLng(courier), { icon: courierIcon, keyboard: false, zIndexOffset: 500 }).addTo(map);
            courierRef.current.setLatLng(toLatLng(courier));
        }

        // Al empezar se ven los tres; después solo se reencuadra si el repartidor se sale de la vista
        const points = [destination, courier, hasFramedRef.current ? null : store]
            .filter((point): point is IMapPoint => point !== null)
            .map(toLatLng);
        if (points.length === 0) return;

        const isCourierHidden = courier !== null && hasFramedRef.current && !map.getBounds().contains(toLatLng(courier));
        if (!hasFramedRef.current || isCourierHidden) {
            if (points.length === 1) map.setView(points[0], DEFAULT_ZOOM);
            else map.fitBounds(L.latLngBounds(points), { padding: FIT_PADDING, maxZoom: 17 });
            hasFramedRef.current = true;
        }
    }, [destination, courier, store]);

    return <div ref={containerRef} className="delivery-map" role="img" aria-label={label} />;
};

export default DeliveryMap;
