import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
    HttpError,
    createCollaborator,
    fetchCollaborators,
    resetCollaboratorPin,
    setCollaboratorActive,
} from "@/helpers";
import type { ICollaborator } from "@/helpers";

/** El PIN recién creado, que solo se ve una vez. */
interface IFreshPin {
    name: string;
    pin: string;
}

const formatLastLogin = (value: string | null) => {
    if (!value) return "nunca";

    const date = new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
    const clock = date.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

    if (days <= 0) return `hoy ${clock}`;
    if (days === 1) return `ayer ${clock}`;
    return `hace ${days} d`;
};

const NewCollaboratorDialog = ({
    onCreate,
    onClose,
}: {
    onCreate: (name: string) => Promise<void>;
    onClose: () => void;
}) => {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (name.trim().length < 2) {
            setError("El nombre necesita al menos dos letras.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onCreate(name.trim());
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo crear.");
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Nuevo colaborador">
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">Nuevo colaborador</h3>
                <p className="adm-modal__hint">
                    El PIN lo genera el sistema y se muestra una sola vez. Anótalo y entrégaselo.
                </p>

                <div className="adm-form">
                    <label className="adm-form__row adm-form__row--full">
                        <span>Nombre</span>
                        <input
                            id="collaborator-name"
                            className="adm-form__input"
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Marta R."
                        />
                    </label>
                </div>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Creando…" : "Crear y ver el PIN"}
                    </button>
                </div>
            </form>
        </div>
    );
};

/**
 * Quién puede entrar a /gestion. Cada persona tiene su PIN, y por eso cada compra,
 * conteo o merma queda con su nombre en el libro de movimientos.
 */
export const AdminCollaborators = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [collaborators, setCollaborators] = useState<ICollaborator[]>([]);
    const [freshPin, setFreshPin] = useState<IFreshPin | null>(null);
    const [error, setError] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const { collaborators: list } = await fetchCollaborators(token, signal);
                setCollaborators(list);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(
                    requestError instanceof HttpError ? requestError.message : "No pudimos cargar los colaboradores."
                );
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const resetPin = async (collaborator: ICollaborator) => {
        setBusyId(collaborator.id);
        try {
            const { pin } = await resetCollaboratorPin(token, collaborator.id);
            setFreshPin({ name: collaborator.name, pin });
            await load();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos regenerar el PIN.");
        } finally {
            setBusyId(null);
        }
    };

    const changeActive = async (collaborator: ICollaborator) => {
        setBusyId(collaborator.id);
        try {
            await setCollaboratorActive(token, collaborator.id, !collaborator.isActive);
            await load();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el estado.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Colaboradores</h2>
                <span className="adm-band__sub">Entran a /gestion con su PIN y solo cargan inventario</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-card">
                <div className="adm-card-head">
                    <div className="grow">
                        <h3 className="script">Quién puede cargar inventario</h3>
                        <p className="adm-note">Cada movimiento queda con el nombre de quien lo hizo.</p>
                    </div>
                    <button type="button" className="adm-btn adm-btn--solid" onClick={() => setIsCreating(true)}>
                        Nuevo colaborador
                    </button>
                </div>

                {freshPin ? (
                    <div className="adm-reveal" role="status">
                        <p>
                            <b>{freshPin.name}</b> ya puede entrar. Anota el PIN ahora: no se vuelve a mostrar.
                        </p>
                        <span className="adm-reveal__pin">{freshPin.pin}</span>
                        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setFreshPin(null)}>
                            Ya lo anoté
                        </button>
                    </div>
                ) : null}

                {error ? <p className="adm-error">{error}</p> : null}

                {collaborators.length === 0 ? (
                    <p className="adm-empty">
                        Nadie todavía. Al crear al primero, el sistema genera su PIN y con él entra a /gestion
                        para registrar compras, conteos y mermas.
                    </p>
                ) : (
                    <div className="adm-scroll">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Estado</th>
                                    <th>Último acceso</th>
                                    <th className="num">Registros hoy</th>
                                    <th aria-label="Acciones" />
                                </tr>
                            </thead>
                            <tbody>
                                {collaborators.map((collaborator) => (
                                    <tr key={collaborator.id} className={collaborator.isActive ? undefined : "is-off"}>
                                        <td className="adm-name">{collaborator.name}</td>
                                        <td>
                                            <span className={`adm-pill is-${collaborator.isActive ? "ok" : "idle"}`}>
                                                {collaborator.isActive ? "Activo" : "Desactivado"}
                                            </span>
                                        </td>
                                        <td>{formatLastLogin(collaborator.lastLoginAt)}</td>
                                        <td className="num">{collaborator.movementsToday}</td>
                                        <td className="adm-actions">
                                            <button
                                                type="button"
                                                className="adm-btn adm-btn--sm"
                                                onClick={() => void resetPin(collaborator)}
                                                disabled={busyId === collaborator.id}
                                            >
                                                Regenerar PIN
                                            </button>
                                            <button
                                                type="button"
                                                className="adm-btn adm-btn--sm"
                                                onClick={() => void changeActive(collaborator)}
                                                disabled={busyId === collaborator.id}
                                            >
                                                {collaborator.isActive ? "Desactivar" : "Reactivar"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isCreating ? (
                <NewCollaboratorDialog
                    onCreate={async (name) => {
                        const { pin } = await createCollaborator(token, name);
                        setFreshPin({ name, pin });
                        await load();
                    }}
                    onClose={() => setIsCreating(false)}
                />
            ) : null}
        </section>
    );
};
