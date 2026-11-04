import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { FullSheet } from "@/components/full-sheet";
import { OpsSkeleton } from "@/components/ops-states";
import { HttpError, getPedidosYaStatus, savePedidosYaConfig, setPedidosYaEnabled, testPedidosYaConnection } from "@/helpers";
import type { IPedidosYaConfigInput, IPedidosYaStatus, PedidosYaEnvironment, PedidosYaSecretName } from "@/interfaces";

import "./pedidosya-panel.css";

/* ============ PedidosYa: conexión ============ */

const NARROW_QUERY = "(max-width: 720px)";
const SECRET_MAX_LENGTH = 2048;

const SECRET_ROWS: { name: PedidosYaSecretName; label: string; dialogLabel: string; title: string }[] = [
    { name: "username", label: "Usuario del middleware", dialogLabel: "Nuevo usuario", title: "Reemplazar el usuario" },
    { name: "password", label: "Contraseña", dialogLabel: "Nueva contraseña", title: "Reemplazar la contraseña" },
    { name: "webhookSecret", label: "Secreto de los avisos (webhook)", dialogLabel: "Nuevo secreto", title: "Reemplazar el secreto de los avisos" },
];

const useIsNarrow = () => {
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);

    useEffect(() => {
        const query = window.matchMedia?.(NARROW_QUERY);
        if (!query) return;
        const update = () => setIsNarrow(query.matches);
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return isNarrow;
};

const getShortDate = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short" }).replace(".", "");

const getShortTime = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "hoy a las 11:42" o "el 4 nov a las 11:42". */
const getWhenLabel = (iso: string) => {
    const isToday = new Date(iso).toDateString() === new Date().toDateString();
    return `${isToday ? "hoy" : `el ${getShortDate(iso)}`} a las ${getShortTime(iso)}`;
};

const getSecretText = (status: IPedidosYaStatus, name: PedidosYaSecretName) => {
    const info = status.secrets[name];
    if (!info.isSet) return "Sin guardar";
    if (!info.readable) return "No se puede leer: vuelve a pegarla";
    const mask = info.last4 ? `•••• ${info.last4}` : "••••••••";
    const when = info.updatedAt ? ` · cambiado el ${getShortDate(info.updatedAt)}` : "";
    const who = info.updatedBy ? ` por ${info.updatedBy}` : "";
    return `${mask}${when}${who}`;
};

const getErrorText = (error: unknown, fallback: string) => (error instanceof HttpError ? error.message : fallback);

/** Lo escrito como comisión: acepta coma o punto. NaN si no es un número. */
const parseCommission = (value: string) => (value.trim() === "" ? NaN : Number(value.trim().replace(",", ".")));

interface ISecretFormProps {
    title: string;
    label: string;
    isWebhook: boolean;
    /** Guarda (y prueba, si toca). Si falla, lanza un Error con el texto para mostrar. */
    onSave: (value: string) => Promise<void>;
    onDone: () => void;
}

/** El valor escrito vive solo en este estado: al cerrar el diálogo el componente se desmonta y se borra. */
const SecretForm = ({ title, label, isWebhook, onSave, onDone }: ISecretFormProps) => {
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!value.trim()) {
            setError("Pega el valor antes de guardar.");
            return;
        }
        if (value.trim().length > SECRET_MAX_LENGTH) {
            setError(`Es demasiado largo (máximo ${SECRET_MAX_LENGTH} caracteres).`);
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(value);
            setValue("");
            onDone();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "No pudimos guardar la clave.");
            setIsSending(false);
        }
    };

    return (
        <form className="pya-dialog" onSubmit={submit}>
            <h3 className="script">{title}</h3>
            <p className="adm-modal__hint">
                Pega el valor nuevo tal como te lo mandó PedidosYa. El anterior deja de usarse al guardar y no se puede volver a ver.
            </p>
            <label className="adm-form__row">
                <span>{label}</span>
                <input
                    className="adm-form__input pya-input"
                    type="password"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    disabled={isSending}
                />
            </label>
            {error ? <p className="adm-error" role="alert">{error}</p> : null}
            <div className="adm-modal__actions pya-dialog__actions">
                <button type="button" className="adm-btn" onClick={onDone} disabled={isSending}>Cancelar</button>
                <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                    {isSending ? "Guardando…" : isWebhook ? "Guardar" : "Guardar y probar"}
                </button>
            </div>
        </form>
    );
};

