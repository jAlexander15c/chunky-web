import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
    HttpError,
    canUsePush,
    changeMyPin,
    dismissFaceIdOffer,
    fetchMyPasskeys,
    fetchSupplyAlerts,
    getExistingPushSubscription,
    getPushSubscription,
    hasUsedFaceIdHere,
    isAppleMobile,
    isFaceIdSupported,
    isStandaloneApp,
    removeMyPasskey,
    subscribeSupplyAlerts,
    unsubscribeSupplyAlerts,
} from "@/helpers";
import type { IPasskeyDevice, IStaffLogin, StaffScope } from "@/helpers";
import { PIN_LENGTH, PIN_MISMATCH_MESSAGE, getErrorMessage, useFaceIdLogin, useFaceIdRegistration } from "@/hooks/useStaffAccess";

import "./staff-access.css";

/** Prefijo de las clases de cada pantalla: el tablero usa adm-*, gestión ges-*. */
export type AccessKind = "adm" | "ges";

export const FaceIdIcon = ({ className = "sa-faceid-ico" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.1 3.6 1.1 5 0" />
    </svg>
);

/**
 * En iPhone, los avisos y la sesión propia de la app solo existen si se abre desde la pantalla
 * de inicio. En Safari se explica cómo agregarla; ya instalada, no se muestra.
 */
export const InstallHint = () => {
    if (!isAppleMobile() || isStandaloneApp()) return null;

    return (
        <p className="sa-install">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>
            <span>
                Para recibir avisos y entrar con Face ID, abre esta página desde la pantalla de inicio: toca <b>Compartir</b> y
                luego <b>Agregar a inicio</b>.
            </span>
        </p>
    );
};

/* ============ Entrar con Face ID ============ */

interface IFaceIdLoginButtonProps {
    kind: AccessKind;
    faceId: ReturnType<typeof useFaceIdLogin>;
}

/** Va arriba del PIN. Si este equipo ya entró con Face ID, es el botón principal. */
export const FaceIdLoginButton = ({ kind, faceId }: IFaceIdLoginButtonProps) => {
    if (!faceId.isAvailable) return null;

    const isPreferred = hasUsedFaceIdHere();
    return (
        <div className="sa-faceid-login">
            <button
                type="button"
                className={`${kind}-btn ${kind}-btn--block sa-faceid-btn${isPreferred ? ` ${kind}-btn--solid` : ""}`}
                onClick={() => void faceId.start()}
                disabled={!faceId.isReady || faceId.isBusy}
            >
                <FaceIdIcon />
                {faceId.isBusy ? "Abriendo Face ID…" : "Entrar con Face ID"}
            </button>
            {faceId.error ? <p className={`${kind}-gate__error`} role="alert">{faceId.error}</p> : null}
            <div className="sa-or">o con tu PIN</div>
        </div>
    );
};

/* ============ Elegir PIN ============ */

/* ============ Oferta de Face ID tras entrar ============ */

interface IFaceIdOfferProps {
    kind: AccessKind;
    scope: StaffScope;
    token: string;
    mark: string;
    onDone: () => void;
}

export const FaceIdOffer = ({ kind, scope, token, mark, onDone }: IFaceIdOfferProps) => {
    const registration = useFaceIdRegistration(scope, token);
    const [error, setError] = useState("");
    const [isBusy, setIsBusy] = useState(false);

    const activate = async () => {
        setIsBusy(true);
        setError("");
        try {
            if (await registration.activate()) onDone();
        } catch (activateError) {
            setError(getErrorMessage(activateError, "No pudimos activar Face ID. Puedes hacerlo después desde Mi acceso."));
        } finally {
            setIsBusy(false);
        }
    };

    const skip = () => {
        dismissFaceIdOffer();
        onDone();
    };

    return (
        <div className={`${kind} ${kind}-gate`}>
            <div className={`${kind}-gate__panel`}>
                <span className={`${kind}-gate__mark script`}>{mark}</span>
                <h1>Activa Face ID</h1>
                <FaceIdIcon className="sa-faceid-hero" />
                <p>
                    La próxima vez entras mirando el teléfono, sin escribir el PIN. Funciona en este iPhone y en los que usen tu
                    cuenta de iCloud.
                </p>
                {error || registration.loadError ? (
                    <p className={`${kind}-gate__error`} role="alert">{error || registration.loadError}</p>
                ) : null}
                <div className="sa-stack">
                    <button
                        type="button"
                        className={`${kind}-btn ${kind}-btn--solid ${kind}-btn--block sa-faceid-btn`}
                        onClick={() => void activate()}
                        disabled={!registration.isReady || isBusy}
                    >
                        <FaceIdIcon />
                        {isBusy ? "Activando…" : "Activar Face ID"}
                    </button>
                    <button type="button" className={`${kind}-btn ${kind}-btn--block`} onClick={skip} disabled={isBusy}>
                        Ahora no
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ============ Mi acceso ============ */

const formatDay = (value: string) =>
    new Date(value).toLocaleDateString("es-PA", { day: "numeric", month: "short" });

const formatUse = (value: string) =>
    new Date(value).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

interface IAccessPanelProps {
    kind: AccessKind;
    scope: StaffScope;
    token: string;
    /** Null en el tablero cuando se entró con la llave de recuperación. */
    personName: string | null;
    onSessionExpired: () => void;
    /** Cambiar el PIN cierra las demás sesiones y entrega un token nuevo para este equipo. */
    onTokenChange: (login: IStaffLogin) => void;
}

/** Face ID de esta persona: sus equipos y activar en el actual. */
const FaceIdDevices = ({ kind, scope, token, onSessionExpired }: Omit<IAccessPanelProps, "personName" | "onTokenChange">) => {
    const [devices, setDevices] = useState<IPasskeyDevice[] | null>(null);
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const { passkeys } = await fetchMyPasskeys(scope, token, signal);
                setDevices(passkeys);
            } catch (loadError) {
                if (signal?.aborted) return;
                if (loadError instanceof HttpError && loadError.status === 401) return onSessionExpired();
                setError(getErrorMessage(loadError, "No pudimos cargar tus equipos."));
            }
        },
        [scope, token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        void isFaceIdSupported().then(setIsSupported);
        return () => controller.abort();
    }, [load]);

    const remove = async (device: IPasskeyDevice) => {
        setBusyId(device.id);
        setError("");
        try {
            await removeMyPasskey(scope, token, device.id);
            await load();
        } catch (removeError) {
            setError(getErrorMessage(removeError, "No pudimos quitar Face ID de ese equipo."));
        } finally {
            setBusyId("");
        }
    };

    return (
        <div className="sa-block">
            <h3>Face ID</h3>
            {devices === null ? <p className="sa-muted">Cargando tus equipos…</p> : null}
            {devices?.length === 0 ? <p className="sa-muted">Todavía no tienes Face ID en ningún equipo.</p> : null}
            {devices?.length ? (
                <ul className="sa-devices">
                    {devices.map((device) => (
                        <li key={device.id}>
                            <span>
                                {device.label}
                                <small>
                                    Activado el {formatDay(device.createdAt)}
                                    {device.lastUsedAt ? ` · usado ${formatUse(device.lastUsedAt)}` : ""}
                                </small>
                            </span>
                            <button
                                type="button"
                                className={`${kind}-btn ${kind}-btn--sm`}
                                onClick={() => void remove(device)}
                                disabled={busyId === device.id}
                            >
                                {busyId === device.id ? "Quitando…" : "Quitar"}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {isSupported ? <ActivateHere kind={kind} scope={scope} token={token} onActivated={() => void load()} /> : null}
            {error ? <p className={kind === "adm" ? "adm-error" : "ges-gate__error"} role="alert">{error}</p> : null}
        </div>
    );
};

const ActivateHere = ({
    kind,
    scope,
    token,
    onActivated,
}: {
    kind: AccessKind;
    scope: StaffScope;
    token: string;
    onActivated: () => void;
}) => {
    const registration = useFaceIdRegistration(scope, token);
    const [message, setMessage] = useState("");
    const [isBusy, setIsBusy] = useState(false);

    const activate = async () => {
        setIsBusy(true);
        setMessage("");
        try {
            if (await registration.activate()) {
                setMessage("Face ID quedó activo en este equipo.");
                onActivated();
            }
        } catch (activateError) {
            setMessage(getErrorMessage(activateError, "No pudimos activar Face ID."));
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="sa-row">
            <button
                type="button"
                className={`${kind}-btn ${kind}-btn--sm sa-faceid-btn`}
                onClick={() => void activate()}
                disabled={!registration.isReady || isBusy}
            >
                <FaceIdIcon />
                {isBusy ? "Activando…" : "Activar en este equipo"}
            </button>
            {message ? <span className="sa-muted" role="status">{message}</span> : null}
        </div>
    );
};

/** Avisos de insumos en este teléfono. Solo para admins: el rol inventario no los recibe. */
const SupplyAlertsSwitch = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [endpoint, setEndpoint] = useState<string | null>(null);
    const [isOn, setIsOn] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const isPushPossible = canUsePush();

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            const existing = await getExistingPushSubscription();
            try {
                const status = await fetchSupplyAlerts(token, existing?.endpoint ?? null, controller.signal);
                setPublicKey(status.publicKey);
                setEndpoint(existing?.endpoint ?? null);
                setIsOn(status.isSubscribed);
                setIsReady(true);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                if (loadError instanceof HttpError && loadError.status === 401) return onSessionExpired();
                setError(getErrorMessage(loadError, "No pudimos revisar los avisos."));
            }
        };
        void load();
        return () => controller.abort();
    }, [token, onSessionExpired]);

    const toggle = async () => {
        setIsSaving(true);
        setError("");
        try {
            if (isOn && endpoint) {
                // Solo se quita del API: la suscripción del navegador también avisa al cliente de sus pedidos
                await unsubscribeSupplyAlerts(token, endpoint);
                setIsOn(false);
                return;
            }
            if (!publicKey) {
                setError("Los avisos no están configurados en el servidor.");
                return;
            }
            const subscription = await getPushSubscription(publicKey);
            if (!subscription) {
                setError("El teléfono no dio permiso para avisos. Actívalo en Ajustes → Notificaciones.");
                return;
            }
            await subscribeSupplyAlerts(token, subscription);
            setEndpoint(subscription.endpoint);
            setIsOn(true);
        } catch (toggleError) {
            setError(getErrorMessage(toggleError, "No pudimos cambiar los avisos."));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="sa-block">
            <div className="sa-row">
                <h3>Avisos de insumos</h3>
                {isPushPossible ? (
                    <label className="adm-switch adm-switch--sm sa-switch">
                        <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                        <span className="adm-switch__track" aria-hidden />
                        <span className="adm-sr-only">Avisos de insumos en este teléfono</span>
                    </label>
                ) : null}
            </div>
            <p className="sa-muted">
                Te llega un aviso cuando un insumo baja de su mínimo y un resumen cada mañana con lo que hay que comprar, lo
                que vence y lo que falta contar. Tocarlo abre el inventario.
            </p>
            {isPushPossible ? (
                <span className={`sa-pill${isOn ? " is-on" : ""}`} role="status">
                    {!isReady ? "Revisando…" : isOn ? "Activos en este teléfono" : "Apagados en este teléfono"}
                </span>
            ) : (
                <InstallHint />
            )}
            {error ? <p className="adm-error" role="alert">{error}</p> : null}
        </div>
    );
};

/** Cambiar el PIN desde Mi acceso: dos campos y listo. */
const ChangePinForm = ({ kind, scope, token, onTokenChange }: Pick<IAccessPanelProps, "kind" | "scope" | "token" | "onTokenChange">) => {
    const [isOpen, setIsOpen] = useState(false);
    const [newPin, setNewPin] = useState("");
    const [repeat, setRepeat] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (newPin !== repeat) {
            setError(PIN_MISMATCH_MESSAGE);
            setRepeat("");
            return;
        }
        setIsSaving(true);
        setError("");
        try {
            onTokenChange(await changeMyPin(scope, token, newPin));
        } catch (saveError) {
            setError(getErrorMessage(saveError, "No pudimos guardar tu PIN."));
            setIsSaving(false);
        }
    };

    const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, PIN_LENGTH);

    return (
        <div className="sa-block">
            <h3>PIN</h3>
            <p className="sa-muted">Cambiarlo cierra tu sesión en los otros equipos. Tu Face ID sigue activo.</p>
            {isOpen ? (
                <form className="sa-pin-form" onSubmit={submit}>
                    <label>
                        <span>PIN nuevo</span>
                        <input
                            id={`${scope}-new-pin`}
                            type="password"
                            inputMode="numeric"
                            autoComplete="new-password"
                            value={newPin}
                            onChange={(event) => setNewPin(onlyDigits(event.target.value))}
                        />
                    </label>
                    <label>
                        <span>Repítelo</span>
                        <input
                            id={`${scope}-repeat-pin`}
                            type="password"
                            inputMode="numeric"
                            autoComplete="new-password"
                            value={repeat}
                            onChange={(event) => setRepeat(onlyDigits(event.target.value))}
                        />
                    </label>
                    {error ? <p className={kind === "adm" ? "adm-error" : "ges-gate__error"} role="alert">{error}</p> : null}
                    <div className="sa-row">
                        <button
                            type="submit"
                            className={`${kind}-btn ${kind}-btn--solid ${kind}-btn--sm`}
                            disabled={newPin.length !== PIN_LENGTH || repeat.length !== PIN_LENGTH || isSaving}
                        >
                            {isSaving ? "Guardando…" : "Guardar PIN"}
                        </button>
                        <button type="button" className={`${kind}-btn ${kind}-btn--sm`} onClick={() => setIsOpen(false)}>
                            Cancelar
                        </button>
                    </div>
                </form>
            ) : (
                <div className="sa-row">
                    <button type="button" className={`${kind}-btn ${kind}-btn--sm`} onClick={() => setIsOpen(true)}>
                        Cambiar mi PIN
                    </button>
                </div>
            )}
        </div>
    );
};

/**
 * Mi acceso: Face ID, PIN y (en el tablero) avisos de insumos. Con la llave de recuperación no
 * hay persona a quien atarlos, así que solo se explica cómo entrar con un PIN propio.
 */
export const AccessPanel = (props: IAccessPanelProps) => {
    const { kind, scope, personName } = props;

    if (!personName) {
        return (
            <div className={`sa-panel sa-panel--${kind}`}>
                <div className="sa-block">
                    <h3>Llave de recuperación</h3>
                    <p className="sa-muted">
                        Entraste con el PIN de recuperación. Para usar Face ID y avisos, crea tu usuario en Colaboradores con el rol
                        Admin y entra con su PIN.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`sa-panel sa-panel--${kind}`}>
            <FaceIdDevices kind={kind} scope={scope} token={props.token} onSessionExpired={props.onSessionExpired} />
            {scope === "admin" ? <SupplyAlertsSwitch token={props.token} onSessionExpired={props.onSessionExpired} /> : null}
            <ChangePinForm kind={kind} scope={scope} token={props.token} onTokenChange={props.onTokenChange} />
        </div>
    );
};
