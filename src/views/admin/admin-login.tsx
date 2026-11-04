import { useState } from "react";
import type { FormEvent } from "react";

import { HttpError, loginAdmin } from "@/helpers";
import type { IStaffLogin } from "@/helpers";
import { useChoosePin, useFaceIdLogin } from "@/hooks/useStaffAccess";

import { FaceIdLoginButton, InstallHint } from "../staff-access";

/* ============ Acceso con PIN o Face ID ============ */

interface IAdminLoginProps {
    /** viaPin: entró escribiendo el PIN (después se le ofrece Face ID). */
    onLogin: (login: IStaffLogin, viaPin: boolean) => void;
}

export const AdminLogin = ({ onLogin }: IAdminLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const faceId = useFaceIdLogin("admin", (login) => onLogin(login, false));

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSending) return;

        setIsSending(true);
        setError("");

        try {
            onLogin(await loginAdmin(pin), true);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos entrar.");
            setPin("");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="adm-gate">
            <form className="adm-gate__panel" onSubmit={submit}>
                <span className="script adm-gate__mark">Chunky Bites</span>
                <h1>Tablero</h1>
                <InstallHint />
                <FaceIdLoginButton kind="adm" faceId={faceId} />
                {faceId.isAvailable ? null : <p>Escribe tu PIN.</p>}

                <label htmlFor="admin-pin" className="adm-sr-only">PIN</label>
                <input
                    id="admin-pin"
                    className="adm-gate__input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus={!faceId.isAvailable}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
                />

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <button type="submit" className="adm-btn adm-btn--solid adm-btn--block" disabled={pin.length < 4 || isSending}>
                    {isSending ? "Entrando…" : "Entrar"}
                </button>
            </form>
        </div>
    );
};

/** Quien entró con el PIN que generó el sistema elige el suyo antes de ver el tablero. */
export const AdminChoosePin = ({ token, name, onChanged }: { token: string; name: string; onChanged: (login: IStaffLogin) => void }) => {
    const choose = useChoosePin("admin", token, onChanged);
    const isFirst = choose.step === "first";

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void choose.submit(choose.pin);
    };

    return (
        <div className="adm-gate">
            <form className="adm-gate__panel" onSubmit={submit}>
                <span className="script adm-gate__mark">Chunky Bites</span>
                <h1>{isFirst ? "Elige tu PIN" : "Repite tu PIN"}</h1>
                <div className="sa-steps" aria-hidden="true">
                    <i className="is-on" />
                    <i className={isFirst ? undefined : "is-on"} />
                </div>
                <p>
                    {isFirst
                        ? `Hola, ${name}. Escribe 6 números que recuerdes. Desde ahora entras con ese PIN o con Face ID.`
                        : "Escríbelo otra vez para confirmarlo."}
                </p>

                <label htmlFor="admin-new-pin" className="adm-sr-only">{isFirst ? "PIN nuevo" : "Repite el PIN"}</label>
                <input
                    key={choose.step}
                    id="admin-new-pin"
                    className="adm-gate__input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    autoFocus
                    value={choose.pin}
                    onChange={(event) => {
                        choose.setError("");
                        choose.setPin(event.target.value.replace(/\D/g, "").slice(0, choose.pinLength));
                    }}
                />

                {choose.error ? <p className="adm-gate__error" role="alert">{choose.error}</p> : null}

                <button
                    type="submit"
                    className="adm-btn adm-btn--solid adm-btn--block"
                    disabled={choose.pin.length !== choose.pinLength || choose.isSaving}
                >
                    {choose.isSaving ? "Guardando…" : isFirst ? "Seguir" : "Guardar PIN"}
                </button>
                <p className="sa-hint">No sirven 123456, 111111 ni parecidos.</p>
            </form>
        </div>
    );
};
