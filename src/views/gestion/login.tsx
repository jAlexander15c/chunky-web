import { useCallback, useState } from "react";

import { HttpError, hasUsedFaceIdHere, loginGestion } from "@/helpers";
import type { IStaffLogin } from "@/helpers";
import { useChoosePin, useFaceIdLogin } from "@/hooks/useStaffAccess";

import { FaceIdLoginButton, InstallHint } from "../staff-access";

const PIN_LENGTH = 6;

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

interface IPinPadProps {
    pin: string;
    isBusy: boolean;
    /** Lo que se lee bajo los puntos: el error o "Entrando…". */
    status: string;
    onChange: (pin: string) => void;
    /** Con seis dígitos se envía solo: no hace falta buscar el botón con las manos ocupadas. */
    onComplete: (pin: string) => void;
}

/** Los puntos y el teclado grande de /gestion, para entrar y para elegir el PIN. */
const PinPad = ({ pin, isBusy, status, onChange, onComplete }: IPinPadProps) => {
    const pressKey = (key: string) => {
        if (isBusy) return;
        if (key === "⌫") {
            onChange(pin.slice(0, -1));
            return;
        }
        if (pin.length >= PIN_LENGTH) return;

        const next = pin + key;
        onChange(next);
        if (next.length === PIN_LENGTH) onComplete(next);
    };

    return (
        <>
            <div className="ges-dots" role="status" aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`}>
                {Array.from({ length: PIN_LENGTH }, (_value, index) => (
                    <span key={index} className={index < pin.length ? "is-on" : undefined} />
                ))}
            </div>

            <p className="ges-gate__error" role="alert">{status}</p>

            <div className="ges-keys">
                {PIN_KEYS.map((key, index) =>
                    key ? (
                        <button
                            key={key}
                            type="button"
                            className={`ges-key${key === "⌫" ? " ges-key--soft" : ""}`}
                            onClick={() => pressKey(key)}
                            disabled={isBusy}
                            aria-label={key === "⌫" ? "Borrar" : key}
                        >
                            {key}
                        </button>
                    ) : (
                        <span key={`vacio-${index}`} />
                    )
                )}
            </div>
        </>
    );
};

interface IGestionLoginProps {
    /** viaPin: entró escribiendo el PIN (después se le ofrece Face ID). */
    onLogin: (login: IStaffLogin, viaPin: boolean) => void;
}

export const GestionLogin = ({ onLogin }: IGestionLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const faceId = useFaceIdLogin("gestion", (login) => onLogin(login, false));

    const submit = useCallback(
        async (candidate: string) => {
            setIsSending(true);
            setError("");

            try {
                onLogin(await loginGestion(candidate), true);
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

    const isReturning = faceId.isAvailable && hasUsedFaceIdHere();

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
                <h1>{isReturning ? "Hola de nuevo" : "Entra con tu PIN"}</h1>
                <p>Es tuyo: lo que registres queda a tu nombre.</p>
                <InstallHint />
                <FaceIdLoginButton kind="ges" faceId={faceId} />

                <PinPad
                    pin={pin}
                    isBusy={isSending}
                    status={isSending ? "Entrando…" : error}
                    onChange={(next) => {
                        setError("");
                        setPin(next);
                    }}
                    onComplete={(next) => void submit(next)}
                />
            </div>
        </div>
    );
};

/** Quien entró con el PIN que generó el tablero elige el suyo, con el mismo teclado. */
export const GestionChoosePin = ({ token, name, onChanged }: { token: string; name: string; onChanged: (login: IStaffLogin) => void }) => {
    const choose = useChoosePin("gestion", token, onChanged);
    const isFirst = choose.step === "first";

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
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

                <PinPad
                    pin={choose.pin}
                    isBusy={choose.isSaving}
                    status={choose.isSaving ? "Guardando…" : choose.error}
                    onChange={(next) => {
                        choose.setError("");
                        choose.setPin(next);
                    }}
                    onComplete={(next) => void choose.submit(next)}
                />
                <p className="sa-hint">No sirven 123456, 111111 ni parecidos.</p>
            </div>
        </div>
    );
};
