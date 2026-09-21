import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { QuotesPanel } from "@/components";
import {
    HttpError,
    ROLE_LABEL,
    formatCash,
    getGestionName,
    getGestionRoles,
    getGestionToken,
    loginGestion,
    setGestionSession,
} from "@/helpers";
import type { CollaboratorRole, IShiftDetail } from "@/helpers";
import { useKitchenFeed } from "@/hooks/useKitchenFeed";

import { GestionCaja } from "./gestion/caja";
import { GestionCocina, KitchenToast } from "./gestion/cocina";
import { GestionInventario } from "./gestion/inventario";
import { GestionTurno } from "./gestion/turno";

import "./gestion.css";

const PIN_LENGTH = 6;

const useGestionHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Gestión · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/* ============ Acceso con PIN ============ */

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

interface IGestionLoginProps {
    onLogin: (token: string, name: string, roles: CollaboratorRole[]) => void;
}

const GestionLogin = ({ onLogin }: IGestionLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = useCallback(
        async (candidate: string) => {
            setIsSending(true);
            setError("");

            try {
                const { token, collaborator } = await loginGestion(candidate);
                onLogin(token, collaborator.name, collaborator.roles);
            } catch (loginError) {
                setPin("");
                setIsSending(false);
                setError(
                    loginError instanceof HttpError && loginError.status < 500
                        ? loginError.message
                        : "No pudimos conectar. Revisa el Wi-Fi."
                );
            }
        },
        [onLogin]
    );

    // Con seis dígitos entra sola: no hace falta buscar el botón con las manos ocupadas
    const pressKey = (key: string) => {
        if (isSending) return;
        setError("");

        if (key === "⌫") {
            setPin((current) => current.slice(0, -1));
            return;
        }

        setPin((current) => {
            if (current.length >= PIN_LENGTH) return current;
            const next = current + key;
            if (next.length === PIN_LENGTH) void submit(next);
            return next;
        });
    };

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
                <h1>Entra con tu PIN</h1>
                <p>Es tuyo: lo que registres queda a tu nombre.</p>

                <div className="ges-dots" role="status" aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`}>
                    {Array.from({ length: PIN_LENGTH }, (_value, index) => (
                        <span key={index} className={index < pin.length ? "is-on" : undefined} />
                    ))}
                </div>

                <p className="ges-gate__error" role="alert">{isSending ? "Entrando…" : error}</p>

                <div className="ges-keys">
                    {PIN_KEYS.map((key, index) =>
                        key ? (
                            <button
                                key={key}
                                type="button"
                                className={`ges-key${key === "⌫" ? " ges-key--soft" : ""}`}
                                onClick={() => pressKey(key)}
                                disabled={isSending}
                                aria-label={key === "⌫" ? "Borrar" : key}
                            >
                                {key}
                            </button>
                        ) : (
                            <span key={`vacio-${index}`} />
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

/* ============ Armazón ============ */

type Section = "caja" | "turno" | "cocina" | "inventario" | "cotizaciones";

interface ISectionInfo {
    id: Section;
    label: string;
    role: CollaboratorRole;
    sub: string;
    icon: ReactNode;
}

const SECTIONS: ISectionInfo[] = [
    {
        id: "caja",
        label: "Caja",
        role: "caja",
        sub: "Toma las mesas, envía a cocina y cobra",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
            </svg>
        ),
    },
    {
        id: "turno",
        label: "Turno",
        role: "caja",
        sub: "Fondo inicial, movimientos de efectivo y cierre",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
        ),
    },
    {
        id: "cocina",
        label: "Cocina",
        role: "caja",
        sub: "Pedidos pagados en la web: acéptalos, márcalos listos y entrégalos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z" />
                <path d="M6 17h12" />
            </svg>
        ),
    },
    {
        id: "inventario",
        label: "Inventario",
        role: "inventario",
        sub: "Compras, conteos, mermas y disponibilidad",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                <path d="M3 7l9 4 9-4M12 11v10" />
            </svg>
        ),
    },
    {
        id: "cotizaciones",
        label: "Cotizaciones",
        role: "pastelera",
        sub: "Cakes que piden los clientes desde la web, con sus fotos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 21V11h16v10M2 11h20M12 11V7" />
                <circle cx="12" cy="5" r="2" />
            </svg>
        ),
    },
];

interface IGestionShellProps {
    token: string;
    name: string;
    roles: CollaboratorRole[];
    onLogout: () => void;
}

const GestionShell = ({ token, name, roles, onLogout }: IGestionShellProps) => {
    const [shift, setShift] = useState<IShiftDetail | null>(null);

    // Solo se ofrece lo que esta persona puede hacer
    const available = useMemo(() => SECTIONS.filter((one) => roles.includes(one.role)), [roles]);
    const [section, setSection] = useState<Section>(() => available[0]?.id ?? "inventario");

    const current = available.find((one) => one.id === section) ?? available[0];

    // Los pedidos de la web se siguen en cualquier seccion: quien cobra tambien atiende la cocina
    const kitchen = useKitchenFeed(token, roles.includes("caja"), onLogout);

    if (!current) {
        return (
            <div className="ges ges-gate">
                <div className="ges-gate__panel">
                    <span className="ges-gate__mark script">Gestión</span>
                    <h1>Sin permisos</h1>
                    <p>Tu PIN funciona, pero todavía no tiene ninguna sección asignada. Pídele al administrador que te dé caja, inventario o pastelería.</p>
                    <button type="button" className="ges-btn ges-btn--block" onClick={onLogout}>Salir</button>
                </div>
            </div>
        );
    }

    return (
        <div className="ges ges-shell">
            <nav className="ges-nav" aria-label="Secciones de gestión">
                <div className="ges-nav__brand script">Gestión</div>
                {available.map((one) => (
                    <button
                        key={one.id}
                        type="button"
                        className="ges-nav__item"
                        aria-current={current.id === one.id}
                        onClick={() => setSection(one.id)}
                    >
                        {one.icon}
                        {one.label}
                        {one.id === "cocina" && kitchen.newCount > 0 ? (
                            <span className="ges-nav__badge" aria-label={`${kitchen.newCount} pedidos nuevos`}>{kitchen.newCount}</span>
                        ) : null}
                    </button>
                ))}
                <div className="ges-nav__foot">
                    {name || "equipo"}
                    <span>{roles.map((role) => ROLE_LABEL[role]).join(" · ") || "sin permisos"}</span>
                </div>
            </nav>

            <div className="ges-panel">
                <header className="ges-top">
                    <div>
                        <h1>{current.label}</h1>
                        <p className="ges-top__sub">{current.sub}</p>
                    </div>
                    <div className="ges-top__right">
                        {current.id === "cocina" ? (
                            <>
                                <span className={`ges-chip${kitchen.offlineSince !== null ? " is-off" : ""}`} role="status">
                                    <i aria-hidden="true" />
                                    {kitchen.offlineSince !== null ? "Sin conexión" : "En línea"}
                                </span>
                                <span className={`ges-chip${kitchen.isSoundOn ? "" : " is-off"}`}>
                                    <i aria-hidden="true" />
                                    {kitchen.isSoundOn ? "Sonido" : "Sonido apagado"}
                                </span>
                            </>
                        ) : null}
                        {roles.includes("caja") ? (
                            <span className={`ges-chip${shift ? "" : " is-off"}`} role="status">
                                <i aria-hidden="true" />
                                {shift ? `Turno abierto · ${formatCash(shift.expected)}` : "Sin turno abierto"}
                            </span>
                        ) : null}
                        <button type="button" className="ges-btn ges-btn--sm" onClick={onLogout}>Salir</button>
                    </div>
                </header>

                <main className="ges-body">
                    {current.id === "caja" ? (
                        <GestionCaja token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "turno" ? (
                        <GestionTurno token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "cocina" ? (
                        <GestionCocina feed={kitchen} onSessionExpired={onLogout} />
                    ) : current.id === "cotizaciones" ? (
                        <div className="ges-quotes">
                            <QuotesPanel token={token} onSessionExpired={onLogout} />
                        </div>
                    ) : (
                        <GestionInventario token={token} onSessionExpired={onLogout} />
                    )}
                </main>
            </div>

            {kitchen.toast ? <KitchenToast order={kitchen.toast} /> : null}
        </div>
    );
};

export const GestionView = () => {
    const [token, setToken] = useState<string | null>(() => getGestionToken());
    const [name, setName] = useState(() => getGestionName());
    const [roles, setRoles] = useState<CollaboratorRole[]>(() => getGestionRoles());
    useGestionHead();

    const login = useCallback((newToken: string, newName: string, newRoles: CollaboratorRole[]) => {
        setGestionSession(newToken, newName, newRoles);
        setToken(newToken);
        setName(newName);
        setRoles(newRoles);
    }, []);

    const logout = useCallback(() => {
        setGestionSession(null);
        setToken(null);
        setName("");
        setRoles([]);
    }, []);

    if (!token) return <GestionLogin onLogin={login} />;
    return <GestionShell token={token} name={name} roles={roles} onLogout={logout} />;
};
