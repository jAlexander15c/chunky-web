import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { IMapPoint } from "./delivery-map";

interface ILocationPickerProps {
    /** El pin ya marcado, o null si todavía no hay. */
    value: IMapPoint | null;
    /** El local: el mapa abre ahí si no hay pin. */
    store: IMapPoint | null;
    onChange: (point: IMapPoint) => void;
}

// Mismo mapa que el seguimiento: OpenStreetMap, gratis y sin llave, con su atribución visible
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
// Aguadulce, por si los ajustes aún no traen el local
const FALLBACK_CENTER: IMapPoint = { lat: 8.246417, lng: -80.538833 };
const START_ZOOM = 14;
const PIN_ZOOM = 17;
// Búsqueda de direcciones de OpenStreetMap: solo al enviar, nunca mientras se escribe (su política de uso)
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

const pinIcon = L.divIcon({
    className: "map-pin map-pin--home",
    html: '<span aria-hidden="true"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
});

// Seis decimales son ~11 cm: de sobra para encontrar una puerta
const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

const toPoint = (latLng: L.LatLng): IMapPoint => ({ lat: roundCoordinate(latLng.lat), lng: roundCoordinate(latLng.lng) });

/**
 * Mapa para marcar dónde recibe otra persona: se toca el mapa o se arrastra el pin. Se carga aparte
 * (lazy) como el del seguimiento, para que Leaflet no pese en el resto de la web.
 */
const LocationPicker = ({ value, store, onChange }: ILocationPickerProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const pinRef = useRef<L.Marker | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const [query, setQuery] = useState("");
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const center = value ?? store ?? FALLBACK_CENTER;
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
            .setView([center.lat, center.lng], value ? PIN_ZOOM : START_ZOOM);
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
        map.on("click", (event: L.LeafletMouseEvent) => onChangeRef.current(toPoint(event.latlng)));
        mapRef.current = map;
        return () => {
            map.remove();
            mapRef.current = null;
            pinRef.current = null;
        };
        // El mapa se crea una vez; el pin se mueve en el efecto de abajo
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !value) return;
        if (!pinRef.current) {
            pinRef.current = L.marker([value.lat, value.lng], { icon: pinIcon, draggable: true, keyboard: false }).addTo(map);
            pinRef.current.on("dragend", () => {
                if (pinRef.current) onChangeRef.current(toPoint(pinRef.current.getLatLng()));
            });
        }
        pinRef.current.setLatLng([value.lat, value.lng]);
    }, [value]);

    const searchAddress = async (event: FormEvent) => {
        event.preventDefault();
        const text = query.trim();
        if (text.length < 3) return;
        setSearchError(null);
        setIsSearching(true);
        try {
            const params = new URLSearchParams({ q: text, format: "json", limit: "1", countrycodes: "pa", "accept-language": "es" });
            const response = await fetch(`${SEARCH_URL}?${params}`);
            const [first] = (await response.json()) as { lat: string; lon: string }[];
            if (!first) {
                setSearchError("No encontramos esa dirección. Mueve el mapa y toca el lugar.");
                return;
            }
            const point = { lat: roundCoordinate(Number(first.lat)), lng: roundCoordinate(Number(first.lon)) };
            mapRef.current?.setView([point.lat, point.lng], PIN_ZOOM);
            onChangeRef.current(point);
        } catch {
            setSearchError("No pudimos buscar. Mueve el mapa y toca el lugar.");
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="location-picker">
            {/* No es un <form>: va dentro del checkout y Enter no debe enviar el pedido */}
            <div className="location-picker__search">
                <input
                    id="checkout-pin-search"
                    className="field__input"
                    type="search"
                    placeholder="Buscar un lugar (opcional)"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") void searchAddress(event);
                    }}
                    aria-label="Buscar un lugar en el mapa"
                />
                <button type="button" className="button button--ghost" onClick={(event) => void searchAddress(event)} disabled={isSearching}>
                    {isSearching ? "Buscando…" : "Buscar"}
                </button>
            </div>
            {searchError && <span className="field__error" role="alert">{searchError}</span>}
            <div ref={containerRef} className="delivery-map location-picker__map" role="application" aria-label="Mapa: toca para marcar dónde recibe" />
            <span className="location-picker__hint">{value ? "Arrastra el pin si no quedó justo en la puerta." : "Toca el mapa donde recibe."}</span>
        </div>
    );
};

export default LocationPicker;