/** Conexión con PedidosYa: llaves cifradas, ambiente, interruptor y prueba. Solo admins. */
export const PedidosYaPanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [status, setStatus] = useState<IPedidosYaStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isBusy, setIsBusy] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [dialog, setDialog] = useState<PedidosYaSecretName | null>(null);
    const isNarrow = useIsNarrow();

    const [chainCode, setChainCode] = useState("");
    const [remoteId, setRemoteId] = useState("");
    const [commission, setCommission] = useState("");
    const [middlewareUrl, setMiddlewareUrl] = useState("");

    const fillForm = (next: IPedidosYaStatus) => {
        setChainCode(next.chainCode);
        setRemoteId(next.remoteId);
        setCommission(String(next.commissionPercent));
        setMiddlewareUrl(next.middlewareUrl);
    };

    /** El 401 saca de la sesión; lo demás se muestra con adm-error. */
    const handleFailure = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) {
            onSessionExpired();
            return;
        }
        setError(getErrorText(requestError, fallback));
    };

    useEffect(() => {
        const controller = new AbortController();
        getPedidosYaStatus(token, controller.signal)
            .then((next) => {
                setStatus(next);
                setChainCode(next.chainCode);
                setRemoteId(next.remoteId);
                setCommission(String(next.commissionPercent));
                setMiddlewareUrl(next.middlewareUrl);
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(getErrorText(requestError, "No pudimos leer la conexión con PedidosYa."));
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        return () => controller.abort();
    }, [token, onSessionExpired]);

    const closeDialog = useCallback(() => setDialog(null), []);

    /** Corre la prueba y deja su resultado en la tarjeta. */
    const runTest = async () => {
        setIsTesting(true);
        try {
            const result = await testPedidosYaConnection(token);
            setStatus((current) => (current ? { ...current, lastTest: result } : current));
        } catch (requestError) {
            handleFailure(requestError, "No pudimos probar la conexión.");
        } finally {
            setIsTesting(false);
        }
    };

    const probe = async () => {
        setError("");
        await runTest();
    };

    const toggleEnabled = async () => {
        if (!status) return;
        setIsBusy(true);
        setError("");

        try {
            setStatus(await setPedidosYaEnabled(token, !status.enabled));
        } catch (requestError) {
            handleFailure(requestError, "No pudimos cambiar el estado de PedidosYa.");
        } finally {
            setIsBusy(false);
        }
    };

    const changeEnvironment = async (environment: PedidosYaEnvironment) => {
        if (!status || status.environment === environment) return;
        setIsBusy(true);
        setError("");

        try {
            const next = await savePedidosYaConfig(token, { environment });
            setStatus(next);
            // Solo cambia la URL (la del otro ambiente ya no aplica); lo que se estaba escribiendo se queda
            setMiddlewareUrl(next.middlewareUrl);
        } catch (requestError) {
            handleFailure(requestError, "No pudimos cambiar el ambiente.");
        } finally {
            setIsBusy(false);
        }
    };

    /** Solo manda lo que cambió, así no se guarda como propio un valor por defecto. */
    const getChanges = (): IPedidosYaConfigInput => {
        if (!status) return {};
        const changes: IPedidosYaConfigInput = {};
        if (chainCode.trim() !== status.chainCode) changes.chainCode = chainCode.trim();
        if (remoteId.trim() !== status.remoteId) changes.remoteId = remoteId.trim();
        if (middlewareUrl.trim() !== status.middlewareUrl) changes.middlewareUrl = middlewareUrl.trim();
        const percent = parseCommission(commission);
        if (Number.isNaN(percent) || percent !== status.commissionPercent) changes.commissionPercent = percent;
        return changes;
    };

    const saveChanges = async () => {
        if (!status) return;
        const changes = getChanges();
        const percent = changes.commissionPercent;
        if (percent !== undefined && (Number.isNaN(percent) || percent < 0 || percent > 60)) {
            setError("La comisión va entre 0 y 60 %.");
            return;
        }
        if (status.environment === "production" && !middlewareUrl.trim()) {
            setError("En producción, la dirección del middleware es obligatoria.");
            return;
        }

        setIsBusy(true);
        setError("");

        try {
            const next = await savePedidosYaConfig(token, changes);
            setStatus(next);
            fillForm(next);
        } catch (requestError) {
            handleFailure(requestError, "No pudimos guardar los cambios.");
        } finally {
            setIsBusy(false);
        }
    };

    /** Guarda la clave y, salvo el secreto de los avisos, prueba la conexión. Lanza con el texto del fallo. */
    const saveSecret = async (name: PedidosYaSecretName, value: string) => {
        setError("");
        try {
            setStatus(await savePedidosYaConfig(token, { secrets: { [name]: value } }));
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                throw new Error("Tu sesión venció. Entra de nuevo.");
            }
            throw new Error(getErrorText(requestError, "No pudimos guardar la clave."));
        }
        if (name !== "webhookSecret") await runTest();
    };

    if (isLoading) {
        return (
            <section className="adm-band pya">
                <OpsSkeleton rows={4} label="Leyendo la conexión con PedidosYa…" />
            </section>
        );
    }

    if (!status) {
        return <section className="adm-band pya">{error ? <p className="adm-error">{error}</p> : null}</section>;
    }

    const isProduction = status.environment === "production";
    const isKeyMissing = !status.masterKeyReady;
    const test = status.lastTest;
    const pill = isKeyMissing
        ? { text: "Falta la llave maestra del servidor", tone: "crit" }
        : test?.ok
          ? { text: "Conectado", tone: "good" }
          : test
            ? { text: `Error: ${test.message}`, tone: "crit" }
            : { text: "Sin probar", tone: "idle" };

    const expiresInMinutes = test?.ok && test.expiresAt ? Math.ceil((new Date(test.expiresAt).getTime() - Date.now()) / 60000) : 0;
    const foundRow = SECRET_ROWS.find((row) => row.name === dialog);
    // Si todavía no hay valor guardado, el diálogo dice "Agregar" como el botón que lo abrió
    const dialogRow = foundRow && !status.secrets[foundRow.name].isSet
        ? { ...foundRow, title: foundRow.title.replace("Reemplazar", "Agregar") }
        : foundRow;
    const hasChanges = Object.keys(getChanges()).length > 0;

    const getDialogForm = (onDone: () => void) =>
        dialogRow ? (
            <SecretForm
                title={dialogRow.title}
                label={dialogRow.dialogLabel}
                isWebhook={dialogRow.name === "webhookSecret"}
                onSave={(value) => saveSecret(dialogRow.name, value)}
                onDone={onDone}
            />
        ) : null;

    return (
        <section className="adm-band pya">
            <p className="adm-band__sub">Las ventas aparecerán aquí cuando empiecen a llegar los pedidos.</p>

            <div className="adm-card pya-card">
                <div className="pya-head">
                    <div className="pya-head__text">
                        <h3 className="script">Conexión</h3>
                        <p className="adm-note">Solo admins. Las claves se guardan cifradas y no se pueden volver a ver.</p>
                    </div>
                    <label className="adm-switch">
                        <input
                            type="checkbox"
                            checked={status.enabled}
                            onChange={() => void toggleEnabled()}
                            disabled={isBusy || (!status.canEnable && !status.enabled)}
                        />
                        <span className="adm-switch__track" aria-hidden />
                        <span className="adm-switch__label">Activo</span>
                    </label>
                </div>

                <span className={`pya-pill is-${pill.tone}`} role="status">
                    <i aria-hidden />
                    {pill.text}
                </span>

                {!status.canEnable && !status.enabled && status.missing.length > 0 ? (
                    <p className="pya-missing">Para activarlo falta: {status.missing.join(", ")}.</p>
                ) : null}

                <fieldset className="pya-env">
                    <legend>Ambiente</legend>
                    <div className="adm-seg">
                        <button type="button" className="adm-seg__btn" aria-pressed={!isProduction} disabled={isBusy} onClick={() => void changeEnvironment("staging")}>
                            Pruebas
                        </button>
                        <button type="button" className="adm-seg__btn" aria-pressed={isProduction} disabled={isBusy} onClick={() => void changeEnvironment("production")}>
                            Producción
                        </button>
                    </div>
                </fieldset>

                {isProduction ? (
                    <label className="adm-form__row pya-url">
                        <span>Dirección del middleware <em>(obligatoria en producción)</em></span>
                        <input
                            className="adm-form__input pya-input"
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="https://…restaurant-partners.com"
                            value={middlewareUrl}
                            onChange={(event) => setMiddlewareUrl(event.target.value)}
                        />
                    </label>
                ) : (
                    <details className="pya-url pya-url--fold">
                        <summary>Dirección del middleware</summary>
                        <input
                            className="adm-form__input pya-input"
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Dirección del middleware"
                            value={middlewareUrl}
                            onChange={(event) => setMiddlewareUrl(event.target.value)}
                        />
                    </details>
                )}

                <ul className="pya-secrets">
                    {SECRET_ROWS.map((row) => {
                        const info = status.secrets[row.name];
                        return (
                            <li key={row.name} className="pya-secret">
                                <div className="pya-secret__text">
                                    <b>{row.label}</b>
                                    <span className={info.isSet && !info.readable ? "is-bad" : ""}>{getSecretText(status, row.name)}</span>
                                </div>
                                <button type="button" className="adm-btn" disabled={isKeyMissing || isBusy || isTesting} onClick={() => setDialog(row.name)}>
                                    {info.isSet ? "Reemplazar" : "Agregar"}
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <div className="pya-fields">
                    <label className="adm-form__row">
                        <span>Código de cadena</span>
                        <input
                            className="adm-form__input pya-input"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={80}
                            value={chainCode}
                            onChange={(event) => setChainCode(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>ID del local</span>
                        <input
                            className="adm-form__input pya-input"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={80}
                            value={remoteId}
                            onChange={(event) => setRemoteId(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Comisión estimada (%)</span>
                        <input
                            className="adm-form__input pya-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={commission}
                            onChange={(event) => setCommission(event.target.value)}
                        />
                    </label>
                </div>

                <div className={`pya-test ${test ? (test.ok ? "is-good" : "is-crit") : ""}`} role="status">
                    <i aria-hidden />
                    {isTesting
                        ? "Probando la conexión…"
                        : test
                          ? test.ok
                              ? `Conexión probada ${getWhenLabel(test.at)}.${expiresInMinutes > 0 ? ` La sesión con PedidosYa vence en ${expiresInMinutes} min y se renueva sola.` : ""}`
                              : `Último intento ${getWhenLabel(test.at)}: ${test.message}`
                          : "Todavía no se ha probado la conexión."}
                </div>

                {error ? <p className="adm-error" role="alert">{error}</p> : null}

                <div className="pya-actions">
                    <button type="button" className="adm-btn" disabled={isKeyMissing || isBusy || isTesting} onClick={() => void probe()}>
                        {isTesting ? "Probando…" : "Probar conexión"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--solid" disabled={isBusy || isTesting || !hasChanges} onClick={() => void saveChanges()}>
                        {isBusy ? "Guardando…" : "Guardar cambios"}
                    </button>
                </div>
            </div>

            {dialogRow && isNarrow ? (
                <FullSheet title={dialogRow.title} onClose={closeDialog}>
                    {(close) => getDialogForm(() => close())}
                </FullSheet>
            ) : null}

            {dialogRow && !isNarrow ? (
                <div className="adm-modal" role="dialog" aria-modal="true" aria-label={dialogRow.title}>
                    <div className="adm-modal__panel">{getDialogForm(closeDialog)}</div>
                </div>
            ) : null}
        </section>
    );
};
