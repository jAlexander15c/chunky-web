import { useState } from "react";
import { PiBellRingingBold, PiCheckBold, PiMusicNotesBold, PiWarningBold } from "react-icons/pi";

import {
    canUsePush,
    disableOrderPush,
    enableOrderPush,
    getNotificationPermission,
    isChimeSoundOn,
    isOrderPushEnabled,
    playChime,
    unlockChimeSound,
} from "@/helpers";

type NotifyTone = "offer" | "on" | "sound" | "blocked";

const NotifyCard = ({ tone, icon, title, text, children }: {
    tone: NotifyTone;
    icon: React.ReactNode;
    title: string;
    text: string;
    children?: React.ReactNode;
}) => (
    <section className={`order-notify order-notify--${tone}`} aria-live="polite">
        <div className="order-notify__row">
            <span className="order-notify__icon" aria-hidden>{icon}</span>
            <span>
                <strong>{title}</strong>
                <p>{text}</p>
            </span>
        </div>
        {children}
    </section>
);

/**
 * Avisos del pedido: push en Android/computadora (y iPhone con la web en inicio);
 * en Safari de iPhone, sonido mientras la pagina este abierta.
 */
export const OrderNotifyCard = ({ orderId }: { orderId: string }) => {
    const isPushPossible = canUsePush();
    const [isPushOn, setIsPushOn] = useState(() => isOrderPushEnabled(orderId));
    const [permission, setPermission] = useState(getNotificationPermission);
    const [isSoundOn, setIsSoundOn] = useState(isChimeSoundOn);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const turnSoundOn = async () => {
        const isOn = await unlockChimeSound();
        if (isOn) playChime();
        setIsSoundOn(isOn);
    };

    const turnPushOn = async () => {
        setIsSending(true);
        setError(null);
        // El audio tambien se habilita en este toque, para el aviso con la pagina abierta
        void unlockChimeSound().then(setIsSoundOn);
        const result = await enableOrderPush(orderId);
        setPermission(getNotificationPermission());
        setIsPushOn(result === "granted");
        if (result === "error") setError("No pudimos activar los avisos. Deja esta página abierta y te avisamos con un sonido.");
        setIsSending(false);
    };

    const turnPushOff = async () => {
        await disableOrderPush(orderId);
        setIsPushOn(false);
    };

    const soundButton = isSoundOn
        ? <p className="order-notify__done"><PiCheckBold aria-hidden /> Sonido activado. Deja esta página abierta.</p>
        : <button type="button" className="button button--primary button--block" onClick={turnSoundOn}>Activar sonido</button>;

    if (isPushPossible && isPushOn) {
        return (
            <NotifyCard tone="on" icon={<PiCheckBold />} title="Avisos activados" text="Te avisamos en este dispositivo cuando la cocina tome tu pedido y cuando esté listo. Puedes cerrar esta página.">
                <button type="button" className="order-notify__link" onClick={turnPushOff}>Desactivar avisos</button>
            </NotifyCard>
        );
    }

    if (isPushPossible && permission === "denied") {
        return (
            <NotifyCard tone="blocked" icon={<PiWarningBold />} title="Las notificaciones están bloqueadas" text="Actívalas en la configuración del navegador para este sitio, o deja esta página abierta y te avisamos con un sonido.">
                {soundButton}
            </NotifyCard>
        );
    }

    if (isPushPossible) {
        return (
            <NotifyCard tone="offer" icon={<PiBellRingingBold />} title="¿Te avisamos?" text="Te llega una notificación cuando la cocina tome tu pedido y cuando esté listo, aunque tengas el celular bloqueado.">
                {error && <p className="order-notify__error" role="alert">{error}</p>}
                <button type="button" className="button button--primary button--block" onClick={turnPushOn} disabled={isSending}>
                    {isSending ? "Activando…" : "Avísame cuando esté listo"}
                </button>
            </NotifyCard>
        );
    }

    // Safari de iPhone (sin la web en inicio) u otros navegadores sin push
    return (
        <NotifyCard tone="sound" icon={<PiMusicNotesBold />} title="Deja esta página abierta" text="Te avisamos con un sonido cuando la cocina tome tu pedido y cuando esté listo.">
            {soundButton}
        </NotifyCard>
    );
};
